/**
 * Database queries for attempts and mastery tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { db } from '../client';
import logger from '../../utils/logger';

/** Helper: use provided client (for transactions) or fall back to pool. */
function queryRunner(client?: PoolClient) {
  return client
    ? <T extends Record<string, unknown>>(text: string, params?: unknown[]) => client.query<T>(text, params)
    : <T extends Record<string, unknown>>(text: string, params?: unknown[]) => db.query<T>(text, params);
}

// Types matching the database schema
export interface AttemptRow {
  attempt_id: string;
  user_id: string;
  exercise_id: string;
  user_answer: unknown;
  score: number;
  is_correct: boolean;
  feedback: string;
  misconceptions: string[] | null;
  created_at: Date;
}

export interface MasteryRow {
  user_id: string;
  plan_id: string;
  node_id: string;
  mastery_score: number;
  last_updated: Date;
  has_exam_attempt: boolean;
}

// Input type for creating attempts
export interface AttemptInput {
  user_answer: unknown;
  score: number;
  is_correct: boolean;
  feedback: string;
  misconceptions?: string[] | null;
}

/**
 * Insert a new attempt.
 *
 * @returns The generated attempt_id
 */
export async function insertAttempt(
  userId: string,
  exerciseId: string,
  attempt: AttemptInput,
  client?: PoolClient
): Promise<{ attempt_id: string }> {
  const attemptId = uuidv4();
  const query = queryRunner(client);

  await query(
    `INSERT INTO attempts (attempt_id, user_id, exercise_id, user_answer, score, is_correct, feedback, misconceptions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      attemptId,
      userId,
      exerciseId,
      JSON.stringify(attempt.user_answer),
      attempt.score,
      attempt.is_correct,
      attempt.feedback,
      attempt.misconceptions ? JSON.stringify(attempt.misconceptions) : null,
    ]
  );

  logger.debug(
    { attemptId, userId, exerciseId, score: attempt.score },
    'Attempt inserted'
  );

  return { attempt_id: attemptId };
}

/**
 * Get recent attempts for mastery calculation.
 * Returns attempts ordered by most recent first.
 */
export async function getRecentAttempts(
  userId: string,
  planId: string,
  nodeId: string,
  limit: number = 10,
  client?: PoolClient
): Promise<AttemptRow[]> {
  const query = queryRunner(client);
  const result = await query(
    `SELECT a.attempt_id, a.user_id, a.exercise_id, a.user_answer, a.score, a.is_correct, a.feedback, a.misconceptions, a.created_at
     FROM attempts a
     JOIN exercises e ON e.exercise_id = a.exercise_id
     WHERE a.user_id = $1 AND e.plan_id = $2 AND e.node_id = $3
     ORDER BY a.created_at DESC
     LIMIT $4`,
    [userId, planId, nodeId, limit]
  );

  return result.rows as unknown as AttemptRow[];
}


/**
 * Aggregate attempt stats (total count and correct count) for a single node.
 * Avoids fetching all rows into memory.
 */
export async function getAttemptStats(
  userId: string,
  planId: string,
  nodeId: string,
  client?: PoolClient
): Promise<{ total: number; correct: number }> {
  const query = queryRunner(client);
  const result = await query<{ total: string; correct: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE a.is_correct) AS correct
     FROM attempts a
     JOIN exercises e ON e.exercise_id = a.exercise_id
     WHERE a.user_id = $1 AND e.plan_id = $2 AND e.node_id = $3`,
    [userId, planId, nodeId]
  );

  return {
    total: parseInt(result.rows[0]?.total || '0', 10),
    correct: parseInt(result.rows[0]?.correct || '0', 10),
  };
}

/**
 * Aggregate attempt stats for all nodes in a plan.
 * Returns a Map from node_id to { total, correct }.
 */
export async function getAttemptStatsForPlan(
  userId: string,
  planId: string
): Promise<Map<string, { total: number; correct: number }>> {
  const result = await db.query<{ node_id: string; total: string; correct: string }>(
    `SELECT e.node_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE a.is_correct) AS correct
     FROM attempts a
     JOIN exercises e ON e.exercise_id = a.exercise_id
     WHERE a.user_id = $1 AND e.plan_id = $2
     GROUP BY e.node_id`,
    [userId, planId]
  );

  const map = new Map<string, { total: number; correct: number }>();
  for (const row of result.rows) {
    map.set(row.node_id, {
      total: parseInt(row.total || '0', 10),
      correct: parseInt(row.correct || '0', 10),
    });
  }
  return map;
}

