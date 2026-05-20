/**
 * Exam routes for timed assessments.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { isValidUUID } from '../utils/validation';
import { examService, ExamServiceError, StartExamResult, SubmitExamResult } from '../services/exam.service';
import { StartExamRequestSchema, SubmitExamRequestSchema } from '../validation/schemas';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { enforceExamLimit } from '../middleware/tier.middleware';

const router = Router();

// Apply requireAuth middleware to all routes
router.use(requireAuth);

// Type definitions for request parameters
interface ExamParams {
  planId: string;
  nodeId: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/**
 * POST /api/plan/:planId/nodes/:nodeId/exam/start
 *
 * Start a new exam session for a node.
 */
router.post(
  '/:planId/nodes/:nodeId/exam/start',
  rateLimit.general(),
  enforceExamLimit(),
  async (
    req: Request<ExamParams>,
    res: Response<StartExamResult | ErrorResponse>
  ) => {
    const { planId, nodeId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'User not authenticated',
        request_id: requestId,
      });
    }

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

      // Validate input with Zod
      const parseResult = StartExamRequestSchema.safeParse(req.body || {});
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

      const { time_limit_seconds } = parseResult.data;

      logger.info(
        { planId, nodeId, userId, requestId, time_limit_seconds },
        'Starting exam'
      );

      const result = await examService.startExam(
        userId,
        planId,
        nodeId,
        { time_limit_seconds },
        requestId
      );

      logger.info(
        { planId, nodeId, userId, requestId, sessionId: result.session_id },
        'Exam started'
      );

      return res.json(result);
    } catch (error) {
      // Handle service errors
      if (error instanceof ExamServiceError) {
        logger.error({ error, planId, nodeId, requestId }, 'Exam start failed');
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        });
      }

      // Unexpected error
      logger.error({ error, planId, nodeId, requestId }, 'Unexpected error starting exam');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * POST /api/plan/:planId/nodes/:nodeId/exam/submit
 *
 * Submit exam answers and get results.
 */
router.post(
  '/:planId/nodes/:nodeId/exam/submit',
  rateLimit.general(),
  async (
    req: Request<ExamParams>,
    res: Response<SubmitExamResult | ErrorResponse>
  ) => {
    const { planId, nodeId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'User not authenticated',
        request_id: requestId,
      });
    }

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

      // Validate input with Zod
      const parseResult = SubmitExamRequestSchema.safeParse(req.body);
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

      const { session_id, answers } = parseResult.data;

      logger.info(
        { planId, nodeId, userId, requestId, sessionId: session_id, answerCount: answers.length },
        'Submitting exam'
      );

      const result = await examService.submitExam(
        userId,
        planId,
        nodeId,
        session_id,
        answers,
        requestId
      );

      logger.info(
        {
          planId,
          nodeId,
          userId,
          requestId,
          attemptId: result.exam_attempt_id,
          score: result.score,
        },
        'Exam submitted'
      );

      return res.json(result);
    } catch (error) {
      // Handle service errors
      if (error instanceof ExamServiceError) {
        logger.error({ error, planId, nodeId, requestId }, 'Exam submission failed');
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        });
      }

      // Unexpected error
      logger.error({ error, planId, nodeId, requestId }, 'Unexpected error submitting exam');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

export default router;
