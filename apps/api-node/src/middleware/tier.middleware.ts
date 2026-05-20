/**
 * Tier enforcement middleware factories.
 *
 * Each factory returns Express middleware that checks a specific tier limit.
 * Pro users bypass all checks (their limits are Infinity → early next()).
 * All return 403 with a consistent TIER_LIMIT_EXCEEDED error shape.
 */

import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by tier middleware when a successful LLM-graded attempt should be counted. */
      tierQuotaApplies?: boolean;
    }
  }
}

import { getLimitsForUser, getTierForUser } from '../config/tier.config';
import { getExerciseById } from '../db/queries/exercises';
import * as tierService from '../services/tier.service';
import logger from '../utils/logger';

/**
 * Consistent 403 response for tier limit violations.
 */
function sendTierLimitError(
  res: Response,
  requestId: string,
  message: string,
  details: { tier: string; limit: number; current: number }
): void {
  res.status(403).json({
    error: 'TIER_LIMIT_EXCEEDED',
    message,
    details,
    request_id: requestId,
  });
}

function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || 'unknown';
}

/**
 * Enforce active plan count limit.
 * Attach after requireAuth on POST /api/plan.
 */
export function enforcePlanLimit(): any {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);
    const roles = req.user?.roles ?? [];
    const limits = getLimitsForUser(roles);

    if (!isFinite(limits.maxActivePlans)) {
      next();
      return;
    }

    try {
      const result = await tierService.canCreatePlan(
        req.user!.user_id,
        limits.maxActivePlans,
        limits.planHistoryDays
      );

      if (!result.allowed) {
        const tier = getTierForUser(roles);
        logger.info(
          { requestId, userId: req.user!.user_id, ...result },
          'Plan creation blocked by tier limit'
        );
        sendTierLimitError(res, requestId, 'Free plan limit reached for active plans', {
          tier,
          limit: result.limit,
          current: result.current,
        });
        return;
      }
    } catch (error) {
      // Fail closed on Postgres errors - DB errors should block access
      logger.error({ error, requestId }, 'Tier plan limit check failed, returning 503');
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Unable to verify plan limit. Please try again.',
        request_id: requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Enforce allowed plan sizes.
 * Reads plan_size from req.body.
 * Attach after requireAuth on POST /api/plan.
 */
export function enforcePlanSize(): any {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = getRequestId(req);

    // Guard: req.body must be parsed (express.json() must run before this middleware)
    if (!req.body) {
      logger.error({ requestId }, 'enforcePlanSize: req.body not parsed — check middleware ordering');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Server misconfiguration',
        request_id: requestId,
      });
      return;
    }

    const roles = req.user?.roles ?? [];
    const limits = getLimitsForUser(roles);
    const planSize = req.body.plan_size;

    if (!planSize || limits.allowedPlanSizes.includes(planSize)) {
      next();
      return;
    }

    logger.info(
      { requestId, userId: req.user?.user_id, planSize, allowed: limits.allowedPlanSizes },
      'Plan size blocked by tier limit'
    );
    sendTierLimitError(res, requestId, `Free plan does not allow plan size: ${planSize}`, {
      tier: 'free',
      limit: 0,
      current: 0,
    });
  };
}

/**
 * Enforce daily LLM-graded attempt quota.
 * Looks up exercise type — skips for MCQ / flashcard (locally graded).
 * Uses atomic reserve pattern (INCR first, then check).
 * Sets req.tierQuotaApplies = true so the route can rollback on failure.
 * Attach after requireAuth on POST /api/attempts.
 */
