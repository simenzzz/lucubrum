/**
 * Mastery routes for the Node orchestrator API.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { isValidUUID } from '../utils/validation';
import { masteryService, MasteryServiceError, GetMasteryResult } from '../services/mastery.service';
import { SubmitAttemptRequestSchema } from '../validation/schemas';
import { requireAuth } from '../middleware/auth.middleware';
import { Grade } from '../services/curriculum-client';

const router = Router();

// Apply requireAuth middleware to all routes
router.use(requireAuth);

// Type definitions for request/response
interface MasteryParams {
  planId: string;
  nodeId: string;
}

interface SubmitAttemptResponse {
  attempt_id: string;
  grade: {
    score: number;
    is_correct: boolean;
    feedback: string;
    misconceptions: string[] | null;
  };
  mastery: {
    score: number;
    level: string;
    total_attempts: number;
  };
}

interface GetNodeMasteryResponse {
  mastery: GetMasteryResult;
}

interface GetPlanMasteryResponse {
  mastery_by_node: Record<string, GetMasteryResult>;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/**
 * POST /api/attempts
 *
 * Submit and grade an answer, updating mastery.
 */
router.post(
  '/attempts',
  async (
    req: Request,
    res: Response<SubmitAttemptResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const userId = req.user!.user_id;

    try {
      // Validate input with Zod
      const parseResult = SubmitAttemptRequestSchema.safeParse(req.body);
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

      const { plan_id, node_id, exercise_id, user_answer } = parseResult.data;

      logger.info(
        { userId, planId: plan_id, nodeId: node_id, exerciseId: exercise_id, requestId },
        'Submitting attempt'
      );

      const result = await masteryService.submitAttempt(
        userId,
        { plan_id, node_id, exercise_id, user_answer },
        requestId
      );

      logger.info(
        {
          userId,
          attemptId: result.attempt_id,
          score: result.grade.score,
          isCorrect: result.grade.is_correct,
          masteryScore: result.mastery.score,
          requestId,
        },
        'Attempt processed'
      );

      return res.status(201).json({
        attempt_id: result.attempt_id,
        grade: {
          score: result.grade.score,
          is_correct: result.grade.is_correct,
          feedback: result.grade.feedback,
          misconceptions: result.grade.misconceptions,
        },
        mastery: result.mastery,
      });
    } catch (error) {
      // Handle service errors
      if (error instanceof MasteryServiceError) {
        logger.error({ error, requestId }, 'Attempt submission failed');
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        });
      }

      // Unexpected error
      logger.error({ error, requestId }, 'Unexpected error submitting attempt');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * GET /api/plan/:planId/nodes/:nodeId/mastery
 *
 * Get mastery for a specific node.
 */
router.get(
  '/plan/:planId/nodes/:nodeId/mastery',
  async (
    req: Request<MasteryParams>,
    res: Response<GetNodeMasteryResponse | ErrorResponse>
  ) => {
    const { planId, nodeId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const userId = req.user!.user_id;

    try {
      // Validate UUID format
      if (!isValidUUID(planId)) {
        return res.status(400).json({
          error: 'INVALID_PLAN_ID',
          message: 'Plan ID must be a valid UUID',
          request_id: requestId,
        });
      }

      // Validate node_id format
      if (!/^[a-z0-9_]{3,100}$/.test(nodeId)) {
        return res.status(400).json({
          error: 'INVALID_NODE_ID',
          message: 'Node ID must be 3-100 lowercase alphanumeric characters with underscores',
          request_id: requestId,
        });
      }

      const mastery = await masteryService.getNodeMastery(userId, planId, nodeId);

      return res.json({ mastery });
    } catch (error) {
      logger.error({ error, planId, nodeId, requestId }, 'Error retrieving node mastery');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * GET /api/plan/:planId/mastery
 *
 * Get mastery overview for all nodes in a plan.
 */
router.get(
  '/plan/:planId/mastery',
  async (
    req: Request<{ planId: string }>,
    res: Response<GetPlanMasteryResponse | ErrorResponse>
  ) => {
    const { planId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const userId = req.user!.user_id;

    try {
      // Validate UUID format
      if (!isValidUUID(planId)) {
        return res.status(400).json({
          error: 'INVALID_PLAN_ID',
          message: 'Plan ID must be a valid UUID',
          request_id: requestId,
        });
      }

      const masteryByNode = await masteryService.getPlanMastery(userId, planId);

      return res.json({ mastery_by_node: masteryByNode });
    } catch (error) {
      logger.error({ error, planId, requestId }, 'Error retrieving plan mastery');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

export default router;
