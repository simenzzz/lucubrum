/**
 * Tier-related database queries for quota enforcement.
 */

import { db } from '../client';
import logger from '../../utils/logger';

/**
 * Count active plans for a user within a history window.
 * If historyDays is null, counts all plans (no date filter).
 */
export async function countActivePlansForUser(
  userId: string,
  historyDays: number | null
): Promise<number> {
  const query = historyDays !== null
    ? `SELECT COUNT(*) as count
       FROM user_plans
       WHERE user_id = $1
         AND started_at >= NOW() - INTERVAL '1 day' * $2`
    : `SELECT COUNT(*) as count
       FROM user_plans
       WHERE user_id = $1`;

  const params: unknown[] = historyDays !== null ? [userId, historyDays] : [userId];
  const result = await db.query<{ count: string }>(query, params);
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Count exam attempts for a specific user/plan/node combination.
 */
export async function countExamAttemptsForNode(
  userId: string,
  planId: string,
  nodeId: string
): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM exam_attempts
     WHERE user_id = $1 AND plan_id = $2 AND node_id = $3`,
    [userId, planId, nodeId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Count exercise regenerations (force=true) for a specific user/plan/node.
 */
export async function countExerciseRegensForNode(
  userId: string,
  planId: string,
  nodeId: string
): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM exercise_generation_events
     WHERE user_id = $1 AND plan_id = $2 AND node_id = $3 AND is_force = true`,
    [userId, planId, nodeId]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Record an exercise generation event.
 */
export async function recordExerciseGenerationEvent(
  userId: string,
  planId: string,
  nodeId: string,
  isForce: boolean
): Promise<void> {
  await db.query(
    `INSERT INTO exercise_generation_events (user_id, plan_id, node_id, is_force)
     VALUES ($1, $2, $3, $4)`,
    [userId, planId, nodeId, isForce]
  );
  logger.debug({ userId, planId, nodeId, isForce }, 'Exercise generation event recorded');
}

/**
 * Update user roles in the users table.
 */
export async function updateUserRoles(userId: string, roles: string[]): Promise<boolean> {
  const result = await db.query(
    `UPDATE users SET roles = $1::jsonb WHERE user_id = $2`,
    [JSON.stringify(roles), userId]
  );
  const updated = (result.rowCount ?? 0) > 0;
  if (updated) {
    logger.info({ userId, roles }, 'User roles updated');
  }
  return updated;
}

/**
 * Get current roles for a user.
 */
export async function getUserRoles(userId: string): Promise<string[] | null> {
  const result = await db.query<{ roles: string[] }>(
    `SELECT roles FROM users WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].roles;
}
