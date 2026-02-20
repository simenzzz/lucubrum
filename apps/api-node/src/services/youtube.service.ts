/**
 * YouTube service for video search and resource attachment.
 *
 * Handles:
 * - YouTube Data API integration for video search
 * - Redis caching for quota optimization
 * - Description-based validation via Python service
 * - Deterministic video ranking with instructor trust
 * - Video selection (must_watch / recommended)
 */

import axios from 'axios';
import crypto from 'crypto';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { redis } from '../db/redis';
import { curriculumClient } from './curriculum-client';
import { getInstructorsByChannelNames } from '../db/queries/trusted-instructors';

/**
 * Sanitize axios errors before logging to prevent leaking sensitive data.
 */
function sanitizeAxiosError(error: unknown): unknown {
  if (axios.isAxiosError(error)) {
    const { config, ...rest } = error;
    const sanitizedConfig = config ? {
      ...config,
      params: config.params ? { ...config.params, key: '[REDACTED]' } : undefined
    } : undefined;
    return { ...rest, config: sanitizedConfig };
  }
  return error;
}

// YouTube API types
export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
}

export interface VideoCandidate extends YouTubeVideo {
  searchQuery: string;
}

export interface ValidatedVideo extends VideoCandidate {
  relevanceScore: number;
  matchedObjectives: string[];
}

export interface SelectedResource {
  videoId: string;
  title: string;
  channelTitle: string;
  description?: string;
  url: string;
  durationSeconds: number;
  rankScore: number;
  type: 'must_watch' | 'recommended';
  rationale: string;
}

export interface Node {
  node_id: string;
  title: string;
  objectives: string[];
  prerequisites: string[];
  estimated_minutes: number;
  tags?: string[];
}

export interface ResourceAttachmentOptions {
  minRelevanceScore?: number;
  mustWatchCount?: number;
  recommendedCount?: number;
  validateVideos?: boolean;
}

// Cache types
interface CachedSearchResult {
  query: string;
  results: VideoCandidate[];
  cachedAt: string;
  apiQuotaCost: number;
}

interface SearchQuotaStats {
  totalQueries: number;
  cacheHits: number;
  apiCalls: number;
  estimatedQuotaUsed: number;
}

const DEFAULT_OPTIONS: Required<ResourceAttachmentOptions> = {
  minRelevanceScore: 0.6,
  mustWatchCount: 1,
  recommendedCount: 2,
  validateVideos: true,
};

/**
 * YouTube service class for video operations.
 */
