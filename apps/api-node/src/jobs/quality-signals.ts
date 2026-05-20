/**
 * Quality Signals Background Job
 *
 * Runs daily to aggregate quality metrics for cached plans and trigger
 * cache invalidation when thresholds are exceeded.
 */

import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { redis } from '../db/redis';
import { deleteExpiredTokens } from '../db/queries/tokens';
import logger from '../utils/logger';
import { MASTERY_THRESHOLD } from '../constants/mastery';

// Configuration from environment
const ENABLED = process.env.QUALITY_SIGNALS_ENABLED === 'true';
const SCHEDULE = process.env.QUALITY_SIGNALS_SCHEDULE || '0 2 * * *'; // Daily at 2 AM
const MIN_SAMPLE_SIZE = parseInt(process.env.QUALITY_SIGNALS_MIN_SAMPLE_SIZE || '20', 10);

// Quality thresholds (from SPEC.md)
const THRESHOLDS = {
  completion_rate_min: 0.70,      // 70% completion rate minimum
  exercise_pass_rate_min: 0.60,  // 60% exercise pass rate minimum
  negative_feedback_max: 0.10,   // 10% negative feedback maximum
};

interface QualityMetrics {
  plan_id: string;
  normalized_topic: string;
  sample_size: number;
  completion_rate: number | null;
  exercise_pass_rate: number | null;
  avg_time_ratio: number | null;
  negative_feedback_rate: number | null;
}

/**
 * Calculate quality metrics for a specific plan.
 */
async function calculatePlanMetrics(planId: string, normalizedTopic: string): Promise<QualityMetrics | null> {
  const requestId = uuidv4();

  try {
    // Get sample size (number of users who have this plan)
    const sampleResult = await db.query<{ count: string }>(
      'SELECT COUNT(DISTINCT user_id) as count FROM user_plans WHERE plan_id = $1',
      [planId]
    );
    const sampleSize = parseInt(sampleResult.rows[0]?.count || '0', 10);

    if (sampleSize < MIN_SAMPLE_SIZE) {
      logger.debug({ planId, sampleSize, minRequired: MIN_SAMPLE_SIZE }, 'Insufficient sample size');
      return null;
    }

    // Calculate completion rate (users who completed all nodes)
    const completionResult = await db.query<{ rate: string }>(
      `SELECT
        COALESCE(
          COUNT(CASE WHEN completed_nodes = total_nodes THEN 1 END)::float /
          NULLIF(COUNT(*)::float, 0),
          0
        ) as rate
       FROM (
         SELECT up.user_id,
                COUNT(DISTINCT um.node_id) FILTER (WHERE um.mastery_level >= $2) as completed_nodes,
                (SELECT COUNT(*) FROM plan_nodes WHERE plan_id = $1) as total_nodes
         FROM user_plans up
         LEFT JOIN user_mastery um ON um.user_id = up.user_id AND um.plan_id = $1
         WHERE up.plan_id = $1
         GROUP BY up.user_id
       ) sub`,
      [planId, MASTERY_THRESHOLD]
    );
    const completionRate = parseFloat(completionResult.rows[0]?.rate || '0');

    // Calculate exercise pass rate
    const exerciseResult = await db.query<{ rate: string }>(
      `SELECT
        COALESCE(
          COUNT(CASE WHEN is_correct = true THEN 1 END)::float /
          NULLIF(COUNT(*)::float, 0),
          0
        ) as rate
       FROM exercise_attempts ea
       JOIN exercises e ON e.id = ea.exercise_id
       WHERE e.plan_id = $1`,
      [planId]
    );
    const exercisePassRate = parseFloat(exerciseResult.rows[0]?.rate || '0');

    return {
      plan_id: planId,
      normalized_topic: normalizedTopic,
      sample_size: sampleSize,
      completion_rate: completionRate,
      exercise_pass_rate: exercisePassRate,
      avg_time_ratio: null, // TODO: Calculate from session data
      negative_feedback_rate: null, // TODO: Calculate from feedback table
    };

  } catch (error) {
    logger.error({ error, planId, requestId }, 'Failed to calculate plan metrics');
    return null;
  }
}

