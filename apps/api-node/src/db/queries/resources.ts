/**
 * Database queries for resources (YouTube videos attached to nodes).
 */

import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import logger from '../../utils/logger';

// Types matching the database schema
export interface ResourceRow {
  resource_id: string;
  plan_id: string;
  node_id: string;
  video_id: string;
  title: string;
  channel_title: string | null;
  url: string;
  duration_seconds: number | null;
  rank_score: number;
  type: 'must_watch' | 'recommended';
  rationale: string | null;
  created_at: Date;
  [key: string]: unknown; // Index signature for db.query generic compatibility
}

// Input type for creating resources
export interface ResourceInput {
  video_id: string;
  title: string;
  channel_title?: string;
  url: string;
  duration_seconds?: number;
  rank_score: number;
  type: 'must_watch' | 'recommended';
  rationale?: string;
}

/**
 * Insert resources for a node in a single transaction.
 *
 * @returns The generated resource_ids
 */
export async function insertResourcesForNode(
  planId: string,
  nodeId: string,
  resources: ResourceInput[]
): Promise<{ resource_ids: string[] }> {
  if (resources.length === 0) {
    return { resource_ids: [] };
  }

  return db.transaction(async (client: PoolClient) => {
    const resourceIds: string[] = [];

    for (const resource of resources) {
      const resourceId = uuidv4();
      resourceIds.push(resourceId);

      await client.query(
        `INSERT INTO resources (resource_id, plan_id, node_id, video_id, title, channel_title, url, duration_seconds, rank_score, type, rationale)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          resourceId,
          planId,
          nodeId,
          resource.video_id,
          resource.title,
          resource.channel_title || null,
          resource.url,
          resource.duration_seconds || null,
          resource.rank_score,
          resource.type,
          resource.rationale || null,
        ]
      );
    }

    logger.info(
      { planId, nodeId, resourceCount: resources.length },
      'Resources inserted for node'
    );

    return { resource_ids: resourceIds };
  });
}

/**
 * Get all resources for a specific node, ordered by rank_score descending.
 */
export async function getResourcesForNode(
  planId: string,
  nodeId: string
): Promise<ResourceRow[]> {
  const result = await db.query<ResourceRow>(
    `SELECT resource_id, plan_id, node_id, video_id, title, channel_title, url, duration_seconds, rank_score, type, rationale, created_at
     FROM resources
     WHERE plan_id = $1 AND node_id = $2
     ORDER BY rank_score DESC`,
    [planId, nodeId]
  );

  return result.rows;
}

/**
 * Get all resources for a plan, grouped by node.
 */
export async function getResourcesForPlan(
  planId: string
): Promise<Record<string, ResourceRow[]>> {
  const result = await db.query<ResourceRow>(
    `SELECT resource_id, plan_id, node_id, video_id, title, channel_title, url, duration_seconds, rank_score, type, rationale, created_at
     FROM resources
     WHERE plan_id = $1
     ORDER BY node_id, rank_score DESC`,
    [planId]
  );

  const grouped: Record<string, ResourceRow[]> = {};

  for (const row of result.rows) {
    if (!grouped[row.node_id]) {
      grouped[row.node_id] = [];
    }
    grouped[row.node_id].push(row);
  }

  return grouped;
}

/**
 * Delete all resources for a specific node.
 * Useful for re-attachment.
 */
export async function deleteResourcesForNode(
  planId: string,
  nodeId: string
): Promise<number> {
  const result = await db.query(
    'DELETE FROM resources WHERE plan_id = $1 AND node_id = $2',
    [planId, nodeId]
  );

  const deletedCount = result.rowCount ?? 0;

  if (deletedCount > 0) {
    logger.info(
      { planId, nodeId, deletedCount },
      'Resources deleted for node'
    );
  }

  return deletedCount;
}

/**
 * Check if a node already has resources attached.
 */
export async function hasResourcesForNode(
  planId: string,
  nodeId: string
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM resources WHERE plan_id = $1 AND node_id = $2) as exists',
    [planId, nodeId]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Get the count of resources for a node.
 */
export async function getResourceCountForNode(
  planId: string,
  nodeId: string
): Promise<number> {
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM resources WHERE plan_id = $1 AND node_id = $2',
    [planId, nodeId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}
