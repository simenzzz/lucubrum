/**
 * Plan service for orchestrating plan generation and persistence.
 */

import { curriculumClient, Plan, CurriculumServiceError } from './curriculum-client';
import { schemaValidator } from '../validation/schemas/validator';
import { validateDag, NodeForValidation } from '../validation/semantic/dag.validator';
import {
  validatePrerequisiteOrder,
  NodeForPrereqValidation,
  ScheduleItem,
} from '../validation/semantic/prereq.validator';
import {
  insertPlanWithNodes,
  getPlanWithNodes,
  getUserPlans,
  NodeInput,
  PlanRow,
  NodeRow,
} from '../db/queries/plans';
import logger from '../utils/logger';

export interface CreatePlanRequest {
  topic: string;
  user_level: 'beginner' | 'intermediate' | 'advanced';
  plan_size?: 'basic' | 'moderate' | 'large' | 'dynamic';
  user_id?: string | null;
}

export interface CreatePlanResult {
  plan_id: string;
  plan: Plan;
}

export class PlanServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PlanServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class PlanService {
  /**
   * Create a new learning plan.
   *
   * 1. Call Python service to generate plan via LLM
   * 2. Validate response with AJV (schema validation)
   * 3. Run DAG validation (no cycles, valid references)
   * 4. Run prerequisite order validation
   * 5. Persist to database
   * 6. Return plan with generated plan_id
   */
  async createPlan(request: CreatePlanRequest, requestId: string): Promise<CreatePlanResult> {
    logger.info({ topic: request.topic, requestId }, 'Starting plan creation');

    // 1. Generate plan via Python LLM service
    let plan: Plan;
    try {
      plan = await curriculumClient.generatePlan({
        topic: request.topic,
        user_level: request.user_level,
        plan_size: request.plan_size,
        request_id: requestId,
      });
    } catch (error) {
      if (error instanceof CurriculumServiceError) {
        logger.error({ error, requestId }, 'Python service error');
        throw new PlanServiceError(error.message, error.errorCode, error.statusCode, error.details);
      }
      throw error;
    }

    // 2. Validate with AJV schema
    const schemaResult = schemaValidator.validate<Plan>('plan.v1', plan);
    if (!schemaResult.valid) {
      logger.error({ errors: schemaResult.errors, requestId }, 'Schema validation failed');
      throw new PlanServiceError(
        'Plan failed schema validation',
        'SCHEMA_VALIDATION_FAILED',
        422,
        { validation_errors: schemaResult.errors }
      );
    }

    // 3. Run DAG validation
    const nodesForDag: NodeForValidation[] = plan.nodes.map((n) => ({
      node_id: n.node_id,
      prerequisites: n.prerequisites,
    }));

    const dagResult = validateDag(nodesForDag);
    if (!dagResult.valid) {
      logger.error({ errors: dagResult.errors, requestId }, 'DAG validation failed');
      throw new PlanServiceError(
        'Plan has invalid prerequisite structure',
        'DAG_VALIDATION_FAILED',
        422,
        {
          validation_errors: dagResult.errors,
          has_cycle: dagResult.hasCycle,
          cycle_nodes: dagResult.cycleNodes,
        }
      );
    }

    // 4. Run prerequisite order validation
    const nodesForPrereq: NodeForPrereqValidation[] = plan.nodes.map((n) => ({
      node_id: n.node_id,
      prerequisites: n.prerequisites,
    }));

    const scheduleItems: ScheduleItem[] = plan.schedule.map((s) => ({
      order: s.order,
      node_id: s.node_id,
    }));

    const prereqResult = validatePrerequisiteOrder(nodesForPrereq, scheduleItems);
    if (!prereqResult.valid) {
      logger.error({ errors: prereqResult.errors, requestId }, 'Prerequisite order validation failed');
      throw new PlanServiceError(
        'Plan schedule violates prerequisite order',
        'PREREQ_ORDER_VALIDATION_FAILED',
        422,
        {
          validation_errors: prereqResult.errors,
          violating_nodes: prereqResult.violatingNodes,
        }
      );
    }

    // 5. Persist to database
    // Create order map from schedule
    const orderMap = new Map<string, number>();
    for (const item of plan.schedule) {
      orderMap.set(item.node_id, item.order);
    }

    const nodeInputs: NodeInput[] = plan.nodes.map((node) => ({
      node_id: node.node_id,
      title: node.title,
      objectives: node.objectives,
      prerequisites: node.prerequisites,
      estimated_minutes: node.estimated_minutes,
      tags: node.tags,
      order_index: orderMap.get(node.node_id) || 0,
    }));

    const { plan_id } = await insertPlanWithNodes(
      {
        user_id: request.user_id,
        topic: plan.topic,
        user_level: plan.user_level,
        plan_size: plan.plan_size,
        metadata: plan.metadata as unknown as Record<string, unknown>,
      },
      nodeInputs
    );

    logger.info(
      { planId: plan_id, nodeCount: plan.nodes.length, requestId },
      'Plan created successfully'
    );

    return {
      plan_id,
      plan,
    };
  }

  /**
   * Get a plan by ID.
   */
  async getPlan(planId: string): Promise<Plan | null> {
    const result = await getPlanWithNodes(planId);
    if (!result) {
      return null;
    }

    return this.reconstructPlan(result.plan, result.nodes);
  }

  /**
   * Get all plans for a user.
   */
  async getUserPlans(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Plan[]> {
    const plans = await getUserPlans(userId, options);

    // For list view, we return plans without full nodes
    // If full nodes are needed, call getPlan for each
    return plans.map((plan) => this.reconstructPlanSummary(plan));
  }

  /**
   * Reconstruct a full Plan object from database rows.
   */
  private reconstructPlan(plan: PlanRow, nodes: NodeRow[]): Plan {
    return {
      schema_version: 'plan.v1',
      topic: plan.topic,
      user_level: plan.user_level as 'beginner' | 'intermediate' | 'advanced',
      plan_size: plan.plan_size,
      nodes: nodes.map((node) => ({
        node_id: node.node_id,
        title: node.title,
        objectives: node.objectives,
        prerequisites: node.prerequisites,
        estimated_minutes: node.estimated_minutes,
        tags: node.tags,
      })),
      schedule: nodes.map((node) => ({
        order: node.order_index,
        node_id: node.node_id,
      })),
      metadata: plan.metadata as unknown as Plan['metadata'],
    };
  }

  /**
   * Reconstruct a plan summary (without nodes) from database row.
   */
  private reconstructPlanSummary(plan: PlanRow): Plan {
    return {
      schema_version: 'plan.v1',
      topic: plan.topic,
      user_level: plan.user_level as 'beginner' | 'intermediate' | 'advanced',
      plan_size: plan.plan_size,
      nodes: [],
      schedule: [],
      metadata: plan.metadata as unknown as Plan['metadata'],
    };
  }
}

// Export singleton instance
export const planService = new PlanService();
export default planService;

// Export class for testing
export { PlanService };
