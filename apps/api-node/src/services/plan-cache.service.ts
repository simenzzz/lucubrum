/**
 * Plan cache service for staleness detection and cache management.
 *
 * Handles:
 * - Cached plan staleness checking via Python service
 * - Cache invalidation decisions
 * - MCP fact gathering (placeholder for future integration)
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import {
  curriculumClient,
  ResourceInfo,
  CurriculumServiceError,
} from './curriculum-client';

export interface CachedPlan {
  cache_key: string;
  topic: string;
  topic_normalized: string;
  user_level: string;
  plan_data: Record<string, unknown>;
  domain_category: string;
  staleness_policy: string;
  factSnapshot: string[];  // Facts at time of caching for staleness comparison
  created_at: Date;
  last_staleness_check: Date | null;
}

export interface CachedResource {
  video_id: string;
  title: string;
  transcript_excerpt?: string;
}

export interface StalenessCheckOptions {
  /** Whether to force a check even if recently checked */
  forceCheck?: boolean;
  /** Custom MCP facts to use (for testing) */
  mcpFacts?: string[];
}

export interface StalenessCheckResult {
  isStale: boolean;
  contradictionRate: number;
  staleReason: string | null;
  sourcesChecked: string[];
  contradictionsFound: string[];
  checkedAt: Date;
}

/**
 * Plan cache service for managing cached plans and staleness detection.
 */
class PlanCacheService {
  private contradictionThreshold: number;
  private checkCooldownHours: number;

  constructor() {
    this.contradictionThreshold = parseFloat(
      process.env.STALENESS_CONTRADICTION_THRESHOLD || '0.10'
    );
    this.checkCooldownHours = parseInt(process.env.STALENESS_CHECK_COOLDOWN_HOURS || '24', 10);
  }

  /**
   * Check if a cached plan needs a staleness check.
   */
  shouldCheckStaleness(plan: CachedPlan): boolean {
    // If never checked, definitely should check
    if (!plan.last_staleness_check) {
      return true;
    }

    // Check based on staleness policy
    const hoursSinceCheck =
      (Date.now() - plan.last_staleness_check.getTime()) / (1000 * 60 * 60);

    switch (plan.staleness_policy) {
      case 'never':
        return false;
      case '7d':
        return hoursSinceCheck >= 24 * 7;
      case '30d':
        return hoursSinceCheck >= 24 * 30;
      case '90d':
        return hoursSinceCheck >= 24 * 90;
      case 'annual':
        return hoursSinceCheck >= 24 * 365;
      default:
        return hoursSinceCheck >= this.checkCooldownHours;
    }
  }

  /**
   * Gather current facts from MCP sources for a topic.
   *
   * Calls the Python service to get facts from Context7 + Brave Search.
   */
  async gatherMCPFacts(topic: string): Promise<string[]> {
    try {
      const response = await curriculumClient.getFacts({
        normalized_topic: topic,
        keywords: [],
        request_id: uuidv4(),
      });
      logger.debug({ topic, factCount: response.facts.length }, 'MCP facts gathered');
      return response.facts;
    } catch (error) {
      logger.warn({ topic, error }, 'MCP fact gathering failed, returning empty facts');
      return [];
    }
  }

  /**
   * Generate a summary of a plan for staleness comparison.
   */
  generatePlanSummary(plan: CachedPlan): string {
    const planData = plan.plan_data;
    const nodes = (planData.nodes as Array<{ title: string; objectives: string[] }>) || [];

    const nodeSummaries = nodes
      .slice(0, 10) // Limit to first 10 nodes
      .map((node) => `- ${node.title}: ${node.objectives.join(', ')}`)
      .join('\n');

    return `Topic: ${plan.topic}\nLevel: ${plan.user_level}\nNodes:\n${nodeSummaries}`;
  }

  /**
   * Check if a cached plan is stale compared to current sources.
   */
  async checkStaleness(
    plan: CachedPlan,
    resources: CachedResource[],
    options: StalenessCheckOptions = {}
  ): Promise<StalenessCheckResult> {
    const requestId = uuidv4();

    logger.info({ cacheKey: plan.cache_key, topic: plan.topic }, 'Starting staleness check');

    // Skip if recently checked (unless forced)
    if (!options.forceCheck && !this.shouldCheckStaleness(plan)) {
      logger.debug({ cacheKey: plan.cache_key }, 'Skipping staleness check - recently checked');
      return {
        isStale: false,
        contradictionRate: 0,
        staleReason: null,
        sourcesChecked: [],
        contradictionsFound: [],
        checkedAt: plan.last_staleness_check || new Date(),
      };
    }

    // Gather MCP facts (or use provided ones)
    const mcpFacts = options.mcpFacts ?? (await this.gatherMCPFacts(plan.topic));

    // If no facts available, cannot determine staleness
    if (mcpFacts.length === 0) {
      logger.debug({ cacheKey: plan.cache_key }, 'No MCP facts available - assuming fresh');
      return {
        isStale: false,
        contradictionRate: 0,
        staleReason: null,
        sourcesChecked: [],
        contradictionsFound: [],
        checkedAt: new Date(),
      };
    }

    try {
      // Call Python service for staleness check
      const resourceInfos: ResourceInfo[] = resources.map((r) => ({
        video_id: r.video_id,
        title: r.title,
        transcript_excerpt: r.transcript_excerpt,
      }));

      // Include old facts from factSnapshot for comparison
      const oldFacts = plan.factSnapshot || [];

      const result = await curriculumClient.checkStaleness({
        cache_key: plan.cache_key,
        topic: plan.topic,
        plan_summary: this.generatePlanSummary(plan),
        resources: resourceInfos,
        old_facts: oldFacts,  // Facts at time of caching
        mcp_facts: mcpFacts,  // Current facts from MCP
        request_id: requestId,
      });

      logger.info(
        {
          cacheKey: plan.cache_key,
          isStale: result.is_stale,
          contradictionRate: result.contradiction_rate,
        },
        'Staleness check complete'
      );

      return {
        isStale: result.is_stale,
        contradictionRate: result.contradiction_rate,
        staleReason: result.stale_reason,
        sourcesChecked: result.sources_checked,
        contradictionsFound: result.contradictions_found,
        checkedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof CurriculumServiceError) {
        logger.error(
          { cacheKey: plan.cache_key, error: error.message },
          'Staleness check failed'
        );
      } else {
        logger.error({ cacheKey: plan.cache_key, error }, 'Unexpected staleness check error');
      }

      // On error, assume not stale to avoid unnecessary regeneration
      return {
        isStale: false,
        contradictionRate: 0,
        staleReason: null,
        sourcesChecked: [],
        contradictionsFound: [],
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Batch check staleness for multiple cached plans.
   */
  async batchCheckStaleness(
    plans: Array<{ plan: CachedPlan; resources: CachedResource[] }>,
    options: StalenessCheckOptions = {}
  ): Promise<Map<string, StalenessCheckResult>> {
    const results = new Map<string, StalenessCheckResult>();

    // Process sequentially to avoid overwhelming the service
    // Could be parallelized with rate limiting in production
    for (const { plan, resources } of plans) {
      const result = await this.checkStaleness(plan, resources, options);
      results.set(plan.cache_key, result);
    }

    return results;
  }

  /**
   * Determine if a plan should be regenerated based on staleness.
   */
  shouldRegenerate(result: StalenessCheckResult): boolean {
    return result.isStale && result.contradictionRate >= this.contradictionThreshold;
  }
}

// Export singleton instance
export const planCacheService = new PlanCacheService();
export default planCacheService;