class YouTubeService {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';
  private cacheTtlSeconds: number;
  private cacheKeyPrefix = 'youtube:search:';
  // YouTube API quota costs
  private readonly SEARCH_QUOTA_COST = 100;
  private readonly VIDEOS_QUOTA_COST = 1;

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('YOUTUBE_API_KEY not set - YouTube search will fail');
    }
    // Default to 7 days cache TTL
    this.cacheTtlSeconds = parseInt(
      process.env.YOUTUBE_CACHE_TTL_SECONDS || String(7 * 24 * 60 * 60),
      10
    );
  }

  /**
   * Generate cache key for a search query.
   * Uses SHA-256 hash of query (first 32 chars) for key.
   */
  private getCacheKey(query: string): string {
    const hash = crypto.createHash('sha256').update(query).digest('hex').slice(0, 32);
    return `${this.cacheKeyPrefix}${hash}`;
  }

  /**
   * Search YouTube for videos matching queries.
   * Runs all queries in parallel with concurrency cap. Uses Redis caching to reduce API quota usage.
   */
  async searchVideos(queries: string[], maxResultsPerQuery = 5): Promise<VideoCandidate[]> {
    const stats: SearchQuotaStats = {
      totalQueries: queries.length,
      cacheHits: 0,
      apiCalls: 0,
      estimatedQuotaUsed: 0,
    };

    // Use concurrency cap to prevent burst quota exhaustion
    const searchQueue = new PQueue({ concurrency: 5 });

    const settledResults = await Promise.allSettled(
      queries.map((query) =>
        searchQueue.add(() => this.fetchSingleQuery(query, maxResultsPerQuery))
      )
    );

    const allCandidates: VideoCandidate[] = [];
    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i];
      if (result.status === 'fulfilled') {
        stats.cacheHits += result.value.cacheHit ? 1 : 0;
        stats.apiCalls += result.value.cacheHit ? 0 : 1;
        stats.estimatedQuotaUsed += result.value.cacheHit
          ? 0
          : this.SEARCH_QUOTA_COST + this.VIDEOS_QUOTA_COST;
        allCandidates.push(...result.value.results);
      } else {
        logger.error({ error: sanitizeAxiosError(result.reason), query: queries[i] }, 'YouTube search failed for query');
      }
    }

    // Log quota stats
    logger.info(
      {
        totalQueries: stats.totalQueries,
        cacheHits: stats.cacheHits,
        apiCalls: stats.apiCalls,
        estimatedQuotaUsed: stats.estimatedQuotaUsed,
      },
      'YouTube search quota usage'
    );

    // Deduplicate by videoId
    const seen = new Set<string>();
    return allCandidates.filter((video) => {
      if (seen.has(video.videoId)) return false;
      seen.add(video.videoId);
      return true;
    });
  }

  /**
   * Fetch results for a single query, checking cache first.
   */
  private async fetchSingleQuery(
    query: string,
    maxResultsPerQuery: number
  ): Promise<{ results: VideoCandidate[]; cacheHit: boolean }> {
    const cacheKey = this.getCacheKey(query);
    const cached = await redis.getJSON<CachedSearchResult>(cacheKey);

    if (cached) {
      logger.debug({ query, cacheKey }, 'YouTube search cache hit');
      return { results: cached.results, cacheHit: true };
    }

    // Cache miss - call YouTube API
    const results = await this.searchYouTubeApi(query, maxResultsPerQuery);

    if (results.length > 0) {
      const cacheEntry: CachedSearchResult = {
        query,
        results,
        cachedAt: new Date().toISOString(),
        apiQuotaCost: this.SEARCH_QUOTA_COST + this.VIDEOS_QUOTA_COST,
      };
      await redis.setJSON(cacheKey, cacheEntry, this.cacheTtlSeconds);
      logger.debug({ query, cacheKey, resultCount: results.length }, 'YouTube search cached');
    }

    return { results, cacheHit: false };
  }

  /**
   * Call YouTube API directly (without cache).
   */
  private async searchYouTubeApi(
    query: string,
    maxResults: number
  ): Promise<VideoCandidate[]> {
    const results: VideoCandidate[] = [];

    const searchResponse = await axios.get(`${this.baseUrl}/search`, {
      params: {
        key: this.apiKey,
        q: query,
        part: 'snippet',
        type: 'video',
        maxResults,
        videoEmbeddable: 'true',
        relevanceLanguage: 'en',
      },
    });

    const videoIds = searchResponse.data.items
      .map((item: { id: { videoId: string } }) => item.id.videoId)
      .join(',');

    if (!videoIds) return results;

    // Get video details including duration and statistics
    const detailsResponse = await axios.get(`${this.baseUrl}/videos`, {
      params: {
        key: this.apiKey,
        id: videoIds,
        part: 'snippet,contentDetails,statistics',
      },
    });

    for (const item of detailsResponse.data.items) {
      const candidate: VideoCandidate = {
        videoId: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        durationSeconds: this.parseDuration(item.contentDetails.duration),
        viewCount: parseInt(item.statistics.viewCount || '0', 10),
        likeCount: parseInt(item.statistics.likeCount || '0', 10),
        searchQuery: query,
      };

      results.push(candidate);
    }

    return results;
  }

  /**
   * Validate and filter videos using description analysis.
   * Runs validations in parallel with a configurable concurrency cap.
   */
  async validateAndFilterVideos(
    candidates: VideoCandidate[],
    node: Node,
    planId: string,
    requestId: string,
    minRelevanceScore = 0.5
  ): Promise<ValidatedVideo[]> {
    const concurrency = parseInt(process.env.VIDEO_VALIDATION_CONCURRENCY ?? '5', 10);
    const queue = new PQueue({ concurrency });

    type ValidationResult = { video: VideoCandidate; validated: ValidatedVideo | null };

    const results = await queue.addAll(
      candidates.map((video) => async (): Promise<ValidationResult> => {
        try {
          const validation = await curriculumClient.validateVideo({
            video_id: video.videoId,
            plan_id: planId,
            node_id: node.node_id,
            node_title: node.title,
            node_objectives: node.objectives,
            content_text: video.description || `${video.title} by ${video.channelTitle}`,
            video_title: video.title,
            channel_name: video.channelTitle,
            request_id: requestId,
          });

          if (validation.is_relevant && validation.relevance_score >= minRelevanceScore) {
            return {
              video,
              validated: {
                ...video,
                relevanceScore: validation.relevance_score,
                matchedObjectives: validation.matched_objectives,
              },
            };
          }

          logger.debug(
            {
              videoId: video.videoId,
              relevanceScore: validation.relevance_score,
              reason: validation.rejection_reason,
            },
            'Video rejected due to low relevance'
          );
          return { video, validated: null };
        } catch (error) {
          // Log but continue - some videos may fail validation
          logger.warn({ videoId: video.videoId, error }, 'Video validation failed');
          return { video, validated: null };
        }
      })
    );

    return results
      .filter((r): r is { video: VideoCandidate; validated: ValidatedVideo } => r.validated !== null)
      .map((r) => r.validated);
  }

  /**
   * Rank validated videos using deterministic scoring with instructor trust.
   */
  async rankVideos(videos: ValidatedVideo[], node: Node): Promise<ValidatedVideo[]> {
    // Pre-fetch all instructor scores in batch
    const channelNames = [...new Set(videos.map((v) => v.channelTitle).filter(Boolean))];
    const instructorMap = await getInstructorsByChannelNames(channelNames);

    return videos
      .map((video) => {
        let score = video.relevanceScore * 0.35; // 35% relevance

        // Engagement score
        const engagementRatio = video.likeCount / Math.max(video.viewCount, 1);
        score += Math.min(engagementRatio * 10, 0.15); // 15% for engagement

        // Duration
        const idealDuration = node.estimated_minutes * 60;
        const durationRatio = video.durationSeconds / idealDuration;
        if (durationRatio >= 0.5 && durationRatio <= 2.0) {
          score += 0.10; // 10% for good duration
        } else if (durationRatio >= 0.25 && durationRatio <= 3.0) {
          score += 0.05;
        }

        // Objective coverage
        const coverageRatio = video.matchedObjectives.length / node.objectives.length;
        score += coverageRatio * 0.15; // 15% for coverage

        // Recency
        const videoAge = (Date.now() - new Date(video.publishedAt).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (videoAge <= 2) {
          score += 0.10; // 10% for recent
        } else if (videoAge <= 5) {
          score += 0.05;
        }

        // Instructor trust (NEW)
        const instructor = instructorMap.get(video.channelTitle?.toLowerCase());
        if (instructor) {
          score += instructor.reliability_score * 0.15; // Up to 15% for trusted instructors
        } else {
          score += 0.5 * 0.15; // Neutral baseline for unknown channels
        }

        return { ...video, relevanceScore: Math.min(score, 1.0) };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Select top videos for a node.
   */
  selectTopVideos(
    rankedVideos: ValidatedVideo[],
    mustWatchCount = 1,
    recommendedCount = 2
  ): SelectedResource[] {
    const selected: SelectedResource[] = [];

    for (let i = 0; i < rankedVideos.length && selected.length < mustWatchCount + recommendedCount; i++) {
      const video = rankedVideos[i];
      const type = selected.length < mustWatchCount ? 'must_watch' : 'recommended';

      selected.push({
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        description: video.description,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        durationSeconds: video.durationSeconds,
        rankScore: video.relevanceScore,
        type,
        rationale: this.generateRationale(video, type),
      });
    }

    return selected;
  }

  /**
   * Full resource attachment flow for a single node.
   */
  async attachResourcesForNode(
    node: Node,
    planId: string,
    searchQueries: string[],
    options: ResourceAttachmentOptions = {}
  ): Promise<SelectedResource[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const requestId = uuidv4();

    logger.info({ nodeId: node.node_id, planId }, 'Starting resource attachment for node');

    // 1. Search YouTube API
    const candidates = await this.searchVideos(searchQueries);
    logger.debug({ nodeId: node.node_id, candidateCount: candidates.length }, 'YouTube search complete');

    if (candidates.length === 0) {
      logger.warn({ nodeId: node.node_id }, 'No video candidates found');
      return [];
    }

    // 2. Validate videos (if enabled)
    let validatedVideos: ValidatedVideo[];
    if (opts.validateVideos) {
      validatedVideos = await this.validateAndFilterVideos(
        candidates,
        node,
        planId,
        requestId,
        opts.minRelevanceScore
      );
      logger.debug(
        { nodeId: node.node_id, validatedCount: validatedVideos.length },
        'Video validation complete'
      );
    } else {
      // Skip validation, treat all candidates as validated
      validatedVideos = candidates.map((c) => ({
        ...c,
        relevanceScore: 0.5, // Default score
        matchedObjectives: [],
      }));
    }

    if (validatedVideos.length === 0) {
      logger.warn({ nodeId: node.node_id }, 'No videos passed validation');
      return [];
    }

    // 3. Rank videos (async for instructor trust lookup)
    const rankedVideos = await this.rankVideos(validatedVideos, node);

    // 4. Select top videos
    const selected = this.selectTopVideos(rankedVideos, opts.mustWatchCount, opts.recommendedCount);

    logger.info(
      { nodeId: node.node_id, selectedCount: selected.length },
      'Resource attachment complete'
    );

    return selected;
  }

  /**
   * Parse ISO 8601 duration to seconds.
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Generate a rationale for why a video was selected.
   */
  private generateRationale(video: ValidatedVideo, type: 'must_watch' | 'recommended'): string {
    const parts: string[] = [];

    if (type === 'must_watch') {
      parts.push('Highly relevant to learning objectives');
    }

    if (video.matchedObjectives.length > 0) {
      parts.push(`covers ${video.matchedObjectives.length} objective(s)`);
    }

    if (video.viewCount > 100000) {
      parts.push('popular content');
    }

    const rationale = parts.join('; ');
    return rationale.charAt(0).toUpperCase() + rationale.slice(1);
  }
}

// Export singleton instance
export const youtubeService = new YouTubeService();
export default youtubeService;