/**
 * Upsert mastery score for a user/plan/node.
 */
export async function upsertMastery(
  userId: string,
  planId: string,
  nodeId: string,
  masteryScore: number
): Promise<void> {
  await db.query(
    `INSERT INTO user_mastery (user_id, plan_id, node_id, mastery_score, last_updated)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, plan_id, node_id)
     DO UPDATE SET mastery_score = EXCLUDED.mastery_score, last_updated = NOW()`,
    [userId, planId, nodeId, masteryScore]
  );

  logger.debug(
    { userId, planId, nodeId, masteryScore },
    'Mastery upserted'
  );
}

/**
 * Upsert mastery score only if the new value is higher than the existing value.
 * Uses an atomic WHERE clause to prevent TOCTOU races.
 * Returns true if the update was applied, false if the existing value was higher.
 */
export async function upsertMasteryIfHigher(
  userId: string,
  planId: string,
  nodeId: string,
  masteryScore: number,
  client?: PoolClient
): Promise<boolean> {
  const query = queryRunner(client);
  const result = await query(
    `INSERT INTO user_mastery (user_id, plan_id, node_id, mastery_score, last_updated)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, plan_id, node_id)
     DO UPDATE SET mastery_score = EXCLUDED.mastery_score, last_updated = NOW()
     WHERE user_mastery.mastery_score <= EXCLUDED.mastery_score`,
    [userId, planId, nodeId, masteryScore]
  );

  const didUpdate = (result.rowCount ?? 0) > 0;

  logger.debug(
    { userId, planId, nodeId, masteryScore, didUpdate },
    'Mastery upsert-if-higher attempted'
  );

  return didUpdate;
}

/**
 * Get mastery for a specific node.
 */
export async function getMastery(
  userId: string,
  planId: string,
  nodeId: string,
  client?: PoolClient
): Promise<MasteryRow | null> {
  const query = queryRunner(client);
  const result = await query(
    `SELECT um.user_id, um.plan_id, um.node_id, um.mastery_score, um.last_updated,
            (EXISTS (
              SELECT 1 FROM exam_attempts ea
              WHERE ea.user_id = um.user_id AND ea.plan_id = um.plan_id AND ea.node_id = um.node_id
            )) AS has_exam_attempt
     FROM user_mastery um
     WHERE um.user_id = $1 AND um.plan_id = $2 AND um.node_id = $3`,
    [userId, planId, nodeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as MasteryRow;
}

/**
 * Get all mastery scores for a plan.
 */
export async function getMasteryForPlan(
  userId: string,
  planId: string
): Promise<MasteryRow[]> {
  const result = await db.query(
    `SELECT um.user_id, um.plan_id, um.node_id, um.mastery_score, um.last_updated,
            (EXISTS (
              SELECT 1 FROM exam_attempts ea
              WHERE ea.user_id = um.user_id AND ea.plan_id = um.plan_id AND ea.node_id = um.node_id
            )) AS has_exam_attempt
     FROM user_mastery um
     WHERE um.user_id = $1 AND um.plan_id = $2
     ORDER BY um.node_id`,
    [userId, planId]
  );

  return result.rows as unknown as MasteryRow[];
}

/**
 * Get the maximum difficulty of completed exercises for a node.
 * Used in mastery calculation.
 */
export async function getMaxCompletedDifficulty(
  userId: string,
  planId: string,
  nodeId: string,
  client?: PoolClient
): Promise<number> {
  const query = queryRunner(client);
  const result = await query<{ max_difficulty: number | null }>(
    `SELECT MAX(e.difficulty) as max_difficulty
     FROM attempts a
     JOIN exercises e ON e.exercise_id = a.exercise_id
     WHERE a.user_id = $1 AND e.plan_id = $2 AND e.node_id = $3 AND a.is_correct = true`,
    [userId, planId, nodeId]
  );

  return result.rows[0]?.max_difficulty ?? 0;
}

/**
 * Get attempt count for a user on a specific exercise.
 */
export async function getAttemptCountForExercise(
  userId: string,
  exerciseId: string
): Promise<number> {
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM attempts WHERE user_id = $1 AND exercise_id = $2',
    [userId, exerciseId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}