export function enforceDailyAttemptQuota(): any {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);
    const roles = req.user?.roles ?? [];
    const limits = getLimitsForUser(roles);

    if (!isFinite(limits.dailyLlmAttempts)) {
      next();
      return;
    }

    const exerciseId = req.body?.exercise_id;
    if (!exerciseId) {
      next();
      return;
    }

    // Fail closed on Postgres errors (exercise lookup)
    let exercise: Awaited<ReturnType<typeof getExerciseById>>;
    try {
      exercise = await getExerciseById(exerciseId);
    } catch (error) {
      logger.error({ error, requestId }, 'Exercise lookup failed during quota check, returning 503');
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Unable to verify exercise. Please try again.',
        request_id: requestId,
      });
      return;
    }

    if (!exercise || !tierService.isLlmGradedType(exercise.type)) {
      // MCQ, flashcard, or unknown — no LLM cost, skip quota check
      next();
      return;
    }

    // Fail open on Redis errors (quota reservation)
    try {
      const result = await tierService.reserveDailyLlmAttempt(
        req.user!.user_id,
        limits.dailyLlmAttempts
      );

      if (!result.allowed) {
        logger.info(
          { requestId, userId: req.user!.user_id, ...result },
          'Daily LLM attempt quota exceeded'
        );
        sendTierLimitError(res, requestId, 'Free plan daily LLM-graded attempt limit reached', {
          tier: 'free',
          limit: result.limit,
          current: result.current,
        });
        return;
      }

      // Signal to route handler: quota was reserved, rollback on grading failure
      req.tierQuotaApplies = true;
    } catch (error) {
      logger.warn({ error, requestId }, 'Tier daily attempt check failed, failing open');
    }

    next();
  };
}

/**
 * Enforce exam attempt limit per node.
 * Attach after requireAuth on POST /:planId/nodes/:nodeId/exam/start.
 */
export function enforceExamLimit(): any {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);
    const roles = req.user?.roles ?? [];
    const limits = getLimitsForUser(roles);

    if (!isFinite(limits.maxExamsPerNode)) {
      next();
      return;
    }

    const { planId, nodeId } = req.params;

    try {
      const result = await tierService.canStartExam(
        req.user!.user_id,
        planId,
        nodeId,
        limits.maxExamsPerNode
      );

      if (!result.allowed) {
        logger.info(
          { requestId, userId: req.user!.user_id, planId, nodeId, ...result },
          'Exam start blocked by tier limit'
        );
        sendTierLimitError(res, requestId, 'Free plan limit reached for exams per node', {
          tier: 'free',
          limit: result.limit,
          current: result.current,
        });
        return;
      }
    } catch (error) {
      // Fail closed on Postgres errors
      logger.error({ error, requestId }, 'Tier exam limit check failed, returning 503');
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Unable to verify exam limit. Please try again.',
        request_id: requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Enforce exercise regeneration limit.
 * Only fires when req.body.force === true (regeneration).
 * Attach after requireAuth on POST /:planId/nodes/:nodeId/exercises.
 */
export function enforceExerciseRegenLimit(): any {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only check for force regeneration
    if (!req.body?.force) {
      next();
      return;
    }

    const requestId = getRequestId(req);
    const roles = req.user?.roles ?? [];
    const limits = getLimitsForUser(roles);

    if (!isFinite(limits.exerciseRegenerations)) {
      next();
      return;
    }

    const { planId, nodeId } = req.params;

    try {
      const result = await tierService.canRegenerateExercises(
        req.user!.user_id,
        planId,
        nodeId,
        limits.exerciseRegenerations
      );

      if (!result.allowed) {
        logger.info(
          { requestId, userId: req.user!.user_id, planId, nodeId, ...result },
          'Exercise regeneration blocked by tier limit'
        );
        sendTierLimitError(res, requestId, 'Free plan does not allow exercise regeneration', {
          tier: 'free',
          limit: result.limit,
          current: result.current,
        });
        return;
      }
    } catch (error) {
      // Fail closed on Postgres errors
      logger.error({ error, requestId }, 'Tier exercise regen check failed, returning 503');
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Unable to verify regeneration limit. Please try again.',
        request_id: requestId,
      });
      return;
    }

    next();
  };
}
