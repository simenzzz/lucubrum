/**
 * Client for communicating with the Python Curriculum Service.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../utils/logger';

// Types for transcript and validation
export interface TranscriptSegment {
  start_seconds: number;
  duration_seconds: number;
  text: string;
}

export interface Transcript {
  schema_version: string;
  video_id: string;
  language: string;
  segments: TranscriptSegment[];
  full_text: string;
  duration_seconds: number;
  fetch_source: 'youtube_transcript_api' | 'youtube_api' | 'manual';
}

export interface VideoValidation {
  schema_version: string;
  video_id: string;
  plan_id: string;
  node_id: string;
  is_relevant: boolean;
  relevance_score: number;
  matched_objectives: string[];
  rejection_reason: string | null;
  metadata: ArtifactMetadata;
}

export interface StalenessResult {
  schema_version: string;
  cache_key: string;
  is_stale: boolean;
  contradiction_rate: number;
  stale_reason: string | null;
  sources_checked: string[];
  contradictions_found: string[];
  metadata: ArtifactMetadata;
}

export interface ArtifactMetadata {
  provider: string;
  model: string;
  prompt_version: string;
  created_at: string;
  request_id: string;
  raw_output_hash: string;
  artifact_hash: string;
  validation_retry_count: number;
}

// Plan types
export interface PlanNode {
  node_id: string;
  title: string;
  objectives: string[];
  prerequisites: string[];
  estimated_minutes: number;
  tags?: string[] | null;
}

export interface ScheduleItem {
  order: number;
  node_id: string;
}

export interface Plan {
  schema_version: string;
  topic: string;
  user_level: string;
  plan_size: string;
  nodes: PlanNode[];
  schedule: ScheduleItem[];
  metadata: ArtifactMetadata;
}

export interface GeneratePlanRequest {
  topic: string;
  user_level: 'beginner' | 'intermediate' | 'advanced';
  plan_size?: 'basic' | 'moderate' | 'large' | 'dynamic';
  request_id: string;
}

// Exercise types
export type ExerciseType = 'mcq' | 'short_answer' | 'fill_blank' | 'coding' | 'flashcard';

export interface GenerateExercisesRequest {
  plan_id: string;
  node_id: string;
  topic: string;
  node_title: string;
  objectives: string[];
  user_level: 'beginner' | 'intermediate' | 'advanced';
  exercise_types?: ExerciseType[];
  count?: number;
  difficulty_target?: number;
  request_id: string;
}

export interface Exercise {
  id: string;
  type: ExerciseType;
  prompt: string;
  rubric: string;
  difficulty: number;
  choices?: string[];
  correct_answer: unknown;
}

export interface ExerciseSet {
  schema_version: string;
  plan_id: string;
  node_id: string;
  user_level: string;
  exercises: Exercise[];
  metadata: ArtifactMetadata;
}

export interface GradeRequest {
  plan_id: string;
  node_id: string;
  exercise_id: string;
  exercise_type: ExerciseType;
  prompt: string;
  rubric: string;
  correct_answer: unknown;
  user_answer: unknown;
  user_level: 'beginner' | 'intermediate' | 'advanced';
  request_id: string;
}

export interface Grade {
  schema_version: string;
  plan_id: string;
  node_id: string;
  exercise_id: string;
  score: number;
  is_correct: boolean;
  feedback: string;
  misconceptions: string[] | null;
  metadata: ArtifactMetadata;
}

// Request types
export interface FetchTranscriptRequest {
  video_id: string;
  language?: string;
}

export interface ValidateVideoRequest {
  video_id: string;
  plan_id: string;
  node_id: string;
  node_title: string;
  node_objectives: string[];
  transcript_text: string;
  request_id: string;
}

export interface ResourceInfo {
  video_id: string;
  title: string;
  transcript_excerpt?: string;
}

export interface CheckStalenessRequest {
  cache_key: string;
  topic: string;
  plan_summary: string;
  resources?: ResourceInfo[];
  old_facts?: string[];  // Facts at time of caching
  mcp_facts?: string[];  // Current facts from MCP
  request_id: string;
}

export interface NormalizeTopicRequest {
  topic: string;
  request_id: string;
}

export interface NormalizeTopicResponse {
  topic_normalized: string;
  domain_category: string;
  staleness_policy: string;
  metadata: ArtifactMetadata;
}

export interface GetFactsRequest {
  normalized_topic: string;
  keywords?: string[];
  request_id: string;
}

export interface GetFactsResponse {
  facts: string[];
  sources: string[];
}

// Exam types
export interface GenerateExamRequest {
  plan_id: string;
  node_id: string;
  topic: string;
  node_title: string;
  objectives: string[];
  user_level: 'beginner' | 'intermediate' | 'advanced';
  current_mastery: number;
  exercise_count?: number;
  request_id: string;
}

export interface ExamExerciseSet {
  schema_version: string;
  plan_id: string;
  node_id: string;
  user_level: string;
  exercises: Exercise[];
  exam_difficulty: number;
  metadata: ArtifactMetadata;
}

// Error types
export class CurriculumServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CurriculumServiceError';
  }
}

export class TranscriptNotAvailableError extends CurriculumServiceError {
  constructor(videoId: string, reason: string) {
    super(`Transcript unavailable for ${videoId}: ${reason}`, 404, 'TRANSCRIPT_NOT_AVAILABLE', {
      video_id: videoId,
      reason,
    });
    this.name = 'TranscriptNotAvailableError';
  }
}

/**
 * Client for the Python Curriculum Service.
 */
