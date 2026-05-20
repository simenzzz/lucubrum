/**
 * Database queries for exam sessions and attempts.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import logger from '../../utils/logger';

// Types matching the database schema
export interface ExamSessionRow {
  session_id: string;
  user_id: string;
  plan_id: string;
  node_id: string;
  exercises: unknown; // JSONB
  exam_difficulty: number;
  time_limit_seconds: number;
  started_at: Date;
  expires_at: Date;
  completed_at: Date | null;
}

export interface ExamAttemptRow {
  exam_attempt_id: string;
  session_id: string;
  user_id: string;
  plan_id: string;
  node_id: string;
  mastery_level_old: number;
  mastery_level_new: number;
  exam_difficulty: number;
  score: number;
  exercises_count: number;
  correct_count: number;
  answers: unknown; // JSONB
  grades: unknown; // JSONB
  started_at: Date;
  completed_at: Date;
  time_limit_seconds: number;
  created_at: Date;
}

// Input types
export interface CreateExamSessionInput {
  user_id: string;
  plan_id: string;
  node_id: string;
  exercises: unknown;
  exam_difficulty: number;
  time_limit_seconds: number;
}

export interface CreateExamAttemptInput {
  session_id: string;
  user_id: string;
  plan_id: string;
  node_id: string;
  mastery_level_old: number;
  mastery_level_new: number;
  exam_difficulty: number;
  score: number;
  exercises_count: number;
  correct_count: number;
  answers: unknown;
  grades: unknown;
  started_at: Date;
  completed_at: Date;
  time_limit_seconds: number;
}

/**
 * Create a new exam session.
 */
export async function createExamSession(
  input: CreateExamSessionInput
): Promise<ExamSessionRow> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + input.time_limit_seconds * 1000);

  const result = await db.query(
    `INSERT INTO exam_sessions (
      session_id, user_id, plan_id, node_id, exercises, exam_difficulty,
      time_limit_seconds, started_at, expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    RETURNING *`,
    [
      sessionId,
      input.user_id,
      input.plan_id,
      input.node_id,
      JSON.stringify(input.exercises),
      input.exam_difficulty,
      input.time_limit_seconds,
      expiresAt,
    ]
  );

  logger.info(
    { sessionId, userId: input.user_id, planId: input.plan_id, nodeId: input.node_id },
    'Exam session created'
  );

  return result.rows[0] as unknown as ExamSessionRow;
}

/**
 * Get an exam session by ID.
 */
export async function getExamSession(
  sessionId: string
): Promise<ExamSessionRow | null> {
  const result = await db.query(
    `SELECT * FROM exam_sessions WHERE session_id = $1`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as ExamSessionRow;
}

/**
 * Get active (incomplete) exam session for a user/plan/node.
 */
export async function getActiveExamSession(
  userId: string,
  planId: string,
  nodeId: string
): Promise<ExamSessionRow | null> {
  const result = await db.query(
    `SELECT * FROM exam_sessions
     WHERE user_id = $1 AND plan_id = $2 AND node_id = $3
     AND completed_at IS NULL
     AND expires_at > NOW()
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId, planId, nodeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as ExamSessionRow;
}


/**
 * Atomically complete an exam session if it is still valid (not expired, not already completed).
 * Returns the session row if successful, null if expired or already completed (TOCTOU-safe).
 */
export async function completeExamSessionIfValid(
  sessionId: string
): Promise<ExamSessionRow | null> {
  const result = await db.query(
    `UPDATE exam_sessions
     SET completed_at = NOW()
     WHERE session_id = $1
       AND completed_at IS NULL
       AND expires_at > NOW()
     RETURNING *`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info({ sessionId }, 'Exam session completed atomically');
  return result.rows[0] as unknown as ExamSessionRow;
}

/**
 * Create an exam attempt record.
 */
export async function createExamAttempt(
  input: CreateExamAttemptInput
): Promise<ExamAttemptRow> {
  const attemptId = uuidv4();

  const result = await db.query(
    `INSERT INTO exam_attempts (
      exam_attempt_id, session_id, user_id, plan_id, node_id,
      mastery_level_old, mastery_level_new, exam_difficulty, score,
      exercises_count, correct_count, answers, grades,
      started_at, completed_at, time_limit_seconds
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *`,
    [
      attemptId,
      input.session_id,
      input.user_id,
      input.plan_id,
      input.node_id,
      input.mastery_level_old,
      input.mastery_level_new,
      input.exam_difficulty,
      input.score,
      input.exercises_count,
      input.correct_count,
      JSON.stringify(input.answers),
      JSON.stringify(input.grades),
      input.started_at,
      input.completed_at,
      input.time_limit_seconds,
    ]
  );

  logger.info(
    {
      attemptId,
      sessionId: input.session_id,
      userId: input.user_id,
      score: input.score,
      masteryOld: input.mastery_level_old,
      masteryNew: input.mastery_level_new,
    },
    'Exam attempt created'
  );

  return result.rows[0] as unknown as ExamAttemptRow;
}

/**
 * Get exam attempts for a user/plan/node.
 */
export async function getExamAttempts(
  userId: string,
  planId: string,
  nodeId: string
): Promise<ExamAttemptRow[]> {
  const result = await db.query(
    `SELECT * FROM exam_attempts
     WHERE user_id = $1 AND plan_id = $2 AND node_id = $3
     ORDER BY created_at DESC`,
    [userId, planId, nodeId]
  );

  return result.rows as unknown as ExamAttemptRow[];
}

/**
 * Get a single exam attempt by ID.
 */
export async function getExamAttempt(
  attemptId: string
): Promise<ExamAttemptRow | null> {
  const result = await db.query(
    `SELECT * FROM exam_attempts WHERE exam_attempt_id = $1`,
    [attemptId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as ExamAttemptRow;
}