/**
 * Store metrics and check for threshold violations.
 */
async function processMetrics(metrics: QualityMetrics): Promise<boolean> {
  const requestId = uuidv4();

  // Store in database
  await db.query(
    `INSERT INTO quality_metrics
     (plan_id, normalized_topic, sample_size, completion_rate, exercise_pass_rate, avg_time_ratio, negative_feedback_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      metrics.plan_id,
      metrics.normalized_topic,
      metrics.sample_size,
      metrics.completion_rate,
      metrics.exercise_pass_rate,
      metrics.avg_time_ratio,
      metrics.negative_feedback_rate,
    ]
  );

  // Check thresholds
  let shouldInvalidate = false;

  if (metrics.completion_rate !== null && metrics.completion_rate < THRESHOLDS.completion_rate_min) {
    logger.warn({ ...metrics, requestId }, 'Plan below completion rate threshold');
    shouldInvalidate = true;
  }

  if (metrics.exercise_pass_rate !== null && metrics.exercise_pass_rate < THRESHOLDS.exercise_pass_rate_min) {
    logger.warn({ ...metrics, requestId }, 'Plan below exercise pass rate threshold');
    shouldInvalidate = true;
  }

  if (metrics.negative_feedback_rate !== null && metrics.negative_feedback_rate > THRESHOLDS.negative_feedback_max) {
    logger.warn({ ...metrics, requestId }, 'Plan exceeds negative feedback threshold');
    shouldInvalidate = true;
  }

  return shouldInvalidate;
}

/**
 * Invalidate cache for a topic.
 */
async function invalidateTopicCache(normalizedTopic: string): Promise<void> {
  const client = redis.getClient();
  if (!client) return;

  // Find all keys matching this topic
  const pattern = `lh:plan:${normalizedTopic}:*`;
  let cursor = '0';
  const keysToDelete: string[] = [];

  do {
    const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = newCursor;
    keysToDelete.push(...keys);
  } while (cursor !== '0');

  if (keysToDelete.length > 0) {
    await client.del(...keysToDelete);
    logger.info({ topic: normalizedTopic, keysDeleted: keysToDelete.length }, 'Cache invalidated due to quality signals');
  }
}

/**
 * Main job function.
 */
async function runQualitySignalsJob(): Promise<void> {
  const requestId = uuidv4();
  logger.info({ requestId }, 'Starting quality signals job');

  try {
    // Get all plans with cached entries
    const plansResult = await db.query<{ plan_id: string; topic: string }>(
      `SELECT DISTINCT p.id as plan_id, p.topic
       FROM plans p
       JOIN user_plans up ON up.plan_id = p.id
       GROUP BY p.id, p.topic
       HAVING COUNT(DISTINCT up.user_id) >= $1`,
      [MIN_SAMPLE_SIZE]
    );

    let processed = 0;
    let invalidated = 0;

    for (const plan of plansResult.rows) {
      const metrics = await calculatePlanMetrics(plan.plan_id, plan.topic);
      if (metrics) {
        processed++;
        const shouldInvalidate = await processMetrics(metrics);
        if (shouldInvalidate) {
          await invalidateTopicCache(plan.topic);
          invalidated++;
        }
      }
    }

    // Housekeeping: purge expired and long-revoked refresh tokens
    let tokensPurged = 0;
    try {
      tokensPurged = await deleteExpiredTokens();
    } catch (err) {
      logger.error({ error: err, requestId }, 'Token cleanup failed (non-fatal)');
    }
    logger.info({ requestId, processed, invalidated, tokensPurged }, 'Quality signals job completed');

  } catch (error) {
    logger.error({ error, requestId }, 'Quality signals job failed');
  }
}

/**
 * Start the scheduled job.
 */
export function startQualitySignalsJob(): void {
  if (!ENABLED) {
    logger.info('Quality signals job disabled via QUALITY_SIGNALS_ENABLED');
    return;
  }

  logger.info({ schedule: SCHEDULE }, 'Starting quality signals cron job');

  cron.schedule(SCHEDULE, async () => {
    await runQualitySignalsJob();
  });
}

// Export for manual triggering (admin endpoint or testing)
export { runQualitySignalsJob };
