/**
 * Tier service for quota checks and daily LLM attempt tracking.
 *
 * Uses Redis for daily counters (auto-expire at midnight UTC)
 * and Postgres for plan/exam/regen counts.
 * Fails open on Redis errors (same pattern as rate limiter).
 */

import { redis } from '../db/redis';
import logger from '../utils/logger';
import {
  countActivePlansForUser,
  countExamAttemptsForNode,
  countExerciseRegensForNode,
} from '../db/queries/tier';

/** Exercise types that require LLM grading (and thus count toward daily quota). */
const LLM_GRADED_TYPES = new Set(['short_answer', 'fill_blank', 'coding']);

export interface QuotaCheckResult {
  readonly allowed: boolean;
  readonly current: number;
  readonly limit: number;
}

/**
 * Check if an exercise type requires LLM grading.
 */
export function isLlmGradedType(type: string): boolean {
  return LLM_GRADED_TYPES.has(type);
}

/**
 * Build the Redis key for daily LLM attempt tracking.
 */
function dailyAttemptKey(userId: string, dateStr: string): string {
  return `tier:attempts:daily:${userId}:${dateStr}`;
}

/**
 * Get today's date string in YYYY-MM-DD format (UTC).
 */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculate seconds remaining until midnight UTC.
 */
function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

/**
 * Get the current daily LLM attempt count for a user.
 * Fails open (returns 0) on Redis errors.
 */
export async function getDailyLlmAttemptCount(userId: string): Promise<number> {
  try {
    const client = redis.getClient();
    if (!client || !redis.isReady()) {
      return 0;
    }
    const key = dailyAttemptKey(userId, todayUTC());
    const value = await client.get(key);
    return value ? parseInt(value, 10) : 0;
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to get daily LLM attempt count, failing open');
    return 0;
  }
}

/**
 * Reserve a daily LLM attempt using atomic INCR.
 * This is the single atomic operation that both checks AND increments the counter.
 * If over limit, increments are rolled back via DECR.
 *
 * Returns { allowed: true } when reservation succeeds (counter was below limit).
 * Returns { allowed: false } when quota is exceeded (counter now at or above limit).
 *
 * Sets TTL on first increment (when newCount === 1).
 * Fails open (returns allowed: true) on Redis errors.
 */
export async function reserveDailyLlmAttempt(
  userId: string,
  limit: number
): Promise<QuotaCheckResult> {
  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit };
  }

  try {
    const client = redis.getClient();
    if (!client || !redis.isReady()) {
      // Fail open when Redis is unavailable
      return { allowed: true, current: 0, limit };
    }

    const key = dailyAttemptKey(userId, todayUTC());
    const ttl = secondsUntilMidnightUTC();

    // Atomic INCR returns the new count (1-indexed)
    const newCount = await client.incr(key);

    // Set TTL on first increment (key just created)
    if (newCount === 1) {
      await client.expire(key, ttl);
    }

    // Check if over limit after increment
    if (newCount > limit) {
      // Over limit: roll back the increment immediately
      await client.decr(key);
      return { allowed: false, current: newCount - 1, limit };
    }

    // Under limit: reservation successful
    return { allowed: true, current: newCount, limit };
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to reserve daily LLM attempt, failing open');
    return { allowed: true, current: 0, limit };
  }
}

/**
 * Rollback a daily LLM attempt reservation.
 * Called when grading fails after reservation succeeded.
 * Fails gracefully (does not throw) on Redis errors.
 */
export async function rollbackDailyLlmAttempt(userId: string): Promise<void> {
  try {
    const client = redis.getClient();
    if (!client || !redis.isReady()) {
      return;
    }
    const key = dailyAttemptKey(userId, todayUTC());
    const newValue = await client.decr(key);
    if (newValue < 0) {
      await client.del(key);
    }
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to rollback daily LLM attempt (non-critical)');
  }
}

/**
 * Check if user can create a new plan.
 */
export async function canCreatePlan(
  userId: string,
  maxActivePlans: number,
  historyDays: number | null
): Promise<QuotaCheckResult> {
  if (!isFinite(maxActivePlans)) {
    return { allowed: true, current: 0, limit: maxActivePlans };
  }
  const current = await countActivePlansForUser(userId, historyDays);
  return { allowed: current < maxActivePlans, current, limit: maxActivePlans };
}

/**
 * Check if user can start an exam for a given node.
 */
export async function canStartExam(
  userId: string,
  planId: string,
  nodeId: string,
  limit: number
): Promise<QuotaCheckResult> {
  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit };
  }
  const current = await countExamAttemptsForNode(userId, planId, nodeId);
  return { allowed: current < limit, current, limit };
}

/**
 * Check if user can regenerate exercises for a given node.
 */
export async function canRegenerateExercises(
  userId: string,
  planId: string,
  nodeId: string,
  limit: number
): Promise<QuotaCheckResult> {
  if (!isFinite(limit)) {
    return { allowed: true, current: 0, limit };
  }
  if (limit <= 0) {
    return { allowed: false, current: 0, limit };
  }
  const current = await countExerciseRegensForNode(userId, planId, nodeId);
  return { allowed: current < limit, current, limit };
}