export class CurriculumClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    const serviceToken = process.env.PYTHON_SERVICE_TOKEN;

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(serviceToken && { 'X-Service-Token': serviceToken }),
      },
    });

    // Add request/response logging
    this.client.interceptors.request.use((config) => {
      logger.debug({ url: config.url, method: config.method }, 'Curriculum API request');
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          { url: response.config.url, status: response.status },
          'Curriculum API response'
        );
        return response;
      },
      (error: AxiosError) => {
        logger.error(
          {
            url: error.config?.url,
            status: error.response?.status,
            data: error.response?.data,
          },
          'Curriculum API error'
        );
        return Promise.reject(error);
      }
    );
  }

  /**
   * Fetch transcript for a YouTube video.
   */
  async fetchTranscript(request: FetchTranscriptRequest): Promise<Transcript> {
    try {
      const response = await this.client.post<{ transcript: Transcript }>(
        '/llm/transcript',
        request
      );
      return response.data.transcript;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        if (error.response?.status === 404 && data?.error === 'TRANSCRIPT_NOT_AVAILABLE') {
          throw new TranscriptNotAvailableError(
            request.video_id,
            (data?.reason as string) || 'Unknown reason'
          );
        }
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'UNKNOWN_ERROR',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Validate that a video's transcript matches a learning node.
   */
  async validateVideo(request: ValidateVideoRequest): Promise<VideoValidation> {
    try {
      const response = await this.client.post<{ validation: VideoValidation }>(
        '/llm/validate-video',
        request
      );
      return response.data.validation;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'VALIDATION_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Check if cached content is stale compared to current sources.
   */
  async checkStaleness(request: CheckStalenessRequest): Promise<StalenessResult> {
    try {
      const response = await this.client.post<{ result: StalenessResult }>(
        '/llm/check-staleness',
        request
      );
      return response.data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'STALENESS_CHECK_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Health check for the curriculum service.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Generate a learning plan for a topic.
   */
  async generatePlan(request: GeneratePlanRequest): Promise<Plan> {
    try {
      const response = await this.client.post<{ plan: Plan }>('/llm/plan', {
        topic: request.topic,
        user_level: request.user_level,
        plan_size: request.plan_size || 'moderate',
        request_id: request.request_id,
      });
      return response.data.plan;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'PLAN_GENERATION_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Generate exercises for a learning node.
   */
  async generateExercises(request: GenerateExercisesRequest): Promise<ExerciseSet> {
    try {
      const response = await this.client.post<{ exercise_set: ExerciseSet }>(
        '/llm/exercises',
        request
      );
      return response.data.exercise_set;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'EXERCISE_GENERATION_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Grade a user's answer to an exercise.
   */
  async gradeAnswer(request: GradeRequest): Promise<Grade> {
    try {
      const response = await this.client.post<{ grade: Grade }>('/llm/grade', request);
      return response.data.grade;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'GRADING_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Normalize a topic to canonical form.
   */
  async normalizeTopic(request: NormalizeTopicRequest): Promise<NormalizeTopicResponse> {
    try {
      const response = await this.client.post<NormalizeTopicResponse>(
        '/llm/normalize-topic',
        request
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'NORMALIZATION_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Get current facts about a topic from MCP sources.
   */
  async getFacts(request: GetFactsRequest): Promise<GetFactsResponse> {
    try {
      const response = await this.client.post<{ facts: string[]; sources: string[] }>(
        '/llm/get-facts',
        {
          normalized_topic: request.normalized_topic,
          keywords: request.keywords || [],
          request_id: request.request_id,
        }
      );
      return {
        facts: response.data.facts,
        sources: response.data.sources,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'FACT_FETCH_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Generate an exam for a learning node.
   */
  async generateExam(request: GenerateExamRequest): Promise<ExamExerciseSet> {
    try {
      const response = await this.client.post<{ exam_exercise_set: ExamExerciseSet }>(
        '/llm/exam',
        request
      );
      return response.data.exam_exercise_set;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'EXAM_GENERATION_FAILED',
          data
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const curriculumClient = new CurriculumClient();
export default curriculumClient;
