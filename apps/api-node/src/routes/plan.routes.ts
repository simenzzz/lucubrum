/**
 * Plan routes for the Node orchestrator API.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { isValidUUID } from '../utils/validation';
import { youtubeService, SelectedResource, Node } from '../services/youtube.service';
import { planService, PlanServiceError } from '../services/plan.service';
import { curriculumClient, CurriculumServiceError } from '../services/curriculum-client';
import type { Plan } from '../services/curriculum-client';
import { CreatePlanRequestSchema } from '../validation/schemas';
import { getPlanWithNodes } from '../db/queries/plans';
import redis from '../db/redis';
import {
  insertResourcesForNode,
  hasResourcesForNode,
  getResourcesForPlan,
  ResourceInput,
} from '../db/queries/resources';
import { requireAuth } from '../middleware/auth.middleware';
import { upsertUserPlan } from '../db/queries/user-plans';

const router = Router();

// Apply requireAuth middleware to all routes
router.use(requireAuth);

// Type definitions for request/response
interface CreatePlanResponse {
  plan_id: string;
  plan: Plan;
}

interface GetPlanParams {
  planId: string;
}

interface GetPlanResponse {
  plan: Plan;
}

interface AttachResourcesParams {
  planId: string;
}

interface AttachResourcesQuery {
  force?: string;
}

interface AttachResourcesResponse {
  resources_by_node: Record<string, SelectedResource[]>;
  skipped_nodes?: string[];
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

// Type for cached plan with fact snapshot
interface CachedPlanWithMetadata {
  plan_id: string;
  plan: Plan;
  topic_normalized: string;
  domain_category: string;
  staleness_policy: string;
  factSnapshot: string[];
  created_at: string;
}

/**
 * POST /api/plan
 *
 * Create a new learning plan.
 * Uses normalization + caching with staleness detection.
 */
router.post(
  '/',
  async (
    req: Request,
    res: Response<CreatePlanResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate input with Zod
      const parseResult = CreatePlanRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        );
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: { validation_errors: errors },
          request_id: requestId,
        });
      }

      const { topic, user_level, plan_size } = parseResult.data;

      logger.info({ topic, user_level, plan_size, requestId }, 'Creating plan');

      // Step 1: Normalize topic
      const normalized = await curriculumClient.normalizeTopic({
        topic,
        request_id: requestId,
      });

      logger.info(
        { topic, normalized: normalized.topic_normalized, domain: normalized.domain_category, requestId },
        'Topic normalized'
      );

      // Step 2: Check cache using normalized topic
      const cacheKey = `plan:${normalized.topic_normalized}:${user_level}`;
      const cachedPlan = await redis.getJSON<CachedPlanWithMetadata>(cacheKey);

      if (cachedPlan) {
        logger.info({ cacheKey, planId: cachedPlan.plan_id, requestId }, 'Plan cache hit - returning cached plan');

        // Track user-plan relationship for cached plan
        await upsertUserPlan(req.user!.user_id, cachedPlan.plan_id);

        return res.status(201).json({
          plan_id: cachedPlan.plan_id, // Return the original plan_id from cache
          plan: cachedPlan.plan,
        });
      }

      logger.info({ cacheKey, requestId }, 'Plan cache miss - generating new plan');

      // Step 3: Generate, validate, and persist plan (single LLM call inside service)
      const result = await planService.createPlan(
        {
          topic,
          user_level,
          plan_size,
          user_id: req.user!.user_id,
        },
        requestId
      );

      // Step 4: Track user-plan relationship
      await upsertUserPlan(req.user!.user_id, result.plan_id);

      logger.info({ planId: result.plan_id, userId: req.user!.user_id, requestId }, 'Plan persisted to database');

      // Step 5: Get MCP facts for staleness tracking
      let factSnapshot: string[] = [];
      try {
        const factsResponse = await curriculumClient.getFacts({
          normalized_topic: normalized.topic_normalized,
          request_id: requestId,
        });
        factSnapshot = factsResponse.facts;
        logger.info({ factCount: factSnapshot.length, requestId }, 'MCP facts gathered');
      } catch (error) {
        // Log warning but don't fail - continue without facts
        logger.warn({ error, requestId }, 'Failed to get MCP facts, continuing without fact snapshot');
      }

      // Step 6: Cache the plan with metadata (including plan_id for consistent tracking)
      const cacheData: CachedPlanWithMetadata = {
        plan_id: result.plan_id,
        plan: result.plan,
        topic_normalized: normalized.topic_normalized,
        domain_category: normalized.domain_category,
        staleness_policy: normalized.staleness_policy,
        factSnapshot,
        created_at: new Date().toISOString(),
      };

      // Cache for 24 hours (will be checked for staleness before serving)
      await redis.setJSON(cacheKey, cacheData, 86400);
      logger.info({ cacheKey, planId: result.plan_id, factCount: factSnapshot.length, requestId }, 'Plan cached with plan_id');

      return res.status(201).json({
        plan_id: result.plan_id,
        plan: result.plan,
      });
    } catch (error) {
      // Handle curriculum service errors (from normalizeTopic — generatePlan errors are wrapped as PlanServiceError by the service)
      if (error instanceof CurriculumServiceError) {
        logger.error({ error, requestId }, 'Curriculum service error during plan creation');
        return res.status(error.statusCode).json({
          error: error.errorCode,
          message: error.message,
          details: error.details,
          request_id: requestId,
        });
      }

      // Handle plan service errors (from createPlan)
      if (error instanceof PlanServiceError) {
        logger.error({ error, requestId }, 'Plan creation failed');
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        });
      }

      // Unexpected error
      logger.error({ error, requestId }, 'Unexpected error creating plan');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * GET /api/plan/:planId
 *
 * Retrieve a plan by ID.
 */
