/**
 * Mastery service for tracking user progress and grading answers.
 */

import logger from '../utils/logger';
import { curriculumClient, Grade, ExerciseType } from './curriculum-client';
import {
  insertAttempt,
  getRecentAttempts,
  getAllAttemptsForNode,
  upsertMasteryIfHigher,
  getMastery,
  getMasteryForPlan,
  getMaxCompletedDifficulty,
  AttemptRow,
} from '../db/queries/mastery';
import { MASTERY_THRESHOLD, PREREQ_THRESHOLD, EXERCISE_MASTERY_CAP, MASTERY_VOLUME_TARGET } from '../constants/mastery';
import { getExerciseById, ExerciseRow } from '../db/queries/exercises';
import { getPlanWithNodes } from '../db/queries/plans';

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
  has_exam_attempt?: boolean;
}

// Result from next-node recommendation
export interface NextNodeRecommendation {
  recommended_node_id: string | null;
  rationale: string;
  current_progress: {
    nodes_completed: number;
    total_nodes: number;
    completion_percentage: number;
  };
  all_prerequisites_met: boolean;
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
        has_exam_attempt: false,
      };
    }

    return {
      score: mastery.mastery_score,
      level: this.masteryToLevel(mastery.mastery_score),
      total_attempts: allAttempts.length,
      last_updated: mastery.last_updated,
      has_exam_attempt: mastery.has_exam_attempt,
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
        has_exam_attempt: row.has_exam_attempt,
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

      // Check if the error has the specific fields we need from the curriculum service
      if (
        error instanceof Error &&
        'statusCode' in error &&
        'errorCode' in error
      ) {
        // Double-cast safely now that we confirmed the fields exist at runtime
        const serviceError = error as unknown as {
          statusCode: number;
          errorCode: string;
          message: string;
        };

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

    // Calculate raw mastery score and cap at exercise limit
    const rawScore = this.calculateMastery(recentAttempts, allAttempts, maxDifficulty);
    const cappedScore = Math.min(rawScore, EXERCISE_MASTERY_CAP);
    const level = this.masteryToLevel(cappedScore);

    // Atomically update mastery only if new score is higher (preserves exam-set mastery)
    const didUpdate = await upsertMasteryIfHigher(userId, planId, nodeId, cappedScore);

    if (!didUpdate) {
      const currentMastery = await getMastery(userId, planId, nodeId);
      return {
        score: currentMastery?.mastery_score ?? cappedScore,
        level: this.masteryToLevel(currentMastery?.mastery_score ?? cappedScore),
        total_attempts: allAttempts.length,
      };
    }

    return {
      score: cappedScore,
      level,
      total_attempts: allAttempts.length,
    };
  }

  /**
   * Get the recommended next node for a user based on mastery and prerequisites.
   *
   * This is a RECOMMENDATION system, not access control:
   * - Users can start any node via GET /api/plan/:planId
   * - This method suggests the optimal next step for UI highlighting
   */
  async getNextNode(
    userId: string,
    planId: string
  ): Promise<NextNodeRecommendation> {
    // 1. Fetch plan with nodes
    const planWithNodes = await getPlanWithNodes(planId);
    if (!planWithNodes) {
      throw new MasteryServiceError('Plan not found', 404, 'PLAN_NOT_FOUND', {
        plan_id: planId,
      });
    }

    const { nodes } = planWithNodes;
    const totalNodes = nodes.length;

    if (totalNodes === 0) {
      return {
        recommended_node_id: null,
        rationale: 'This plan has no nodes.',
        current_progress: {
          nodes_completed: 0,
          total_nodes: 0,
          completion_percentage: 0,
        },
        all_prerequisites_met: true,
      };
    }

    // 2. Fetch mastery for all nodes
    const masteryByNode = await this.getPlanMastery(userId, planId);

    // 3. Count completed nodes (mastery >= MASTERY_THRESHOLD)
    const completedNodes = nodes.filter(
      (n) => (masteryByNode[n.node_id]?.score ?? 0) >= MASTERY_THRESHOLD
    ).length;

    const completionPercentage = Math.round((completedNodes / totalNodes) * 100);

    // 4. Check if all nodes are mastered
    if (completedNodes === totalNodes) {
      return {
        recommended_node_id: null,
        rationale: 'Congratulations! You have mastered all nodes in this plan.',
        current_progress: {
          nodes_completed: completedNodes,
          total_nodes: totalNodes,
          completion_percentage: 100,
        },
        all_prerequisites_met: true,
      };
    }

    // 5. Filter to unlocked nodes (all prerequisites met with mastery >= PREREQ_THRESHOLD)
    const unlockedNodes = nodes.filter((node) => {
      for (const prereq of node.prerequisites) {
        const prereqMastery = masteryByNode[prereq]?.score ?? 0;
        if (prereqMastery < PREREQ_THRESHOLD) {
          return false;
        }
      }
      return true;
    });

    // 6. If no nodes are unlocked, find the blocking prerequisite
    if (unlockedNodes.length === 0) {
      // Find first incomplete node and its unmet prerequisite
      const incompleteNode = nodes.find(
        (n) => (masteryByNode[n.node_id]?.score ?? 0) < MASTERY_THRESHOLD
      );
      const unmetPrereq = incompleteNode?.prerequisites.find(
        (p) => (masteryByNode[p]?.score ?? 0) < PREREQ_THRESHOLD
      );

      // Find the title of the unmet prerequisite
      const prereqNode = unmetPrereq
        ? nodes.find((n) => n.node_id === unmetPrereq)
        : null;

      return {
        recommended_node_id: unmetPrereq ?? null,
        rationale: prereqNode
          ? `You need to improve mastery on "${prereqNode.title}" before advancing.`
          : 'No nodes are currently available.',
        current_progress: {
          nodes_completed: completedNodes,
          total_nodes: totalNodes,
          completion_percentage: completionPercentage,
        },
        all_prerequisites_met: false,
      };
    }

    // 7. Score unlocked nodes
    const scoredNodes = unlockedNodes.map((node) => {
      const mastery = masteryByNode[node.node_id]?.score ?? 0;
      let score = 0;

      // Prefer partial progress (0.1 - 0.7 mastery)
      if (mastery >= 0.1 && mastery < 0.7) {
        score += 10;
      }
      // Not started gets lower priority
      else if (mastery < 0.1) {
        score += 5;
      }
      // Already mastered (>= MASTERY_THRESHOLD) gets negative score
      else if (mastery >= MASTERY_THRESHOLD) {
        score -= 10;
      }

      // Schedule order as tiebreaker (earlier = higher priority)
      score -= node.order_index * 0.01;

      return {
        node,
        mastery,
        score,
      };
    });

    // 8. Sort by score descending
    scoredNodes.sort((a, b) => b.score - a.score);

    // 9. Select the best non-mastered node
    const bestNode = scoredNodes.find((n) => n.mastery < MASTERY_THRESHOLD);

    if (!bestNode) {
      return {
        recommended_node_id: null,
        rationale: 'All available nodes have been mastered.',
        current_progress: {
          nodes_completed: completedNodes,
          total_nodes: totalNodes,
          completion_percentage: completionPercentage,
        },
        all_prerequisites_met: true,
      };
    }

    // 10. Generate rationale
    let rationale: string;
    const masteryPercent = Math.round(bestNode.mastery * 100);

    if (bestNode.mastery >= 0.1 && bestNode.mastery < 0.7) {
      rationale = `Continue with "${bestNode.node.title}" - you're making progress (${masteryPercent}% mastery).`;
    } else if (bestNode.mastery < 0.1) {
      rationale = `Start "${bestNode.node.title}" - it's next in your learning path.`;
    } else {
      rationale = `Review "${bestNode.node.title}" to solidify your understanding.`;
    }

    return {
      recommended_node_id: bestNode.node.node_id,
      rationale,
      current_progress: {
        nodes_completed: completedNodes,
        total_nodes: totalNodes,
        completion_percentage: completionPercentage,
      },
      all_prerequisites_met: true,
    };
  }

  /**
   * Calculate mastery score from attempts using multiplicative formula.
   *
   * Formula: accuracy * volumeMultiplier * difficultyMultiplier
   * - Accuracy: 60% recent + 40% historical (weighted average)
   * - Volume: sqrt curve diminishing returns to MASTERY_VOLUME_TARGET
   * - Difficulty: maxDifficulty / 5 (normalized to 0-1)
   *
   * This formula requires ALL three components to achieve high mastery,
   * preventing the bug where a single correct answer jumps to the cap.
   */
  calculateMastery(
    recentAttempts: AttemptRow[],
    allAttempts: AttemptRow[],
    maxDifficulty: number
  ): number {
    // No attempts = no mastery
    if (allAttempts.length === 0) {
      return 0;
    }

    // Accuracy component (60% recent, 40% historical)
    const recentAccuracy =
      recentAttempts.length > 0
        ? recentAttempts.filter((a) => a.is_correct).length / recentAttempts.length
        : 0;
    const historicalAccuracy =
      allAttempts.length > 0
        ? allAttempts.filter((a) => a.is_correct).length / allAttempts.length
        : 0;
    const accuracy = recentAccuracy * 0.6 + historicalAccuracy * 0.4;

    // Volume component - sqrt curve for diminishing returns
    const correctCount = allAttempts.filter((a) => a.is_correct).length;
    const volumeMultiplier = Math.min(
      Math.sqrt(correctCount) / Math.sqrt(MASTERY_VOLUME_TARGET),
      1.0
    );

    // Difficulty component
    const difficultyMultiplier = Math.min(Math.max(maxDifficulty, 0), 5) / 5;

    // Combined (multiplicative - requires ALL three)
    const raw = accuracy * volumeMultiplier * difficultyMultiplier;

    return Math.max(0, Math.min(1, raw));
  }

  /**
   * Convert mastery score to level.
   */
  masteryToLevel(score: number): MasteryLevel {
    if (score < 0.3) return 'novice';
    if (score < PREREQ_THRESHOLD) return 'intermediate';
    if (score < MASTERY_THRESHOLD) return 'competent';
    return 'expert';
  }
}

// Export singleton instance
export const masteryService = new MasteryService();
export default masteryService;
