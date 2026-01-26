/**
 * Mastery service for tracking user progress and grading answers.
 */

import logger from '../utils/logger';
import { curriculumClient, Grade, ExerciseType } from './curriculum-client';
import {
  insertAttempt,
  getRecentAttempts,
  getAllAttemptsForNode,
  upsertMastery,
  getMastery,
  getMasteryForPlan,
  getMaxCompletedDifficulty,
  AttemptRow,
  MasteryRow
} from '../db/queries/mastery';
import { getExerciseById, ExerciseRow } from '../db/queries/exercises';

// Custom error class
export class MasteryServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MasteryServiceError';
  }
}

// Mastery level enum
export type MasteryLevel = 'novice' | 'intermediate' | 'competent' | 'expert';

// Input for submitting an attempt
export interface SubmitAttemptInput {
  plan_id: string;
  node_id: string;
  exercise_id: string;
  user_answer: unknown;
}

// Result from submit attempt
export interface SubmitAttemptResult {
  attempt_id: string;
  grade: Grade;
  mastery: {
    score: number;
    level: MasteryLevel;
    total_attempts: number;
  };
}

// Result from get mastery
export interface GetMasteryResult {
  score: number;
  level: MasteryLevel;
  total_attempts: number;
  last_updated: Date | null;
}

class MasteryService {
  /**
   * Submit an answer and get grading + updated mastery.
   */
  async submitAttempt(
    userId: string,
    input: SubmitAttemptInput,
    requestId: string
  ): Promise<SubmitAttemptResult> {
    logger.info(
      { userId, exerciseId: input.exercise_id, requestId },
      'Submitting attempt'
    );

    // 1. Fetch exercise
    const exercise = await getExerciseById(input.exercise_id);
    if (!exercise) {
      throw new MasteryServiceError(
        `Exercise ${input.exercise_id} not found`,
        404,
        'EXERCISE_NOT_FOUND',
        { exercise_id: input.exercise_id }
      );
    }

    // Verify plan_id and node_id match
    if (exercise.plan_id !== input.plan_id || exercise.node_id !== input.node_id) {
      throw new MasteryServiceError(
        'Exercise does not belong to the specified plan/node',
        400,
        'EXERCISE_MISMATCH',
        {
          exercise_id: input.exercise_id,
          expected_plan_id: exercise.plan_id,
          expected_node_id: exercise.node_id,
          provided_plan_id: input.plan_id,
          provided_node_id: input.node_id,
        }
      );
    }

    // 2. Call Python grade endpoint
    const grade = await this.gradeAnswer(exercise, input.user_answer, requestId);

    // 3. Persist attempt
    const { attempt_id } = await insertAttempt(userId, input.exercise_id, {
      user_answer: input.user_answer,
      score: grade.score,
      is_correct: grade.is_correct,
      feedback: grade.feedback,
      misconceptions: grade.misconceptions,
    });

    // 4. Recalculate mastery
    const mastery = await this.recalculateMastery(
      userId,
      exercise.plan_id,
      exercise.node_id
    );

    logger.info(
      {
        userId,
        attemptId: attempt_id,
        score: grade.score,
        isCorrect: grade.is_correct,
        masteryScore: mastery.score,
      },
      'Attempt submitted and mastery updated'
    );

    return {
      attempt_id,
      grade,
      mastery,
    };
  }

  /**
   * Get mastery for a specific node.
   */
  async getNodeMastery(
    userId: string,
    planId: string,
    nodeId: string
  ): Promise<GetMasteryResult> {
    const mastery = await getMastery(userId, planId, nodeId);
    const allAttempts = await getAllAttemptsForNode(userId, planId, nodeId);

    if (!mastery) {
      return {
        score: 0,
        level: 'novice',
        total_attempts: allAttempts.length,
        last_updated: null,
      };
    }

    return {
      score: mastery.mastery_score,
      level: this.masteryToLevel(mastery.mastery_score),
      total_attempts: allAttempts.length,
      last_updated: mastery.last_updated,
    };
  }

