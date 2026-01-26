/**
 * Database queries for attempts and mastery tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import logger from '../../utils/logger';

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
  attempt: AttemptInput
): Promise<{ attempt_id: string }> {
  const attemptId = uuidv4();

  await db.query(
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
  limit: number = 10
): Promise<AttemptRow[]> {
  const result = await db.query(
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
 * Get all attempts for a node (no limit).
 */
export async function getAllAttemptsForNode(
  userId: string,
  planId: string,
  nodeId: string
): Promise<AttemptRow[]> {
  const result = await db.query(
    `SELECT a.attempt_id, a.user_id, a.exercise_id, a.user_answer, a.score, a.is_correct, a.feedback, a.misconceptions, a.created_at
     FROM attempts a
     JOIN exercises e ON e.exercise_id = a.exercise_id
     WHERE a.user_id = $1 AND e.plan_id = $2 AND e.node_id = $3
     ORDER BY a.created_at DESC`,
    [userId, planId, nodeId]
  );

  return result.rows as unknown as AttemptRow[];
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
 * Get mastery for a specific node.
 */
export async function getMastery(
  userId: string,
  planId: string,
  nodeId: string
): Promise<MasteryRow | null> {
  const result = await db.query(
    `SELECT user_id, plan_id, node_id, mastery_score, last_updated
     FROM user_mastery
     WHERE user_id = $1 AND plan_id = $2 AND node_id = $3`,
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
    `SELECT user_id, plan_id, node_id, mastery_score, last_updated
     FROM user_mastery
     WHERE user_id = $1 AND plan_id = $2
     ORDER BY node_id`,
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
  nodeId: string
): Promise<number> {
  const result = await db.query<{ max_difficulty: number | null }>(
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
