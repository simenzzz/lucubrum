/**
 * User-Plan junction table operations for tracking engagement.
 */

import { db } from '../client';
import logger from '../../utils/logger';

/**
 * User-Plan row from database.
 * Index signature required by db.query type constraint.
 */
export interface UserPlanRow {
  user_id: string;
  plan_id: string;
  started_at: Date;
  last_accessed_at: Date;
  [key: string]: unknown;
}

/**
 * Insert or update a user-plan relationship.
 * Creates if not exists, updates last_accessed_at if exists.
 */
export async function upsertUserPlan(userId: string, planId: string): Promise<void> {
  await db.query(
    `INSERT INTO user_plans (user_id, plan_id, last_accessed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, plan_id) DO UPDATE SET
       last_accessed_at = NOW()`,
    [userId, planId]
  );

  logger.debug({ userId, planId }, 'User-plan relationship upserted');
}

/**
 * Get all plan IDs that a user has engaged with.
 * Ordered by most recently accessed first.
 */
export async function getUserPlanIds(userId: string): Promise<string[]> {
  const result = await db.query<{ plan_id: string }>(
    `SELECT plan_id
     FROM user_plans
     WHERE user_id = $1
     ORDER BY last_accessed_at DESC`,
    [userId]
  );

  return result.rows.map((row) => row.plan_id);
}

/**
 * Check if a user has engaged with a specific plan.
 */
export async function userHasPlan(userId: string, planId: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM user_plans
       WHERE user_id = $1 AND plan_id = $2
     ) as exists`,
    [userId, planId]
  );

  return result.rows[0]?.exists ?? false;
}

/**
 * Update the last accessed timestamp for a user-plan relationship.
 */
export async function updateLastAccessed(userId: string, planId: string): Promise<void> {
  await db.query(
    `UPDATE user_plans
     SET last_accessed_at = NOW()
     WHERE user_id = $1 AND plan_id = $2`,
    [userId, planId]
  );

  logger.debug({ userId, planId }, 'Updated user-plan last_accessed_at');
}

/**
 * Remove a user-plan relationship.
 * Returns true if a relationship was removed, false if not found.
 */
export async function removeUserPlan(userId: string, planId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM user_plans
     WHERE user_id = $1 AND plan_id = $2`,
    [userId, planId]
  );

  const removed = (result.rowCount ?? 0) > 0;
  if (removed) {
    logger.debug({ userId, planId }, 'User-plan relationship removed');
  }
  return removed;
}

/**
 * Get user-plan details with full row data.
 */
export async function getUserPlans(userId: string): Promise<UserPlanRow[]> {
  const result = await db.query<UserPlanRow>(
    `SELECT user_id, plan_id, started_at, last_accessed_at
     FROM user_plans
     WHERE user_id = $1
     ORDER BY last_accessed_at DESC`,
    [userId]
  );

  return result.rows;
}

/**
 * User plan with joined plan details.
 */
export interface UserPlanWithDetails {
  plan_id: string;
  topic: string;
  user_level: string;
  plan_size: string;
  started_at: Date;
  last_accessed_at: Date;
}

/**
 * Paginated result for user plans.
 */
export interface PaginatedUserPlans {
  plans: UserPlanWithDetails[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Database row type for user plans with details query.
 * Matches the exact column names returned by the SQL query.
 * Index signature required by db.query type constraint.
 */
interface UserPlanWithDetailsRow {
  plan_id: string;
  topic: string;
  user_level: string;
  plan_size: string;
  started_at: Date;
  last_accessed_at: Date;
  [key: string]: unknown;
}

/**
 * Get user plans with plan details (topic, level, size) and pagination.
 * Returns plans ordered by most recently accessed first.
 *
 * Note: There's a potential race condition between COUNT and SELECT queries.
 * For strict consistency, consider using window functions:
 * SELECT *, COUNT(*) OVER() as total FROM ...
 */
export async function getUserPlansWithDetails(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<PaginatedUserPlans> {
  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM user_plans
     WHERE user_id = $1`,
    [userId]
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  // Get paginated plans with details
  const result = await db.query<UserPlanWithDetailsRow>(
    `SELECT up.plan_id, p.topic, p.user_level, p.plan_size,
            up.started_at, up.last_accessed_at
     FROM user_plans up
     JOIN plans p ON up.plan_id = p.plan_id
     WHERE up.user_id = $1
     ORDER BY up.last_accessed_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    plans: result.rows,
    total,
    limit,
    offset,
  };
}
