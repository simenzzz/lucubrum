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
 */
router.delete(
  '/cache/plans',
  async (req: Request, res: Response<{ message: string; keys_deleted: number } | ErrorResponse>) => {
    const requestId = getRequestId(req);

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

      // Delete all found keys
      let deletedCount = 0;
      if (keys.length > 0) {
        deletedCount = await client.del(...keys);
      }

      logger.info(
        { requestId, keysDeleted: deletedCount, userId: req.user?.user_id },
        'Plan cache invalidated'
      );

      return res.json({
        message: 'Plan cache invalidated',
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

export default router;
