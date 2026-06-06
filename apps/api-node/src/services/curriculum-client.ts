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

const UPSTREAM_RATE_LIMIT_STATUS = 429;
const UPSTREAM_RATE_LIMIT_ERROR = 'CURRICULUM_SERVICE_RATE_LIMITED';
const UPSTREAM_RATE_LIMIT_MESSAGE =
  'Curriculum generation is temporarily rate-limited upstream. Please try again shortly.';
const DEFAULT_WARMUP_ATTEMPTS = 3;
const DEFAULT_WARMUP_TIMEOUT_SECONDS = 15;
const DEFAULT_WARMUP_BACKOFF_MS = 1000;

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
        const headers = error.response?.headers as Record<string, unknown> | undefined;
        logger.error(
          {
            url: error.config?.url,
            status: error.response?.status,
            errorCode: respData?.error,
            errorMessage: respData?.message,
            retryAfter: headers?.['retry-after'],
            cfRay: headers?.['cf-ray'],
            contentType: headers?.['content-type'],
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

  private getHeader(headers: unknown, name: string): string | undefined {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }

    const record = headers as Record<string, unknown>;
    const direct = record[name];
    if (typeof direct === 'string') {
      return direct;
    }

    const lowerName = name.toLowerCase();
    const matchingKey = Object.keys(record).find((key) => key.toLowerCase() === lowerName);
    const value = matchingKey ? record[matchingKey] : undefined;
    return typeof value === 'string' ? value : undefined;
  }

  private buildDetails(error: AxiosError, data?: Record<string, unknown>): Record<string, unknown> {
    const details: Record<string, unknown> = {
      ...(data && typeof data === 'object' ? data : {}),
      upstream_status: error.response?.status,
      upstream_url: error.config?.url,
    };

    const retryAfter = this.getHeader(error.response?.headers, 'retry-after');
    const cfRay = this.getHeader(error.response?.headers, 'cf-ray');
    const contentType = this.getHeader(error.response?.headers, 'content-type');

    if (retryAfter) details.retry_after = retryAfter;
    if (cfRay) details.cf_ray = cfRay;
    if (contentType) details.content_type = contentType;

    return details;
  }

  private normalizeErrorPayload(data?: Record<string, unknown>): {
    error?: string;
    message?: string;
    detailsData?: Record<string, unknown>;
  } {
    if (!data) {
      return {};
    }

    const detail = data.detail;

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const detailRecord = detail as Record<string, unknown>;
      return {
        error: typeof detailRecord.error === 'string' ? detailRecord.error : undefined,
        message: typeof detailRecord.message === 'string' ? detailRecord.message : undefined,
        detailsData: {
          ...data,
          ...detailRecord,
        },
      };
    }

    if (Array.isArray(detail)) {
      const validationErrors = detail.map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return String(entry);
        }

        const record = entry as Record<string, unknown>;
        const loc = Array.isArray(record.loc) ? record.loc.join('.') : undefined;
        const msg = typeof record.msg === 'string' ? record.msg : JSON.stringify(record);
        return loc ? `${loc}: ${msg}` : msg;
      });

      return {
        error: typeof data.error === 'string' ? data.error : 'REQUEST_VALIDATION_FAILED',
        message: typeof data.message === 'string'
          ? data.message
          : validationErrors.join('; ') || 'Request validation failed',
        detailsData: {
          ...data,
          validation_errors: validationErrors,
        },
      };
    }

    return {
      error: typeof data.error === 'string' ? data.error : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
      detailsData: data,
    };
  }

  private toServiceError(error: AxiosError, fallbackCode: string): CurriculumServiceError {
    const data = error.response?.data as Record<string, unknown> | undefined;
    const normalized = this.normalizeErrorPayload(data);
    const status = error.response?.status || 500;
    const details = this.buildDetails(error, normalized.detailsData ?? data);

    if (status === UPSTREAM_RATE_LIMIT_STATUS && !normalized.error) {
      return new CurriculumServiceError(
        UPSTREAM_RATE_LIMIT_MESSAGE,
        503,
        UPSTREAM_RATE_LIMIT_ERROR,
        details
      );
    }

    return new CurriculumServiceError(
      normalized.message || error.message,
      status,
      normalized.error || fallbackCode,
      details
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableWarmupError(error: AxiosError): boolean {
    const status = error.response?.status;
    if (!status) {
      return true;
    }

    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private toWarmupRateLimitError(error: AxiosError): CurriculumServiceError {
    return new CurriculumServiceError(
      UPSTREAM_RATE_LIMIT_MESSAGE,
      503,
      UPSTREAM_RATE_LIMIT_ERROR,
      this.buildDetails(error)
    );
  }

  /**
   * Wake the curriculum service before expensive LLM generation.
   * Render free services may be asleep; this probes /health with a short,
   * bounded retry loop before the real plan flow begins.
   */
  async warmUp(requestId?: string): Promise<void> {
    const attempts = DEFAULT_WARMUP_ATTEMPTS;
    const timeoutMs = DEFAULT_WARMUP_TIMEOUT_SECONDS * 1000;
    const baseBackoffMs = DEFAULT_WARMUP_BACKOFF_MS;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.client.get('/health', {
          timeout: timeoutMs,
          headers: requestId ? { 'X-Request-ID': requestId } : undefined,
        });
        if (attempt > 1) {
          logger.info({ requestId, attempt }, 'Curriculum service warm-up succeeded');
        }
        return;
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error) && error.response?.status === UPSTREAM_RATE_LIMIT_STATUS) {
          throw this.toWarmupRateLimitError(error);
        }

        if (!axios.isAxiosError(error) || !this.isRetryableWarmupError(error) || attempt === attempts) {
          break;
        }

        const delayMs = baseBackoffMs * attempt;
        logger.warn(
          {
            requestId,
            attempt,
            attempts,
            delayMs,
            status: error.response?.status,
            code: error.code,
          },
          'Curriculum service warm-up failed, retrying'
        );
        await this.sleep(delayMs);
      }
    }

    const axiosError = axios.isAxiosError(lastError) ? lastError : undefined;
    throw new CurriculumServiceError(
      'Curriculum service is still waking up. Please try again shortly.',
      503,
      'CURRICULUM_SERVICE_WARMUP_FAILED',
      {
        attempts,
        timeout_ms: timeoutMs,
        last_status: axiosError?.response?.status,
        last_code: axiosError?.code,
        last_message: lastError instanceof Error ? lastError.message : String(lastError),
      }
    );
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
        throw this.toServiceError(error, 'VALIDATION_FAILED');
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
        throw this.toServiceError(error, 'STALENESS_CHECK_FAILED');
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
      return response.data?.status === 'ok' || response.data?.status === 'healthy';
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
        throw this.toServiceError(error, 'PLAN_GENERATION_FAILED');
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
        throw this.toServiceError(error, 'EXERCISE_GENERATION_FAILED');
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
        throw this.toServiceError(error, 'GRADING_FAILED');
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
        throw this.toServiceError(error, 'NORMALIZATION_FAILED');
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
        throw this.toServiceError(error, 'EXAM_GENERATION_FAILED');
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
        throw this.toServiceError(error, 'QUERY_GENERATION_FAILED');
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
        throw this.toServiceError(error, 'READING_MATERIAL_FAILED');
      }
      throw error;
    }
  }
}

// Export singleton instance
export const curriculumClient = new CurriculumClient();
export default curriculumClient;
