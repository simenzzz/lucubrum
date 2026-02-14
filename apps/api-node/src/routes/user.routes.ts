/**
 * User routes for the Node orchestrator API.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { isValidUserId } from '../utils/validation';
import { requireAuth } from '../middleware/auth.middleware';
import { getUserPlansWithDetails, PaginatedUserPlans } from '../db/queries/user-plans';

const router = Router();

// Apply requireAuth middleware to all routes
router.use(requireAuth);

// Type definitions for request/response
interface GetUserPlansParams {
  userId: string;
}

interface GetUserPlansQuery {
  limit?: string;
  offset?: string;
}

interface GetUserPlansResponse {
  plans: Array<{
    plan_id: string;
    topic: string;
    user_level: string;
    plan_size: string;
    started_at: string;
    last_accessed_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/**
 * GET /api/users/:userId/plans
 *
 * List all plans for a user with pagination.
 * Users can only access their own plans unless they have admin role.
 */
router.get(
  '/:userId/plans',
  async (
    req: Request<GetUserPlansParams, unknown, unknown, GetUserPlansQuery>,
    res: Response<GetUserPlansResponse | ErrorResponse>
  ) => {
    const { userId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate user ID format (alphanumeric, can be Google OAuth numeric ID)
      if (!isValidUserId(userId)) {
        return res.status(400).json({
          error: 'INVALID_USER_ID',
          message: 'User ID must be a non-empty alphanumeric string',
          request_id: requestId,
        });
      }

      // Authorization: users can only access their own plans unless admin
      // Note: requireAuth middleware guarantees req.user exists at this point,
      // but we add defensive checks for safety
      if (!req.user) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
          request_id: requestId,
        });
      }

      const isAdmin = req.user.roles.includes('admin');
      if (req.user.user_id !== userId && !isAdmin) {
        logger.warn(
          { requestId, requestedUserId: userId, actualUserId: req.user.user_id },
          'User attempted to access another user\'s plans'
        );
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You can only access your own plans',
          request_id: requestId,
        });
      }

      // Parse and validate pagination parameters
      const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 100);
      const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);

      logger.info({ userId, limit, offset, requestId }, 'Fetching user plans');

      // Fetch plans with details
      const result: PaginatedUserPlans = await getUserPlansWithDetails(userId, limit, offset);

      // Format dates as ISO strings for the response
      const plans = result.plans.map((plan) => ({
        plan_id: plan.plan_id,
        topic: plan.topic,
        user_level: plan.user_level,
        plan_size: plan.plan_size,
        started_at: plan.started_at.toISOString(),
        last_accessed_at: plan.last_accessed_at.toISOString(),
      }));

      logger.info(
        { userId, planCount: plans.length, total: result.total, requestId },
        'User plans fetched successfully'
      );

      return res.json({
        plans,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      logger.error({ error, userId, requestId }, 'Error fetching user plans');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

export default router;
