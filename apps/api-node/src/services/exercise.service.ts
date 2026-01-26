/**
 * Exercise service for generating and managing exercises.
 */

import logger from '../utils/logger';
import { curriculumClient, ExerciseSet, ExerciseType } from './curriculum-client';
import {
  insertExercises,
  getExercisesForNode,
  hasExercisesForNode,
  deleteExercisesForNode,
  ExerciseRow,
  ExerciseInput,
} from '../db/queries/exercises';
import { getPlanWithNodes, NodeRow } from '../db/queries/plans';

// Custom error class
export class ExerciseServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ExerciseServiceError';
  }
}

// Input for generating exercises
export interface GenerateExercisesInput {
  exercise_types?: ExerciseType[];
  count?: number;
  difficulty_target?: number;
}

// Result from generate exercises
export interface GenerateExercisesResult {
  exercises: ExerciseRow[];
  cached: boolean;
  id_mapping?: Record<string, string>;
}

class ExerciseService {
  /**
   * Generate exercises for a node.
   * Returns cached exercises if they exist (unless force=true).
   */
  async generateExercises(
    planId: string,
    nodeId: string,
    input: GenerateExercisesInput,
    requestId: string,
    force: boolean = false
  ): Promise<GenerateExercisesResult> {
    logger.info(
      { planId, nodeId, requestId, force, ...input },
      'Generating exercises'
    );

    // 1. Check if exercises exist (unless force=true)
    if (!force) {
      const existing = await getExercisesForNode(planId, nodeId);
      if (existing.length > 0) {
        logger.info(
          { planId, nodeId, exerciseCount: existing.length },
          'Returning cached exercises'
        );
        return { exercises: existing, cached: true };
      }
    }

    // 2. Fetch plan and node details
    const planData = await getPlanWithNodes(planId);
    if (!planData) {
      throw new ExerciseServiceError(
        `Plan ${planId} not found`,
        404,
        'PLAN_NOT_FOUND',
        { plan_id: planId }
      );
    }

    const node = planData.nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      throw new ExerciseServiceError(
        `Node ${nodeId} not found in plan ${planId}`,
        404,
        'NODE_NOT_FOUND',
        { plan_id: planId, node_id: nodeId }
      );
    }

    // 3. Delete existing if force=true
    if (force) {
      await deleteExercisesForNode(planId, nodeId);
    }

    // 4. Call Python service
    const exerciseSet = await this.callCurriculumService(
      planId,
      nodeId,
      planData.plan.topic,
      node,
      planData.plan.user_level as 'beginner' | 'intermediate' | 'advanced',
      input,
      requestId
    );

    // 5. Persist to database
    const exerciseInputs: ExerciseInput[] = exerciseSet.exercises.map((ex) => ({
      id: ex.id,
      type: ex.type,
      prompt: ex.prompt,
      choices: ex.choices || null,
      correct_answer: ex.correct_answer,
      rubric: ex.rubric,
      difficulty: ex.difficulty,
    }));

    const { id_mapping } = await insertExercises(planId, nodeId, exerciseInputs);

    // 6. Fetch the newly inserted exercises (with database IDs)
    const exercises = await getExercisesForNode(planId, nodeId);

    logger.info(
      { planId, nodeId, exerciseCount: exercises.length },
      'Exercises generated and persisted'
    );

    return { exercises, cached: false, id_mapping };
  }

  /**
   * Get exercises for a node.
   */
  async getExercises(planId: string, nodeId: string): Promise<ExerciseRow[]> {
    return getExercisesForNode(planId, nodeId);
  }

  /**
   * Check if exercises exist for a node.
   */
  async hasExercises(planId: string, nodeId: string): Promise<boolean> {
    return hasExercisesForNode(planId, nodeId);
  }

  /**
   * Call the Python curriculum service to generate exercises.
   */
  private async callCurriculumService(
    planId: string,
    nodeId: string,
    topic: string,
    node: NodeRow,
    userLevel: 'beginner' | 'intermediate' | 'advanced',
    input: GenerateExercisesInput,
    requestId: string
  ): Promise<ExerciseSet> {
    try {
      return await curriculumClient.generateExercises({
        plan_id: planId,
        node_id: nodeId,
        topic,
        node_title: node.title,
        objectives: node.objectives,
        user_level: userLevel,
        exercise_types: input.exercise_types,
        count: input.count ?? 5,
        difficulty_target: input.difficulty_target ?? 3,
        request_id: requestId,
      });
    } catch (error) {
      logger.error({ planId, nodeId, error }, 'Curriculum service call failed');

      if (
        error instanceof Error && 
        'statusCode' in error && 
        'errorCode' in error
      ) {
        const serviceError = error as unknown as { 
          statusCode: number; 
          errorCode: string; 
          message: string 
        };
        
        throw new ExerciseServiceError(
          serviceError.message,
          serviceError.statusCode,
          serviceError.errorCode,
          { plan_id: planId, node_id: nodeId }
        );
      }

      throw new ExerciseServiceError(
        'Failed to generate exercises',
        500,
        'EXERCISE_GENERATION_FAILED',
        { plan_id: planId, node_id: nodeId }
      );
    }
  }
}

// Export singleton instance
export const exerciseService = new ExerciseService();
export default exerciseService;