router.get(
  '/:planId',
  async (
    req: Request<GetPlanParams>,
    res: Response<GetPlanResponse | ErrorResponse>
  ) => {
    const { planId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate UUID format
      if (!isValidUUID(planId)) {
        return res.status(400).json({
          error: 'INVALID_PLAN_ID',
          message: 'Plan ID must be a valid UUID',
          request_id: requestId,
        });
      }

      const plan = await planService.getPlan(planId);

      if (!plan) {
        return res.status(404).json({
          error: 'PLAN_NOT_FOUND',
          message: `Plan ${planId} not found`,
          request_id: requestId,
        });
      }

      // Track user-plan relationship on access
      await upsertUserPlan(req.user!.user_id, planId);

      return res.json({ plan });
    } catch (error) {
      logger.error({ error, planId, requestId }, 'Error retrieving plan');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * POST /api/plan/:planId/resources
 *
 * Attach YouTube resources to all nodes in a plan.
 * Uses transcript validation to filter irrelevant videos.
 *
 * Query params:
 * - force: If 'true', re-attach resources even if they already exist.
 */
router.post(
  '/:planId/resources',
  async (
    req: Request<AttachResourcesParams, unknown, unknown, AttachResourcesQuery>,
    res: Response<AttachResourcesResponse | ErrorResponse>
  ) => {
    const { planId } = req.params;
    const forceReattach = req.query.force === 'true';
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    logger.info({ planId, requestId, forceReattach }, 'Starting resource attachment');

    try {
      // Validate UUID format
      if (!isValidUUID(planId)) {
        return res.status(400).json({
          error: 'INVALID_PLAN_ID',
          message: 'Plan ID must be a valid UUID',
          request_id: requestId,
        });
      }

      // Fetch plan from database
      const planData = await getPlanWithNodes(planId);

      if (!planData) {
        return res.status(404).json({
          error: 'PLAN_NOT_FOUND',
          message: `Plan ${planId} not found`,
          request_id: requestId,
        });
      }

      const resourcesByNode: Record<string, SelectedResource[]> = {};
      const skippedNodes: string[] = [];

      // Process each node
      for (const nodeRow of planData.nodes) {
        // Check if resources already exist for this node
        const hasExisting = await hasResourcesForNode(planId, nodeRow.node_id);
        if (hasExisting && !forceReattach) {
          logger.debug(
            { planId, nodeId: nodeRow.node_id },
            'Node already has resources, skipping (use ?force=true to re-attach)'
          );
          skippedNodes.push(nodeRow.node_id);
          continue;
        }

        // Convert database row to Node format expected by YouTube service
        const node: Node = {
          node_id: nodeRow.node_id,
          title: nodeRow.title,
          objectives: nodeRow.objectives,
          prerequisites: nodeRow.prerequisites,
          estimated_minutes: nodeRow.estimated_minutes,
          tags: nodeRow.tags || undefined,
        };

        // Generate search queries based on node
        const searchQueries = generateSearchQueries(node);

        // Attach resources with transcript validation
        const resources = await youtubeService.attachResourcesForNode(
          node,
          planId,
          searchQueries,
          {
            validateTranscripts: isTranscriptValidationEnabled(),
            minRelevanceScore: getMinRelevanceScore(),
          }
        );

        // Persist resources to database
        if (resources.length > 0) {
          const resourceInputs: ResourceInput[] = resources.map((r) => ({
            video_id: r.videoId,
            title: r.title,
            channel_title: r.channelTitle,
            url: r.url,
            duration_seconds: r.durationSeconds,
            rank_score: r.rankScore,
            type: r.type,
            rationale: r.rationale,
          }));

          await insertResourcesForNode(planId, node.node_id, resourceInputs);
        }

        resourcesByNode[node.node_id] = resources;
      }

      logger.info(
        {
          planId,
          requestId,
          nodeCount: planData.nodes.length,
          processedNodes: Object.keys(resourcesByNode).length,
          skippedNodes: skippedNodes.length,
          totalResources: Object.values(resourcesByNode).flat().length,
        },
        'Resource attachment complete'
      );

      const response: AttachResourcesResponse = { resources_by_node: resourcesByNode };
      if (skippedNodes.length > 0) {
        response.skipped_nodes = skippedNodes;
      }

      return res.json(response);
    } catch (error) {
      logger.error({ planId, requestId, error }, 'Resource attachment failed');
      return res.status(500).json({
        error: 'RESOURCE_ATTACHMENT_FAILED',
        message: 'Failed to attach resources to plan',
        request_id: requestId,
      });
    }
  }
);

/**
 * GET /api/plan/:planId/resources
 *
 * Get all resources attached to a plan.
 */
router.get(
  '/:planId/resources',
  async (
    req: Request<GetPlanParams>,
    res: Response<{ resources_by_node: Record<string, SelectedResource[]> } | ErrorResponse>
  ) => {
    const { planId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate UUID format
      if (!isValidUUID(planId)) {
        return res.status(400).json({
          error: 'INVALID_PLAN_ID',
          message: 'Plan ID must be a valid UUID',
          request_id: requestId,
        });
      }

      // Check if plan exists
      const planData = await getPlanWithNodes(planId);
      if (!planData) {
        return res.status(404).json({
          error: 'PLAN_NOT_FOUND',
          message: `Plan ${planId} not found`,
          request_id: requestId,
        });
      }

      // Fetch resources from database
      const resourceRows = await getResourcesForPlan(planId);

      // Convert database rows to SelectedResource format
      const resourcesByNode: Record<string, SelectedResource[]> = {};
      for (const [nodeId, rows] of Object.entries(resourceRows)) {
        resourcesByNode[nodeId] = rows.map((row) => ({
          videoId: row.video_id,
          title: row.title,
          channelTitle: row.channel_title || '',
          url: row.url,
          durationSeconds: row.duration_seconds || 0,
          rankScore: row.rank_score,
          type: row.type,
          rationale: row.rationale || '',
        }));
      }

      return res.json({ resources_by_node: resourcesByNode });
    } catch (error) {
      logger.error({ error, planId, requestId }, 'Error retrieving resources');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

// Helper functions

/**
 * Generate search queries for a node.
 */
function generateSearchQueries(node: Node): string[] {
  const queries: string[] = [];

  // Base query from title
  queries.push(`${node.title} tutorial`);

  // Objective-based queries
  for (const objective of node.objectives.slice(0, 2)) {
    queries.push(objective);
  }

  // Tag-based query
  if (node.tags && node.tags.length > 0) {
    queries.push(`${node.tags[0]} ${node.title}`);
  }

  return queries.slice(0, 3); // Limit to 3 queries per node
}

/**
 * Check if transcript validation is enabled.
 */
function isTranscriptValidationEnabled(): boolean {
  return process.env.TRANSCRIPT_VALIDATION_ENABLED !== 'false';
}

/**
 * Get minimum relevance score from config.
 */
function getMinRelevanceScore(): number {
  return parseFloat(process.env.TRANSCRIPT_MIN_RELEVANCE_SCORE || '0.6');
}

export default router;
