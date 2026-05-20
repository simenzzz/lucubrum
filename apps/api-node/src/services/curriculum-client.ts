/**
 * Client for communicating with the Python Curriculum Service.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../utils/logger';

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
export interface ValidateVideoRequest {
  video_id: string;
  plan_id: string;
  node_id: string;
  node_title: string;
  node_objectives: string[];
  content_text: string;
  video_title?: string;
  channel_name?: string;
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

// Query generation types
export interface GenerateQueriesRequest {
  plan_id: string;
  node_id: string;
  node_title: string;
  node_objectives: string[];
  node_tags?: string[];
  request_id: string;
}

export interface QuerySuggestions {
  schema_version: string;
  plan_id: string;
  node_id: string;
  queries: string[];
  metadata: ArtifactMetadata;
}

// Reading material types
export interface TranscriptInput {
  video_id: string;
  title: string;
  content_text: string;
}

export interface ReadingMaterialSection {
  heading: string;
  content: string;
}

export interface ReadingMaterial {
  schema_version: string;
  plan_id: string;
  node_id: string;
  sections: ReadingMaterialSection[];
  metadata: ArtifactMetadata;
}

export interface GenerateReadingMaterialRequest {
  plan_id: string;
  node_id: string;
  node_title: string;
  node_objectives: string[];
  transcripts: TranscriptInput[];
  request_id: string;
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

/**
 * Client for the Python Curriculum Service.
 */
export class CurriculumClient {
  private client: AxiosInstance;

  constructor() {
    const serviceHostPort = process.env.PYTHON_SERVICE_HOSTPORT;
    const baseURL =
      process.env.PYTHON_SERVICE_URL ||
      (serviceHostPort ? `http://${serviceHostPort}` : 'http://localhost:8000');
    const serviceToken = process.env.SERVICE_TOKEN;

    this.client = axios.create({
      baseURL,
      timeout: Number(process.env.LLM_TIMEOUT_SECONDS || 60) * 1000,
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
        const respData = error.response?.data as Record<string, unknown> | undefined;
        logger.error(
          {
            url: error.config?.url,
            status: error.response?.status,
            errorCode: respData?.error,
            errorMessage: respData?.message,
          },
          'Curriculum API error'
        );
        return Promise.reject(error);
      }
    );
  }

  /**
   * Extract and validate a field from the upstream response.
   * Throws CurriculumServiceError if the field is missing or null.
   */
  private extractField<T>(data: Record<string, unknown>, field: string, endpoint: string): T {
    const value = data[field];
    if (value === undefined || value === null) {
      throw new CurriculumServiceError(
        `Missing '${field}' in response from ${endpoint}`,
        502,
        'INVALID_UPSTREAM_RESPONSE'
      );
    }
    return value as T;
  }

  /**
   * Validate that a video's transcript matches a learning node.
   */
  async validateVideo(request: ValidateVideoRequest): Promise<VideoValidation> {
    try {
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/validate-video',
        request
      );
      return this.extractField<VideoValidation>(response.data, 'validation', '/llm/validate-video');
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
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/check-staleness',
        request
      );
      return this.extractField<StalenessResult>(response.data, 'result', '/llm/check-staleness');
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
      const response = await this.client.post<Record<string, unknown>>('/llm/plan', {
        topic: request.topic,
        user_level: request.user_level,
        plan_size: request.plan_size || 'moderate',
        request_id: request.request_id,
      });
      return this.extractField<Plan>(response.data, 'plan', '/llm/plan');
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
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/exercises',
        request
      );
      return this.extractField<ExerciseSet>(response.data, 'exercise_set', '/llm/exercises');
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
      const response = await this.client.post<Record<string, unknown>>('/llm/grade', request);
      return this.extractField<Grade>(response.data, 'grade', '/llm/grade');
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
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/get-facts',
        {
          normalized_topic: request.normalized_topic,
          keywords: request.keywords || [],
          request_id: request.request_id,
        }
      );
      return {
        facts: this.extractField<string[]>(response.data, 'facts', '/llm/get-facts'),
        sources: this.extractField<string[]>(response.data, 'sources', '/llm/get-facts'),
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
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/exam',
        request
      );
      return this.extractField<ExamExerciseSet>(response.data, 'exam_exercise_set', '/llm/exam');
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

  /**
   * Generate YouTube search queries for a learning node.
   */
  async generateQueries(request: GenerateQueriesRequest): Promise<QuerySuggestions> {
    try {
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/queries',
        request
      );
      return this.extractField<QuerySuggestions>(response.data, 'suggestions', '/llm/queries');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'QUERY_GENERATION_FAILED',
          data
        );
      }
      throw error;
    }
  }

  /**
   * Generate reading material from video transcripts.
   */
  async generateReadingMaterial(request: GenerateReadingMaterialRequest): Promise<ReadingMaterial> {
    try {
      const response = await this.client.post<Record<string, unknown>>(
        '/llm/reading-material',
        request
      );
      return this.extractField<ReadingMaterial>(response.data, 'reading_material', '/llm/reading-material');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined;
        throw new CurriculumServiceError(
          (data?.message as string) || error.message,
          error.response?.status || 500,
          (data?.error as string) || 'READING_MATERIAL_FAILED',
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