  /**
   * Get all mastery scores for a plan.
   */
  async getPlanMastery(
    userId: string,
    planId: string
  ): Promise<Record<string, GetMasteryResult>> {
    const masteryRows = await getMasteryForPlan(userId, planId);
    const result: Record<string, GetMasteryResult> = {};

    for (const row of masteryRows) {
      const allAttempts = await getAllAttemptsForNode(userId, planId, row.node_id);
      result[row.node_id] = {
        score: row.mastery_score,
        level: this.masteryToLevel(row.mastery_score),
        total_attempts: allAttempts.length,
        last_updated: row.last_updated,
      };
    }

    return result;
  }

  /**
   * Grade an answer using the Python service.
   */
  private async gradeAnswer(
    exercise: ExerciseRow,
    userAnswer: unknown,
    requestId: string
  ): Promise<Grade> {
    try {
      // Need to get plan's user_level - for now default to intermediate
      // In a real implementation, we'd fetch the plan to get user_level
      return await curriculumClient.gradeAnswer({
        plan_id: exercise.plan_id,
        node_id: exercise.node_id,
        exercise_id: exercise.exercise_id,
        exercise_type: exercise.type as ExerciseType,
        prompt: exercise.prompt,
        rubric: exercise.rubric,
        correct_answer: exercise.correct_answer,
        user_answer: userAnswer,
        user_level: 'intermediate', // Default, should be fetched from plan
        request_id: requestId,
      });
    } catch (error) {
      logger.error(
        { exerciseId: exercise.exercise_id, error },
        'Grading failed'
      );

      if (error instanceof Error && 'statusCode' in error) {
        const serviceError = error as { statusCode: number; errorCode: string; message: string };
        throw new MasteryServiceError(
          serviceError.message,
          serviceError.statusCode,
          serviceError.errorCode,
          { exercise_id: exercise.exercise_id }
        );
      }

      throw new MasteryServiceError(
        'Failed to grade answer',
        500,
        'GRADING_FAILED',
        { exercise_id: exercise.exercise_id }
      );
    }
  }

  /**
   * Recalculate mastery score for a user/plan/node.
   * Formula:
   * - 60% weight on recent attempts (last 10)
   * - 30% weight on historical accuracy (all attempts)
   * - 10% weight on max difficulty achieved
   */
  private async recalculateMastery(
    userId: string,
    planId: string,
    nodeId: string
  ): Promise<{ score: number; level: MasteryLevel; total_attempts: number }> {
    const recentAttempts = await getRecentAttempts(userId, planId, nodeId, 10);
    const allAttempts = await getAllAttemptsForNode(userId, planId, nodeId);
    const maxDifficulty = await getMaxCompletedDifficulty(userId, planId, nodeId);

    const score = this.calculateMastery(recentAttempts, allAttempts, maxDifficulty);
    const level = this.masteryToLevel(score);

    // Persist the new mastery score
    await upsertMastery(userId, planId, nodeId, score);

    return {
      score,
      level,
      total_attempts: allAttempts.length,
    };
  }

  /**
   * Calculate mastery score from attempts.
   */
  calculateMastery(
    recentAttempts: AttemptRow[],
    allAttempts: AttemptRow[],
    maxDifficulty: number
  ): number {
    // Recent accuracy (60% weight)
    const recentAccuracy =
      recentAttempts.length > 0
        ? recentAttempts.filter((a) => a.is_correct).length / recentAttempts.length
        : 0;

    // Historical accuracy (30% weight)
    const historicalAccuracy =
      allAttempts.length > 0
        ? allAttempts.filter((a) => a.is_correct).length / allAttempts.length
        : 0;

    // Difficulty bonus (10% weight) - max 5, so divide by 5
    const difficultyBonus = maxDifficulty / 5;

    const score =
      recentAccuracy * 0.6 + historicalAccuracy * 0.3 + difficultyBonus * 0.1;

    // Clamp to 0-1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Convert mastery score to level.
   */
  masteryToLevel(score: number): MasteryLevel {
    if (score < 0.3) return 'novice';
    if (score < 0.6) return 'intermediate';
    if (score < 0.8) return 'competent';
    return 'expert';
  }
}

// Export singleton instance
export const masteryService = new MasteryService();
export default masteryService;
