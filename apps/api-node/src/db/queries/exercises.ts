/**
 * Database queries for exercises.
 */

import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import logger from '../../utils/logger';

// Types matching the database schema
export interface ExerciseRow {
  exercise_id: string;
  plan_id: string;
  node_id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  correct_answer: unknown;
  rubric: string;
  difficulty: number;
  created_at: Date;
}

// Input type for creating exercises
export interface ExerciseInput {
  id: string; // The exercise ID from the LLM (will be mapped to a UUID)
  type: string;
  prompt: string;
  choices?: string[] | null;
  correct_answer: unknown;
  rubric: string;
  difficulty: number;
}

/**
 * Insert exercises for a node in a single transaction.
 *
 * @returns The generated exercise IDs mapped from the input IDs
 */
export async function insertExercises(
  planId: string,
  nodeId: string,
  exercises: ExerciseInput[]
): Promise<{ exercise_ids: string[]; id_mapping: Record<string, string> }> {
  const exerciseIds: string[] = [];
  const idMapping: Record<string, string> = {};

  return db.transaction(async (client: PoolClient) => {
    for (const exercise of exercises) {
      const exerciseId = uuidv4();
      exerciseIds.push(exerciseId);
      idMapping[exercise.id] = exerciseId;

      await client.query(
        `INSERT INTO exercises (exercise_id, plan_id, node_id, type, prompt, choices, correct_answer, rubric, difficulty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          exerciseId,
          planId,
          nodeId,
          exercise.type,
          exercise.prompt,
          exercise.choices ? JSON.stringify(exercise.choices) : null,
          JSON.stringify(exercise.correct_answer),
          exercise.rubric,
          exercise.difficulty,
        ]
      );
    }

    logger.info(
      { planId, nodeId, exerciseCount: exercises.length },
      'Exercises inserted'
    );

    return { exercise_ids: exerciseIds, id_mapping: idMapping };
  });
}

/**
 * Get all exercises for a node.
 */
export async function getExercisesForNode(
  planId: string,
  nodeId: string
): Promise<ExerciseRow[]> {
  const result = await db.query(
    `SELECT exercise_id, plan_id, node_id, type, prompt, choices, correct_answer, rubric, difficulty, created_at
     FROM exercises
     WHERE plan_id = $1 AND node_id = $2
     ORDER BY created_at`,
    [planId, nodeId]
  );

  return result.rows as unknown as ExerciseRow[];
}

/**
 * Get a single exercise by ID.
 */
export async function getExerciseById(
  exerciseId: string
): Promise<ExerciseRow | null> {
  const result = await db.query(
    `SELECT exercise_id, plan_id, node_id, type, prompt, choices, correct_answer, rubric, difficulty, created_at
     FROM exercises
     WHERE exercise_id = $1`,
    [exerciseId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as ExerciseRow;
}

/**
 * Check if exercises exist for a node.
 */
export async function hasExercisesForNode(
  planId: string,
  nodeId: string
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM exercises WHERE plan_id = $1 AND node_id = $2
    ) as exists`,
    [planId, nodeId]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Delete all exercises for a node.
 * Used for force regeneration.
 */
export async function deleteExercisesForNode(
  planId: string,
  nodeId: string
): Promise<number> {
  const result = await db.query(
    'DELETE FROM exercises WHERE plan_id = $1 AND node_id = $2',
    [planId, nodeId]
  );

  const deleted = result.rowCount ?? 0;
  if (deleted > 0) {
    logger.info({ planId, nodeId, deleted }, 'Exercises deleted for node');
  }

  return deleted;
}

/**
 * Get exercise count for a node.
 */
export async function getExerciseCountForNode(
  planId: string,
  nodeId: string
): Promise<number> {
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM exercises WHERE plan_id = $1 AND node_id = $2',
    [planId, nodeId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}
