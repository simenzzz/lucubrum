/**
 * YouTube service for video search and resource attachment.
 *
 * Handles:
 * - YouTube Data API integration for video search
 * - Redis caching for quota optimization
 * - Transcript validation via Python service
 * - Video ranking and selection
 */

import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { redis } from '../db/redis';
import {
  curriculumClient,
  Transcript,
  TranscriptNotAvailableError,
} from './curriculum-client';

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
  transcript: string;
}

export interface SelectedResource {
  videoId: string;
  title: string;
  channelTitle: string;
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
  validateTranscripts?: boolean;
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
  validateTranscripts: true,
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
   * Uses SHA-256 hash of query (first 16 chars) for key.
   */
  private getCacheKey(query: string): string {
    const hash = crypto.createHash('sha256').update(query).digest('hex').slice(0, 16);
    return `${this.cacheKeyPrefix}${hash}`;
  }

  /**
   * Search YouTube for videos matching queries.
   * Uses Redis caching to reduce API quota usage.
   */
  async searchVideos(queries: string[], maxResultsPerQuery = 5): Promise<VideoCandidate[]> {
    const allCandidates: VideoCandidate[] = [];
    const stats: SearchQuotaStats = {
      totalQueries: queries.length,
      cacheHits: 0,
      apiCalls: 0,
      estimatedQuotaUsed: 0,
    };

    for (const query of queries) {
      try {
        // Check cache first
        const cacheKey = this.getCacheKey(query);
        const cached = await redis.getJSON<CachedSearchResult>(cacheKey);

        if (cached) {
          // Cache hit
          stats.cacheHits++;
          logger.debug({ query, cacheKey }, 'YouTube search cache hit');
          allCandidates.push(...cached.results);
          continue;
        }

        // Cache miss - call YouTube API
        const results = await this.searchYouTubeApi(query, maxResultsPerQuery);
        stats.apiCalls++;
        // Quota: 100 for search + 1 for videos (per query)
        stats.estimatedQuotaUsed += this.SEARCH_QUOTA_COST + this.VIDEOS_QUOTA_COST;

        if (results.length > 0) {
          // Cache the results
          const cacheEntry: CachedSearchResult = {
            query,
            results,
            cachedAt: new Date().toISOString(),
            apiQuotaCost: this.SEARCH_QUOTA_COST + this.VIDEOS_QUOTA_COST,
          };
          await redis.setJSON(cacheKey, cacheEntry, this.cacheTtlSeconds);
          logger.debug({ query, cacheKey, resultCount: results.length }, 'YouTube search cached');
        }

        allCandidates.push(...results);
      } catch (error) {
        logger.error({ error, query }, 'YouTube search failed for query');
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
   * Validate and filter videos using transcript analysis.
   */
  async validateAndFilterVideos(
    candidates: VideoCandidate[],
    node: Node,
    planId: string,
    requestId: string,
    minRelevanceScore = 0.6
  ): Promise<ValidatedVideo[]> {
    const validated: ValidatedVideo[] = [];

    for (const video of candidates) {
      try {
        // 1. Fetch transcript via Python service
        let transcript: Transcript;
        try {
          transcript = await curriculumClient.fetchTranscript({
            video_id: video.videoId,
          });
        } catch (error) {
          if (error instanceof TranscriptNotAvailableError) {
            logger.debug({ videoId: video.videoId }, 'No transcript available, skipping');
            continue;
          }
          throw error;
        }

        // 2. Validate against node objectives
        const validation = await curriculumClient.validateVideo({
          video_id: video.videoId,
          plan_id: planId,
          node_id: node.node_id,
          node_title: node.title,
          node_objectives: node.objectives,
          transcript_text: transcript.full_text,
          request_id: requestId,
        });

        // 3. Include only relevant videos
        if (validation.is_relevant && validation.relevance_score >= minRelevanceScore) {
          validated.push({
            ...video,
            relevanceScore: validation.relevance_score,
            matchedObjectives: validation.matched_objectives,
            transcript: transcript.full_text,
          });
        } else {
          logger.debug(
            {
              videoId: video.videoId,
              relevanceScore: validation.relevance_score,
              reason: validation.rejection_reason,
            },
            'Video rejected due to low relevance'
          );
        }
      } catch (error) {
        // Log but continue - some videos may fail validation
        logger.warn({ videoId: video.videoId, error }, 'Transcript validation failed');
      }
    }

    return validated;
  }

  /**
   * Rank validated videos using deterministic scoring.
   */
  rankVideos(videos: ValidatedVideo[], node: Node): ValidatedVideo[] {
    return videos
      .map((video) => {
        // Calculate composite score
        let score = video.relevanceScore * 0.4; // 40% relevance

        // Engagement score (normalized)
        const engagementRatio = video.likeCount / Math.max(video.viewCount, 1);
        score += Math.min(engagementRatio * 10, 0.2); // Up to 20% for engagement

        // Duration appropriateness (prefer videos within 2x estimated time)
        const idealDuration = node.estimated_minutes * 60;
        const durationRatio = video.durationSeconds / idealDuration;
        if (durationRatio >= 0.5 && durationRatio <= 2.0) {
          score += 0.15; // 15% for good duration
        } else if (durationRatio >= 0.25 && durationRatio <= 3.0) {
          score += 0.08; // 8% for acceptable duration
        }

        // Objective coverage bonus
        const coverageRatio = video.matchedObjectives.length / node.objectives.length;
        score += coverageRatio * 0.15; // Up to 15% for coverage

        // Recency bonus (videos from last 2 years)
        const videoAge =
          (Date.now() - new Date(video.publishedAt).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (videoAge <= 2) {
          score += 0.1; // 10% for recent videos
        } else if (videoAge <= 5) {
          score += 0.05; // 5% for moderately recent
        }

        return {
          ...video,
          relevanceScore: Math.min(score, 1.0), // Cap at 1.0
        };
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

    // 2. Validate transcripts (if enabled)
    let validatedVideos: ValidatedVideo[];
    if (opts.validateTranscripts) {
      validatedVideos = await this.validateAndFilterVideos(
        candidates,
        node,
        planId,
        requestId,
        opts.minRelevanceScore
      );
      logger.debug(
        { nodeId: node.node_id, validatedCount: validatedVideos.length },
        'Transcript validation complete'
      );
    } else {
      // Skip validation, treat all candidates as validated
      validatedVideos = candidates.map((c) => ({
        ...c,
        relevanceScore: 0.5, // Default score
        matchedObjectives: [],
        transcript: '',
      }));
    }

    if (validatedVideos.length === 0) {
      logger.warn({ nodeId: node.node_id }, 'No videos passed transcript validation');
      return [];
    }

    // 3. Rank videos
    const rankedVideos = this.rankVideos(validatedVideos, node);

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
