/**
 * Database queries for plans and nodes.
 */

import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import logger from '../../utils/logger';

// Types matching the database schema
export interface PlanRow {
  plan_id: string;
  user_id: string;
  topic: string;
  user_level: string;
  plan_size: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface NodeRow {
  plan_id: string;
  node_id: string;
  title: string;
  objectives: string[];
  prerequisites: string[];
  estimated_minutes: number;
  tags: string[] | null;
  order_index: number;
}

// Input types for creating plans
export interface PlanInput {
  user_id?: string | null;
  topic: string;
  user_level: string;
  plan_size: string;
  metadata: Record<string, unknown>;
}

export interface NodeInput {
  node_id: string;
  title: string;
  objectives: string[];
  prerequisites: string[];
  estimated_minutes: number;
  tags?: string[] | null;
  order_index: number;
}

export interface PlanWithNodes {
  plan: PlanRow;
  nodes: NodeRow[];
}

/**
 * Insert a plan and its nodes in a single transaction.
 *
 * @returns The generated plan_id
 */
export async function insertPlanWithNodes(
  planInput: PlanInput,
  nodes: NodeInput[]
): Promise<{ plan_id: string }> {
  const planId = uuidv4();
  const userId = planInput.user_id || 'anonymous';

  return db.transaction(async (client: PoolClient) => {
    // Insert plan
    await client.query(
      `INSERT INTO plans (plan_id, user_id, topic, user_level, plan_size, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        planId,
        userId,
        planInput.topic,
        planInput.user_level,
        planInput.plan_size,
        JSON.stringify(planInput.metadata),
      ]
    );

    // Insert all nodes
    for (const node of nodes) {
      await client.query(
        `INSERT INTO nodes (plan_id, node_id, title, objectives, prerequisites, estimated_minutes, tags, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          planId,
          node.node_id,
          node.title,
          JSON.stringify(node.objectives),
          JSON.stringify(node.prerequisites),
          node.estimated_minutes,
          node.tags ? JSON.stringify(node.tags) : null,
          node.order_index,
        ]
      );
    }

    logger.info({ planId, nodeCount: nodes.length }, 'Plan and nodes inserted');

    return { plan_id: planId };
  });
}

/**
 * Get a plan with all its nodes by plan_id.
 */
export async function getPlanWithNodes(planId: string): Promise<PlanWithNodes | null> {
  // Get plan
  const planResult = await db.query(
    `SELECT plan_id, user_id, topic, user_level, plan_size, metadata, created_at
     FROM plans WHERE plan_id = $1`,
    [planId]
  );

  if (planResult.rows.length === 0) {
    return null;
  }

  const plan = planResult.rows[0] as unknown as PlanRow;

  // Get nodes ordered by schedule position
  const nodesResult = await db.query(
    `SELECT plan_id, node_id, title, objectives, prerequisites, estimated_minutes, tags, order_index
     FROM nodes WHERE plan_id = $1 ORDER BY order_index`,
    [planId]
  );

  return {
    plan,
    nodes: nodesResult.rows as unknown as NodeRow[],
  };
}

/**
 * Get all plans for a user.
 */
export async function getUserPlans(
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<PlanRow[]> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const result = await db.query(
    `SELECT plan_id, user_id, topic, user_level, plan_size, metadata, created_at
     FROM plans
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows as unknown as PlanRow[];
}

/**
 * Delete a plan and all associated data (cascades to nodes, resources, etc.).
 */
export async function deletePlan(planId: string): Promise<boolean> {
  const result = await db.query('DELETE FROM plans WHERE plan_id = $1', [planId]);
  const deleted = (result.rowCount ?? 0) > 0;

  if (deleted) {
    logger.info({ planId }, 'Plan deleted');
  }

  return deleted;
}

/**
 * Check if a plan exists.
 */
export async function planExists(planId: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM plans WHERE plan_id = $1) as exists',
    [planId]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Get the count of plans for a user.
 */
export async function getUserPlanCount(userId: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM plans WHERE user_id = $1',
    [userId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}
