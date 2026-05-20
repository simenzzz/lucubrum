/**
 * Exercise routes for the Node orchestrator API.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { isValidUUID } from '../utils/validation';
import { exerciseService, ExerciseServiceError } from '../services/exercise.service';
import { CreateExercisesRequestSchema } from '../validation/schemas';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { enforceExerciseRegenLimit } from '../middleware/tier.middleware';
import { recordExerciseGenerationEvent } from '../db/queries/tier';
import { ExerciseRow } from '../db/queries/exercises';

const router = Router();

// Apply requireAuth middleware to all routes
router.use(requireAuth);

// Type definitions for request/response
interface ExerciseParams {
  planId: string;
  nodeId: string;
}

interface TransformedExercise {
  id: string;
  node_id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  correct_answer: unknown;
  rubric: string;
  difficulty: number;
}

interface ExerciseResponse {
  node_id: string;
  exercises: TransformedExercise[];
  cached?: boolean;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/**
 * Transform ExerciseRow (DB shape) to frontend-friendly shape:
 * - exercise_id → id
 * - include node_id on each exercise
 * - strip plan_id and created_at
 */
function transformExercise(row: ExerciseRow): TransformedExercise {
  return {
    id: row.exercise_id,
    node_id: row.node_id,
    type: row.type,
    prompt: row.prompt,
    choices: row.choices,
    correct_answer: row.correct_answer,
    rubric: row.rubric,
    difficulty: row.difficulty,
  };
}

/**
 * POST /api/plan/:planId/nodes/:nodeId/exercises
 *
 * Generate exercises for a node.
 * Returns cached exercises if they exist (unless ?force=true).
 */
router.post(
  '/:planId/nodes/:nodeId/exercises',
  rateLimit.exerciseGeneration(),
  enforceExerciseRegenLimit(),
  async (
    req: Request<ExerciseParams>,
    res: Response<ExerciseResponse | ErrorResponse>
  ) => {
    const { planId, nodeId } = req.params;
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

      // Validate node_id format
      if (!/^[a-z0-9_]{3,100}$/.test(nodeId)) {
        return res.status(400).json({
          error: 'INVALID_NODE_ID',
          message: 'Node ID must be 3-100 lowercase alphanumeric characters with underscores',
          request_id: requestId,
        });
      }

      // Validate input with Zod (optional body)
      const parseResult = CreateExercisesRequestSchema.safeParse(req.body || {});
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

      const { exercise_types, count, difficulty_target, force } = parseResult.data;

      logger.info(
        { planId, nodeId, requestId, force, exercise_types, count },
        'Generating exercises'
      );

      const result = await exerciseService.generateExercises(
        planId,
        nodeId,
        { exercise_types, count, difficulty_target },
        requestId,
        force ?? false
      );

      // Record exercise generation event for tier tracking
      if (!result.cached) {
        recordExerciseGenerationEvent(
          req.user!.user_id,
          planId,
          nodeId,
          force ?? false
        ).catch((error) => {
          logger.warn({ error, planId, nodeId }, 'Failed to record exercise generation event');
        });
      }

      logger.info(
        { planId, nodeId, requestId, exerciseCount: result.exercises.length, cached: result.cached },
        'Exercises response ready'
      );

      return res.json({
        node_id: nodeId,
        exercises: result.exercises.map(transformExercise),
        cached: result.cached,
      });
    } catch (error) {
      // Handle service errors
      if (error instanceof ExerciseServiceError) {
        logger.error({ error, planId, nodeId, requestId }, 'Exercise generation failed');
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        });
      }

      // Unexpected error
      logger.error({ error, planId, nodeId, requestId }, 'Unexpected error generating exercises');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * GET /api/plan/:planId/nodes/:nodeId/exercises
 *
 * Get exercises for a node.
 */
router.get(
  '/:planId/nodes/:nodeId/exercises',
  rateLimit.general(),
  async (
    req: Request<ExerciseParams>,
    res: Response<ExerciseResponse | ErrorResponse>
  ) => {
    const { planId, nodeId } = req.params;
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

      // Validate node_id format
      if (!/^[a-z0-9_]{3,100}$/.test(nodeId)) {
        return res.status(400).json({
          error: 'INVALID_NODE_ID',
          message: 'Node ID must be 3-100 lowercase alphanumeric characters with underscores',
          request_id: requestId,
        });
      }

      const exercises = await exerciseService.getExercises(planId, nodeId);

      return res.json({
        node_id: nodeId,
        exercises: exercises.map(transformExercise),
      });
    } catch (error) {
      logger.error({ error, planId, nodeId, requestId }, 'Error retrieving exercises');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

export default router;
