/**
 * Learn service — orchestrates on-demand video + reading material for a node.
 *
 * Flow:
 * 1. Check Redis cache for resources + reading material (fastest)
 * 2. Check DB cache for resources + reading material
 * 3. If cached, return immediately
 * 4. Otherwise: LLM queries → YouTube search → validate descriptions → rank → select top 3
 * 5. Generate reading material from top 3 video descriptions
 * 6. Persist to DB + Redis
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { curriculumClient } from './curriculum-client';
import { youtubeService, type SelectedResource, type Node } from './youtube.service';
import {
  getResourcesForNode,
  insertResourcesForNode,
  hasResourcesForNode,
} from '../db/queries/resources';
import {
  getReadingMaterial,
  insertReadingMaterial,
  hasReadingMaterial,
} from '../db/queries/reading-materials';
import redis from '../db/redis';
import PQueue from 'p-queue';

const LEARN_CACHE_TTL = parseInt(process.env.LEARN_CACHE_TTL_SECONDS ?? '86400', 10);
const PRELOAD_CONCURRENCY = parseInt(process.env.LEARN_PRELOAD_CONCURRENCY ?? '2', 10);

// In-flight deduplication map to prevent duplicate generation for same node
// Key format: `${planId}:${nodeId}`
const inFlight = new Map<string, Promise<LearnContentResult>>();

// Redis cache shape for learn content
interface LearnContentCache {
  resources: SelectedResource[];
  reading_material: {
    sections: Array<{ heading: string; content: string }>;
  } | null;
  cached: true; // Always true when from Redis
}

export interface NodeLearnContent {
  resources: SelectedResource[];
  reading_material: {
    sections: Array<{ heading: string; content: string }>;
  } | null;
  cached: boolean;
  reading_material_error?: string;
}

interface LearnContentResult {
  success: boolean;
  content?: NodeLearnContent;
  error?: string;
}

/**
 * Internal content generation function (without caching or deduplication).
 * This contains the actual LLM + YouTube API logic.
 */
