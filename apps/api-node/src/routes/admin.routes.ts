/**
 * Admin routes for cache management, metrics, and LLM call logs.
 * All routes require admin role authentication.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { redis } from '../db/redis';
import {
  getLLMCallLogs,
  getSystemMetrics,
  getLLMOperations,
  getLLMProviders,
  LLMCallLogEntry,
  SystemMetrics,
} from '../db/queries/admin';
import {
  getAllStalenessPolicies,
  getStalenessPolicyById,
  createStalenessPolicy,
  updateStalenessPolicy,
  deactivateStalenessPolicy,
} from '../db/queries/staleness-policies';

const router = Router();

// Apply auth and admin role requirement to all admin routes
router.use(requireAuth);
router.use(requireRole('admin'));

/**
 * Error response structure.
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
  timestamp: string;
}

/**
 * Get request ID from headers or generate one.
 */
function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || uuidv4();
}

// ==================== Cache Management ====================

/**
 * DELETE /admin/cache/youtube
 * Invalidate YouTube-related cache entries.
 */
router.delete(
  '/cache/youtube',
  async (req: Request, res: Response<{ message: string; keys_deleted: number } | ErrorResponse>) => {
    const requestId = getRequestId(req);

    try {
      // Get all YouTube-related cache keys
      // YouTube cache keys are prefixed with 'youtube:' by the redis client (which adds 'lh:' prefix)
      const client = redis.getClient();
      if (!client) {
        return res.status(503).json({
          error: 'CACHE_UNAVAILABLE',
          message: 'Redis cache is not available',
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // Scan for YouTube cache keys
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [newCursor, foundKeys] = await client.scan(
          cursor,
          'MATCH',
          'lh:youtube:*',
          'COUNT',
          100
        );
        cursor = newCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');

      // Delete all found keys
      let deletedCount = 0;
      if (keys.length > 0) {
        deletedCount = await client.del(...keys);
      }

      logger.info(
        { requestId, keysDeleted: deletedCount, userId: req.user?.user_id },
        'YouTube cache invalidated'
      );

      return res.json({
        message: 'YouTube cache invalidated',
        keys_deleted: deletedCount,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to invalidate YouTube cache');
      return res.status(500).json({
        error: 'CACHE_INVALIDATION_FAILED',
        message: 'Failed to invalidate YouTube cache',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /admin/cache/plans
 * Invalidate plan-related cache entries.
 * Query params:
 *   - topic: If provided, only delete plans matching this normalized topic (partial match)
 */
router.delete(
  '/cache/plans',
  async (req: Request, res: Response<{ message: string; keys_deleted: number } | ErrorResponse>) => {
    const requestId = getRequestId(req);
    const topic = req.query.topic as string | undefined;

    try {
      const client = redis.getClient();
      if (!client) {
        return res.status(503).json({
          error: 'CACHE_UNAVAILABLE',
          message: 'Redis cache is not available',
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // Scan for plan cache keys
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [newCursor, foundKeys] = await client.scan(
          cursor,
          'MATCH',
          'lh:plan:*',
          'COUNT',
          100
        );
        cursor = newCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');

      // Filter by topic if provided
      let keysToDelete = keys;
      if (topic) {
        // Plan cache key format: lh:plan:{normalized_topic}:{user_level}:{plan_size}
        const topicLower = topic.toLowerCase();
        keysToDelete = keys.filter((key) => {
          // Extract topic from key (format: lh:plan:topic:level)
          const parts = key.split(':');
          if (parts.length >= 3) {
            const keyTopic = parts[2];
            return keyTopic.includes(topicLower);
          }
          return false;
        });
      }

      // Delete all found keys
      let deletedCount = 0;
      if (keysToDelete.length > 0) {
        deletedCount = await client.del(...keysToDelete);
      }

      logger.info(
        { requestId, keysDeleted: deletedCount, userId: req.user?.user_id, topic },
        'Plan cache invalidated'
      );

      return res.json({
        message: topic
          ? `Plan cache invalidated for topic: ${topic}`
          : 'Plan cache invalidated',
        keys_deleted: deletedCount,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to invalidate plan cache');
      return res.status(500).json({
        error: 'CACHE_INVALIDATION_FAILED',
        message: 'Failed to invalidate plan cache',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /admin/cache/plans/:cacheKey
 * Invalidate a specific plan cache entry by cache key.
 * The cache key should be the part after 'lh:' prefix (e.g., 'plan:machine_learning:beginner:moderate')
 */
router.delete(
  '/cache/plans/:cacheKey',
  async (
    req: Request,
    res: Response<{ message: string; deleted: boolean } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);
    const { cacheKey } = req.params;

    try {
      const client = redis.getClient();
      if (!client) {
        return res.status(503).json({
          error: 'CACHE_UNAVAILABLE',
          message: 'Redis cache is not available',
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // Use cacheKey directly - it already includes the 'plan:' prefix
      const fullKey = cacheKey;

      // Check if key exists
      const exists = await client.exists(fullKey);
      if (!exists) {
        return res.status(404).json({
          error: 'KEY_NOT_FOUND',
          message: `Cache key not found: ${cacheKey}`,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // Delete the key
      await client.del(fullKey);

      logger.info(
        { requestId, cacheKey, userId: req.user?.user_id },
        'Plan cache key deleted'
      );

      return res.json({
        message: 'Cache key deleted',
        deleted: true,
      });
    } catch (error) {
      logger.error({ error, requestId, cacheKey }, 'Failed to delete cache key');
      return res.status(500).json({
        error: 'CACHE_DELETION_FAILED',
        message: 'Failed to delete cache key',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ==================== LLM Call Logs ====================

/**
 * GET /admin/llm-calls
 * Query LLM call logs with pagination and filtering.
 */
router.get(
  '/llm-calls',
  async (
    req: Request,
    res: Response<
      | { logs: LLMCallLogEntry[]; total: number; limit: number; offset: number }
      | ErrorResponse
    >
  ) => {
    const requestId = getRequestId(req);

    try {
      // Parse pagination params
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      // Parse filter params
      const filters: {
        operation?: string;
        provider?: string;
        status?: string;
        since?: Date;
      } = {};

      if (req.query.operation && typeof req.query.operation === 'string') {
        filters.operation = req.query.operation;
      }

      if (req.query.provider && typeof req.query.provider === 'string') {
        filters.provider = req.query.provider;
      }

      if (req.query.status && typeof req.query.status === 'string') {
        filters.status = req.query.status;
      }

      if (req.query.since && typeof req.query.since === 'string') {
        const sinceDate = new Date(req.query.since);
        if (!isNaN(sinceDate.getTime())) {
          filters.since = sinceDate;
        }
      }

      const { logs, total } = await getLLMCallLogs(limit, offset, filters);

      return res.json({
        logs,
        total,
        limit,
        offset,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to fetch LLM call logs');
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch LLM call logs',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /admin/llm-calls/filters
 * Get available filter options for LLM call logs.
 */
router.get(
  '/llm-calls/filters',
  async (
    req: Request,
    res: Response<{ operations: string[]; providers: string[] } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);

    try {
      const [operations, providers] = await Promise.all([
        getLLMOperations(),
        getLLMProviders(),
      ]);

      return res.json({
        operations,
        providers,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to fetch LLM call filters');
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch LLM call filters',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ==================== Metrics ====================

/**
 * GET /admin/metrics
 * Get system-wide metrics.
 */
router.get(
  '/metrics',
  async (req: Request, res: Response<{ metrics: SystemMetrics } | ErrorResponse>) => {
    const requestId = getRequestId(req);

    try {
      const metrics = await getSystemMetrics();

      return res.json({
        metrics,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to fetch system metrics');
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch system metrics',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /admin/cache/stats
 * Get Redis cache statistics.
 */
router.get(
  '/cache/stats',
  async (
    req: Request,
    res: Response<
      | {
          connected: boolean;
          memory_used?: string;
          keys_count?: number;
          uptime_seconds?: number;
        }
      | ErrorResponse
    >
  ) => {
    const requestId = getRequestId(req);

    try {
      const client = redis.getClient();
      if (!client || !redis.isReady()) {
        return res.json({
          connected: false,
        });
      }

      // Get Redis info
      const info = await client.info('memory');
      const keyspace = await client.info('keyspace');
      const server = await client.info('server');

      // Parse memory usage
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1] : undefined;

      // Parse key count from keyspace info
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const keysCount = keysMatch ? parseInt(keysMatch[1], 10) : 0;

      // Parse uptime
      const uptimeMatch = server.match(/uptime_in_seconds:(\d+)/);
      const uptimeSeconds = uptimeMatch ? parseInt(uptimeMatch[1], 10) : undefined;

      return res.json({
        connected: true,
        memory_used: memoryUsed,
        keys_count: keysCount,
        uptime_seconds: uptimeSeconds,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to fetch cache stats');
      return res.status(500).json({
        error: 'CACHE_ERROR',
        message: 'Failed to fetch cache statistics',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ==================== Staleness Policies Management ====================

/**
 * GET /admin/staleness-policies
 * Get all active staleness policies.
 */
router.get(
  '/staleness-policies',
  async (
    req: Request,
    res: Response<{ policies: unknown[] } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);

    try {
      const policies = await getAllStalenessPolicies();
      return res.json({ policies });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to fetch staleness policies');
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch staleness policies',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /admin/staleness-policies/:id
 * Get a specific staleness policy by ID.
 */
router.get(
  '/staleness-policies/:id',
  async (
    req: Request,
    res: Response<{ policy: unknown } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);
    const { id } = req.params;
    const policyId = parseInt(id, 10);

    if (isNaN(policyId)) {
      return res.status(400).json({
        error: 'INVALID_ID',
        message: 'Policy ID must be a number',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const policy = await getStalenessPolicyById(policyId);
      if (!policy) {
        return res.status(404).json({
          error: 'POLICY_NOT_FOUND',
          message: `Staleness policy ${policyId} not found`,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({ policy });
    } catch (error) {
      logger.error({ error, requestId, policyId }, 'Failed to fetch staleness policy');
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch staleness policy',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /admin/staleness-policies
 * Create a new staleness policy.
 */
router.post(
  '/staleness-policies',
  async (
    req: Request,
    res: Response<{ policy: unknown } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);

    try {
      const { domain_category, policy_value, description } = req.body;

      if (!domain_category || !policy_value) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'domain_category and policy_value are required',
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      const policy = await createStalenessPolicy({
        domain_category,
        policy_value,
        description,
      });

      logger.info(
        { requestId, policyId: policy.id, userId: req.user?.user_id },
        'Staleness policy created'
      );

      return res.status(201).json({ policy });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to create staleness policy');

      // Check for unique constraint violation
      if ((error as any).code === '23505') {
        return res.status(409).json({
          error: 'DUPLICATE_POLICY',
          message: 'A policy with this domain_category already exists',
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to create staleness policy',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /admin/staleness-policies/:id
 * Update a staleness policy.
 */
router.put(
  '/staleness-policies/:id',
  async (
    req: Request,
    res: Response<{ policy: unknown } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);
    const { id } = req.params;
    const policyId = parseInt(id, 10);

    if (isNaN(policyId)) {
      return res.status(400).json({
        error: 'INVALID_ID',
        message: 'Policy ID must be a number',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const { domain_category, policy_value, description, is_active } = req.body;

      const policy = await updateStalenessPolicy(policyId, {
        domain_category,
        policy_value,
        description,
        is_active,
      });

      if (!policy) {
        return res.status(404).json({
          error: 'POLICY_NOT_FOUND',
          message: `Staleness policy ${policyId} not found`,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(
        { requestId, policyId, userId: req.user?.user_id },
        'Staleness policy updated'
      );

      return res.json({ policy });
    } catch (error) {
      logger.error({ error, requestId, policyId }, 'Failed to update staleness policy');

      // Check for unique constraint violation
      if ((error as any).code === '23505') {
        return res.status(409).json({
          error: 'DUPLICATE_POLICY',
          message: 'A policy with this domain_category already exists',
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to update staleness policy',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /admin/staleness-policies/:id
 * Deactivate a staleness policy (soft delete).
 */
router.delete(
  '/staleness-policies/:id',
  async (
    req: Request,
    res: Response<{ message: string; deleted: boolean } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);
    const { id } = req.params;
    const policyId = parseInt(id, 10);

    if (isNaN(policyId)) {
      return res.status(400).json({
        error: 'INVALID_ID',
        message: 'Policy ID must be a number',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const deleted = await deactivateStalenessPolicy(policyId);

      if (!deleted) {
        return res.status(404).json({
          error: 'POLICY_NOT_FOUND',
          message: `Staleness policy ${policyId} not found`,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(
        { requestId, policyId, userId: req.user?.user_id },
        'Staleness policy deactivated'
      );

      return res.json({
        message: 'Staleness policy deactivated',
        deleted: true,
      });
    } catch (error) {
      logger.error({ error, requestId, policyId }, 'Failed to deactivate staleness policy');
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to deactivate staleness policy',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /admin/staleness-policies/reload
 * Force reload staleness policies cache in Python service.
 * This should be called after policies are updated.
 */
router.post(
  '/staleness-policies/reload',
  async (
    req: Request,
    res: Response<{ message: string } | ErrorResponse>
  ) => {
    const requestId = getRequestId(req);

    try {
      // Call Python service to invalidate and reload policy cache
      // Note: This endpoint would need to be added to the Python service
      // For now, we'll log and return success - the Python service auto-reloads every 5 minutes
      logger.info(
        { requestId, userId: req.user?.user_id },
        'Staleness policies cache reload requested'
      );

      // TODO: Call Python service endpoint to force reload
      // await curriculumClient.reloadStalenessPolicies();

      return res.json({
        message: 'Staleness policies cache reload requested. Policies will auto-reload within 5 minutes.',
      });
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to reload staleness policies');
      return res.status(500).json({
        error: 'RELOAD_FAILED',
        message: 'Failed to reload staleness policies',
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
