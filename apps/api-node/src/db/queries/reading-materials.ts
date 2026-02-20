/**
 * Database queries for reading materials (LLM-generated learning content).
 */

import { db } from '../client';
import logger from '../../utils/logger';

// Maximum JSON size to prevent oversized data (1MB)
const MAX_JSON_SIZE = 1_000_000;

// Types matching the database schema
export interface ReadingMaterialRow {
  plan_id: string;
  node_id: string;
  sections: Array<{ heading: string; content: string }>;
  metadata: Record<string, unknown>;
  created_at: Date;
  [key: string]: unknown; // Index signature for db.query generic compatibility
}

// Input type for creating reading materials
export interface ReadingMaterialInput {
  sections: Array<{ heading: string; content: string }>;
  metadata: Record<string, unknown>;
}

/**
 * Insert or update reading material for a node.
 *
 * Uses ON CONFLICT to upsert - updates existing material if present.
 */
export async function insertReadingMaterial(
  planId: string,
  nodeId: string,
  material: ReadingMaterialInput
): Promise<void> {
  // Validate JSON size before serialization to prevent oversized data
  const sectionsJson = JSON.stringify(material.sections);
  const metadataJson = JSON.stringify(material.metadata);

  if (sectionsJson.length > MAX_JSON_SIZE || metadataJson.length > MAX_JSON_SIZE) {
    throw new Error(`JSON data exceeds maximum size limit of ${MAX_JSON_SIZE} bytes`);
  }

  await db.query(
    `INSERT INTO reading_materials (plan_id, node_id, sections, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (plan_id, node_id) DO UPDATE
     SET sections = EXCLUDED.sections,
         metadata = EXCLUDED.metadata`,
    [planId, nodeId, sectionsJson, metadataJson]
  );

  logger.info(
    { planId, nodeId, sectionCount: material.sections.length },
    'Reading material inserted for node'
  );
}

/**
 * Get reading material for a specific node.
 */
export async function getReadingMaterial(
  planId: string,
  nodeId: string
): Promise<ReadingMaterialRow | null> {
  const result = await db.query<ReadingMaterialRow>(
    `SELECT plan_id, node_id, sections, metadata, created_at
     FROM reading_materials
     WHERE plan_id = $1 AND node_id = $2`,
    [planId, nodeId]
  );

  return result.rows[0] || null;
}

/**
 * Check if a node already has reading material.
 */
export async function hasReadingMaterial(
  planId: string,
  nodeId: string
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM reading_materials WHERE plan_id = $1 AND node_id = $2) as exists',
    [planId, nodeId]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Delete reading material for a specific node.
 * Useful for re-generation.
 */
export async function deleteReadingMaterial(
  planId: string,
  nodeId: string
): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM reading_materials WHERE plan_id = $1 AND node_id = $2',
    [planId, nodeId]
  );

  const deleted = (result.rowCount ?? 0) > 0;

  if (deleted) {
    logger.info(
      { planId, nodeId },
      'Reading material deleted for node'
    );
  }

  return deleted;
}