async function generateContent(
  planId: string,
  node: Node,
  reqId: string,
  redisKey: string
): Promise<LearnContentResult> {
  try {
    // Step 1: Check DB cache
    const [hasResources, hasReading] = await Promise.all([
      hasResourcesForNode(planId, node.node_id),
      hasReadingMaterial(planId, node.node_id),
    ]);

    // Full cache hit (DB)
    if (hasResources && hasReading) {
      logger.debug({ nodeId: node.node_id, planId }, 'DB cache hit');

      const resources = await getResourcesForNode(planId, node.node_id);
      const readingMaterial = await getReadingMaterial(planId, node.node_id);

      // Validate sections structure from JSONB
      const validatedSections = readingMaterial?.sections
        ? Array.isArray(readingMaterial.sections)
          ? readingMaterial.sections.filter((s: unknown) =>
              s && typeof s === 'object' &&
              'heading' in s && typeof s.heading === 'string' &&
              'content' in s && typeof s.content === 'string'
            ).map(s => ({
              heading: (s as { heading: string }).heading,
              content: (s as { content: string }).content
            }))
          : null
        : null;

      if (readingMaterial?.sections && (!validatedSections || validatedSections.length === 0)) {
        logger.warn({ nodeId: node.node_id }, 'Reading material sections failed validation');
      }

      const result: NodeLearnContent = {
        resources: resources.map((r) => ({
          videoId: r.video_id,
          title: r.title,
          channelTitle: r.channel_title || '',
          url: r.url,
          durationSeconds: r.duration_seconds || 0,
          rankScore: r.rank_score,
          type: r.type,
          rationale: r.rationale || '',
        })),
        reading_material: validatedSections?.length ? { sections: validatedSections } : null,
        cached: true,
      };

      // Populate Redis cache for next request (24h TTL)
      await redis.setJSON(redisKey, {
        resources: result.resources,
        reading_material: result.reading_material,
        cached: true,
      }, LEARN_CACHE_TTL);

      return {
        success: true,
        content: result,
      };
    }

    let resources: SelectedResource[];

    if (hasResources) {
      // Partial cache: resources exist, reading material missing
      logger.info({ nodeId: node.node_id }, 'Partial cache - loading resources from DB');
      const rows = await getResourcesForNode(planId, node.node_id);
      resources = rows.map((r) => ({
        videoId: r.video_id,
        title: r.title,
        channelTitle: r.channel_title || '',
        url: r.url,
        durationSeconds: r.duration_seconds || 0,
        rankScore: r.rank_score,
        type: r.type,
        rationale: r.rationale || '',
      }));
    } else {
      // Full cache miss: generate queries → search → validate → persist
      logger.info({ nodeId: node.node_id, planId }, 'Learn content cache miss - generating');

      // Step 1: Generate or fallback to search queries
      let searchQueries: string[] = [];

      try {
        const querySuggestions = await curriculumClient.generateQueries({
          plan_id: planId,
          node_id: node.node_id,
          node_title: node.title,
          node_objectives: node.objectives,
          node_tags: node.tags || [],
          request_id: reqId,
        });
        searchQueries = querySuggestions.queries;
        logger.debug({ nodeId: node.node_id, queryCount: searchQueries.length }, 'LLM queries generated');
      } catch (error) {
        // Fallback to simple queries if LLM fails
        logger.warn({ nodeId: node.node_id, error }, 'LLM query generation failed, using fallback');
        searchQueries = generateFallbackQueries(node);
      }

      // Step 2: Attach YouTube resources (searches, validates, ranks, selects)
      resources = await youtubeService.attachResourcesForNode(
        node,
        planId,
        searchQueries,
        {
          mustWatchCount: 1,
          recommendedCount: 2,
          validateVideos: true,
        }
      );

      if (resources.length === 0) {
        logger.warn({ nodeId: node.node_id }, 'No resources found for node');
        return {
          success: true,
          content: {
            resources: [],
            reading_material: null,
            cached: false,
          },
        };
      }

      // Step 3: Persist resources to DB
      await insertResourcesForNode(
        planId,
        node.node_id,
        resources.map((r) => ({
          video_id: r.videoId,
          title: r.title,
          channel_title: r.channelTitle,
          url: r.url,
          duration_seconds: r.durationSeconds,
          rank_score: r.rankScore,
          type: r.type,
          rationale: r.rationale,
        }))
      );
    }

    // Step 4: Generate reading material from top 3 videos (only if missing)
    let readingMaterial: { sections: Array<{ heading: string; content: string }> } | null = null;

    if (!hasReading && resources.length > 0) {
      try {
        // Prepare description-based inputs for reading material generation
        const descriptionInputs = resources.slice(0, 3).map((resource) => {
          if (!resource.description) {
            logger.warn(
              { videoId: resource.videoId, nodeId: node.node_id },
              'No description for video — using title fallback for reading material (lower quality)'
            );
          }
          return {
            video_id: resource.videoId,
            title: resource.title,
            content_text: resource.description ?? `${resource.title} by ${resource.channelTitle}`,
          };
        });

        const material = await curriculumClient.generateReadingMaterial({
          plan_id: planId,
          node_id: node.node_id,
          node_title: node.title,
          node_objectives: node.objectives,
          transcripts: descriptionInputs,
          request_id: reqId,
        });

        // Persist reading material to DB
        await insertReadingMaterial(planId, node.node_id, {
          sections: material.sections,
          metadata: {
            provider: material.metadata.provider,
            model: material.metadata.model,
            prompt_version: material.metadata.prompt_version,
            created_at: material.metadata.created_at,
            request_id: material.metadata.request_id,
            raw_output_hash: material.metadata.raw_output_hash,
            artifact_hash: material.metadata.artifact_hash,
            validation_retry_count: material.metadata.validation_retry_count,
          },
        });

        readingMaterial = {
          sections: material.sections.map((s) => ({
            heading: s.heading,
            content: s.content,
          })),
        };

        logger.info(
          { nodeId: node.node_id, sectionCount: material.sections.length },
          'Reading material generated'
        );
      } catch (error) {
        // Non-fatal: return resources without reading material
        logger.error({ nodeId: node.node_id, error }, 'Reading material generation failed (non-fatal)');
        readingMaterial = null;

        // Return result with error indicator
        const result: NodeLearnContent = {
          resources,
          reading_material: null,
          cached: false,
          reading_material_error: 'Reading material temporarily unavailable',
        };

        // Populate Redis cache for next request (24h TTL)
        await redis.setJSON(redisKey, {
          resources: result.resources,
          reading_material: result.reading_material,
          cached: true,
        }, LEARN_CACHE_TTL);

        return {
          success: true,
          content: result,
        };
      }
    }

    const result: NodeLearnContent = {
      resources,
      reading_material: readingMaterial,
      cached: false,
    };

    // Populate Redis cache for next request (24h TTL)
    await redis.setJSON(redisKey, {
      resources: result.resources,
      reading_material: result.reading_material,
      cached: true,
    }, LEARN_CACHE_TTL);

    return {
      success: true,
      content: result,
    };
  } catch (error) {
    logger.error({ nodeId: node.node_id, planId, error }, 'Learn content generation failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get learn content for a node (videos + reading material).
 * Uses in-flight deduplication to prevent duplicate generation.
 * On first request: generates content via LLM + YouTube API, caches in DB + Redis.
 * On subsequent requests: returns from Redis cache (fastest) or DB cache.
 */
export async function getNodeLearnContent(
  planId: string,
  node: Node,
  requestId?: string
): Promise<LearnContentResult> {
  const reqId = requestId || uuidv4();
  const inFlightKey = `${planId}:${node.node_id}`;

  try {
    // Step 1: Check Redis cache first (fastest)
    const redisKey = `learn:${planId}:${node.node_id}`;
    const cached = await redis.getJSON<LearnContentCache>(redisKey);
    if (cached) {
      logger.debug({ nodeId: node.node_id, planId }, 'Redis cache hit');
      return { success: true, content: cached };
    }

    // Step 2: Check if already generating (in-flight deduplication)
    const existingPromise = inFlight.get(inFlightKey);
    if (existingPromise) {
      logger.debug({ nodeId: node.node_id, planId }, 'Content already generating, awaiting existing promise');
      return await existingPromise;
    }

    // Step 3: Create new generation promise
    const generationPromise = (async () => {
      try {
        return await generateContent(planId, node, reqId, redisKey);
      } finally {
        // Clean up in-flight map when done
        inFlight.delete(inFlightKey);
      }
    })();

    inFlight.set(inFlightKey, generationPromise);
    return await generationPromise;
  } catch (error) {
    logger.error({ nodeId: node.node_id, planId, error }, 'Learn content generation failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate fallback search queries when LLM generation fails.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was',
  'will', 'can', 'how', 'what', 'use', 'you', 'your', 'its', 'has',
]);

function generateFallbackQueries(node: Node): string[] {
  const queries: string[] = [];

  // Query from title
  queries.push(`${node.title} tutorial`);

  // Queries from objectives
  for (const objective of node.objectives.slice(0, 2)) {
    // Extract key terms from objective
    const words = objective.toLowerCase().split(/\s+/);
    const keyWords = words.filter(w => w.length > 2 && !STOP_WORDS.has(w)).slice(0, 3);
    if (keyWords.length > 0) {
      queries.push(keyWords.join(' '));
    }
  }

  // Query from tags if available
  if (node.tags && node.tags.length > 0) {
    queries.push(`${node.tags[0]} explained`);
  }

  // Dedupe and limit
  return Array.from(new Set(queries)).slice(0, 5);
}

// ==================== Helper Functions ====================

/**
 * Get node IDs for initially-unlocked nodes (no prerequisites).
 * Pure function for testability.
 */
export function getInitiallyUnlockedNodeIds(nodes: Node[]): string[] {
  return nodes.filter(n => n.prerequisites.length === 0).map(n => n.node_id);
}

/**
 * Get node IDs for depth-1 neighbors of unlocked nodes.
 * A depth-1 neighbor is a node whose only prerequisites are in the unlocked set.
 * Pure function for testability.
 */
export function getDepth1NeighborIds(unlockedIds: Set<string>, nodes: Node[]): string[] {
  return nodes
    .filter(n => {
      if (n.prerequisites.length === 0) return false; // Already unlocked
      return n.prerequisites.every(p => unlockedIds.has(p));
    })
    .map(n => n.node_id);
}

/**
 * Preload resources for multiple nodes in parallel with controlled concurrency.
 * Uses p-queue to limit concurrent LLM calls and prevent resource exhaustion.
 * Non-fatal: logs errors but continues preloading other nodes.
 */
export async function preloadNodeResources(
  planId: string,
  nodeIds: string[],
  allNodes: Node[]
): Promise<void> {
  if (nodeIds.length === 0) return;

  logger.info({ planId, nodeCount: nodeIds.length }, 'Starting resource preloading');

  const queue = new PQueue({ concurrency: PRELOAD_CONCURRENCY });
  const preloadErrors: Array<{ nodeId: string; error: unknown }> = [];

  for (const nodeId of nodeIds) {
    queue.add(async () => {
      try {
        const node = allNodes.find(n => n.node_id === nodeId);
        if (!node) return;

        await getNodeLearnContent(planId, node, uuidv4());
        logger.debug({ planId, nodeId }, 'Preload complete');
      } catch (error) {
        logger.warn({ planId, nodeId, error }, 'Preload failed (continuing)');
        preloadErrors.push({ nodeId, error });
      }
    });
  }

  await queue.onIdle();

  if (preloadErrors.length > 0) {
    logger.warn({ planId, errorCount: preloadErrors.length }, 'Preload completed with errors');
  } else {
    logger.info({ planId, nodeCount: nodeIds.length }, 'Preload completed successfully');
  }
}

// Export Node type for use in other modules
export type { Node };

/**
 * Convert DB node rows to the Node domain type used by the learn service.
 */
export function nodeRowsToLearningNodes(
  rows: Array<{
    node_id: string;
    title: string;
    objectives: string[];
    prerequisites: string[];
    estimated_minutes: number;
    tags?: string[] | null;
  }>
): Node[] {
  return rows.map(n => ({
    node_id: n.node_id,
    title: n.title,
    objectives: n.objectives,
    prerequisites: n.prerequisites,
    estimated_minutes: n.estimated_minutes,
    tags: n.tags ?? undefined,
  }));
}
