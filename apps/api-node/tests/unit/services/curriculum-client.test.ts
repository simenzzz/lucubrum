/**
 * Curriculum client tests
 * Tests for services/curriculum-client.ts: CurriculumClient class methods
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CurriculumClient: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CurriculumServiceError: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockAxiosInstance: any;

// Types for the request objects
type GeneratePlanRequest = {
  topic: string;
  user_level: string;
  plan_size?: string;
  request_id: string;
};

type GradeRequest = {
  plan_id: string;
  node_id: string;
  exercise_id: string;
  exercise_type: string;
  prompt: string;
  rubric: string;
  correct_answer: string | Record<string, unknown>;
  user_answer: string;
  user_level: string;
  request_id: string;
};

beforeAll(async () => {
  // Create mock axios instance
  mockAxiosInstance = {
    post: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  // Mock axios using doMock (not hoisted)
  jest.doMock('axios', () => ({
    __esModule: true,
    default: {
      create: jest.fn().mockReturnValue(mockAxiosInstance),
      isAxiosError: jest.fn().mockImplementation(
        (error: any) => error != null && (error.response !== undefined || error.code !== undefined)
      ),
    },
  }));

  // Mock logger
  jest.doMock('../../../src/utils/logger', () => ({
    __esModule: true,
    default: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  // NOW dynamically import the module under test
  const curriculumModule = await import('../../../src/services/curriculum-client');
  CurriculumClient = curriculumModule.CurriculumClient;
  CurriculumServiceError = curriculumModule.CurriculumServiceError;
});

describe('CurriculumClient', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;

  beforeEach(() => {
    // Clear call history but not implementations
    mockAxiosInstance.post.mockClear();
    mockAxiosInstance.get.mockClear();
    // Create a new client for each test
    client = new CurriculumClient();
  });

  const mockMetadata = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    prompt_version: '1.0',
    created_at: new Date().toISOString(),
    request_id: 'test-request-123',
    raw_output_hash: 'abc123',
    artifact_hash: 'def456',
    validation_retry_count: 0,
  };

  describe('generatePlan', () => {
    const mockPlanResponse = {
      schema_version: 'plan.v1',
      topic: 'JavaScript Basics',
      user_level: 'beginner',
      plan_size: 'moderate',
      nodes: [
        {
          node_id: 'variables',
          title: 'Variables and Types',
          objectives: ['Learn about let, const, var'],
          prerequisites: [],
          estimated_minutes: 30,
        },
      ],
      schedule: [
        { order: 1, node_id: 'variables' },
      ],
      metadata: mockMetadata,
    };

    it('should successfully generate a plan', async () => {
      const request: GeneratePlanRequest = {
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        plan_size: 'moderate',
        request_id: 'test-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { plan: mockPlanResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.generatePlan(request);

      expect(result).toEqual(mockPlanResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/plan',
        expect.objectContaining({
          topic: 'JavaScript Basics',
          user_level: 'beginner',
          plan_size: 'moderate',
          request_id: 'test-request-123',
        })
      );
    });

    it('should use moderate as default plan_size', async () => {
      const request: GeneratePlanRequest = {
        topic: 'React',
        user_level: 'intermediate',
        request_id: 'test-request-456',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { plan: mockPlanResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await client.generatePlan(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/plan',
        expect.objectContaining({
          plan_size: 'moderate',
        })
      );
    });

    it('should throw CurriculumServiceError on 4xx response', async () => {
      const request: GeneratePlanRequest = {
        topic: 'Invalid Topic!',
        user_level: 'beginner',
        request_id: 'test-request-error',
      };

      const errorResponse = {
        response: {
          status: 400,
          data: {
            error: 'INVALID_TOPIC',
            message: 'Topic contains invalid characters',
          },
          statusText: 'Bad Request',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.generatePlan(request)).rejects.toThrow(CurriculumServiceError);

      try {
        await client.generatePlan(request);
      } catch (e) {
        expect(e).toBeInstanceOf(CurriculumServiceError);
        const error = e as { statusCode: number; errorCode: string; message: string; details?: Record<string, unknown> };
        if (e instanceof CurriculumServiceError) {
          expect(error.statusCode).toBe(400);
          expect(error.errorCode).toBe('INVALID_TOPIC');
          expect(error.message).toContain('Topic contains invalid characters');
        }
      }
    });

    it('should throw CurriculumServiceError on 5xx response', async () => {
      const request: GeneratePlanRequest = {
        topic: 'Very Complex Topic',
        user_level: 'advanced',
        request_id: 'test-request-500',
      };

      const errorResponse = {
        response: {
          status: 500,
          data: {
            error: 'LLM_ERROR',
            message: 'Failed to generate plan',
          },
          statusText: 'Internal Server Error',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.generatePlan(request)).rejects.toThrow(CurriculumServiceError);

      try {
        await client.generatePlan(request);
      } catch (e) {
        expect(e).toBeInstanceOf(CurriculumServiceError);
        const error = e as { statusCode: number; errorCode: string; message: string; details?: Record<string, unknown> };
        if (e instanceof CurriculumServiceError) {
          expect(error.statusCode).toBe(500);
          expect(error.errorCode).toBe('LLM_ERROR');
        }
      }
    });

    it('should throw CurriculumServiceError on timeout', async () => {
      const request: GeneratePlanRequest = {
        topic: 'Slow Topic',
        user_level: 'beginner',
        request_id: 'test-request-timeout',
      };

      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      };

      mockAxiosInstance.post.mockRejectedValue(timeoutError);

      await expect(client.generatePlan(request)).rejects.toThrow(CurriculumServiceError);
    });

    it('should handle network errors', async () => {
      const request: GeneratePlanRequest = {
        topic: 'Network Error Topic',
        user_level: 'beginner',
        request_id: 'test-request-network',
      };

      const networkError = {
        code: 'ENOTFOUND',
        message: 'Network error',
      };

      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(client.generatePlan(request)).rejects.toThrow();
    });

    it('should classify bare upstream 429s as curriculum service rate limits', async () => {
      const request: GeneratePlanRequest = {
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        request_id: 'test-request-429',
      };

      const errorResponse = {
        config: { url: '/llm/plan' },
        response: {
          status: 429,
          data: 'Too many requests',
          headers: {
            'retry-after': '30',
            'cf-ray': 'test-ray',
            'content-type': 'text/plain',
          },
          statusText: 'Too Many Requests',
        },
        message: 'Request failed with status code 429',
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.generatePlan(request)).rejects.toThrow(CurriculumServiceError);

      try {
        await client.generatePlan(request);
      } catch (e) {
        expect(e).toBeInstanceOf(CurriculumServiceError);
        const error = e as { statusCode: number; errorCode: string; details?: Record<string, unknown> };
        expect(error.statusCode).toBe(503);
        expect(error.errorCode).toBe('CURRICULUM_SERVICE_RATE_LIMITED');
        expect(error.details).toEqual(
          expect.objectContaining({
            upstream_status: 429,
            upstream_url: '/llm/plan',
            retry_after: '30',
            cf_ray: 'test-ray',
            content_type: 'text/plain',
          })
        );
      }
    });

    it('should preserve app JSON 429 errors when upstream provides an error code', async () => {
      const request: GeneratePlanRequest = {
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        request_id: 'test-request-app-429',
      };

      const errorResponse = {
        config: { url: '/llm/plan' },
        response: {
          status: 429,
          data: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Try again later.',
          },
          headers: {},
          statusText: 'Too Many Requests',
        },
        message: 'Request failed with status code 429',
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      try {
        await client.generatePlan(request);
      } catch (e) {
        expect(e).toBeInstanceOf(CurriculumServiceError);
        const error = e as { statusCode: number; errorCode: string; message: string };
        expect(error.statusCode).toBe(429);
        expect(error.errorCode).toBe('RATE_LIMIT_EXCEEDED');
        expect(error.message).toBe('Rate limit exceeded. Try again later.');
      }
    });
  });

  describe('gradeAnswer', () => {
    const mockGradeResponse = {
      schema_version: 'grade.v1',
      plan_id: 'plan-123',
      node_id: 'node-123',
      exercise_id: 'exercise-123',
      score: 1.0,
      is_correct: true,
      feedback: 'Correct! Well done.',
      misconceptions: null,
      metadata: mockMetadata,
    };

    it('should successfully grade an answer', async () => {
      const request: GradeRequest = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        exercise_type: 'mcq',
        prompt: 'What is 2+2?',
        rubric: 'Basic arithmetic',
        correct_answer: '4',
        user_answer: '4',
        user_level: 'beginner',
        request_id: 'grade-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { grade: mockGradeResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.gradeAnswer(request);

      expect(result).toEqual(mockGradeResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/llm/grade', request);
    });

    it('should propagate error on 4xx response', async () => {
      const request: GradeRequest = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        exercise_type: 'short_answer',
        prompt: 'Explain closures',
        rubric: 'JavaScript concepts',
        correct_answer: 'A function with access to outer scope',
        user_answer: 'I dont know',
        user_level: 'beginner',
        request_id: 'grade-request-error',
      };

      const errorResponse = {
        response: {
          status: 400,
          data: {
            error: 'INVALID_ANSWER',
            message: 'Answer format is invalid',
          },
          statusText: 'Bad Request',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.gradeAnswer(request)).rejects.toThrow(CurriculumServiceError);

      try {
        await client.gradeAnswer(request);
      } catch (e) {
        if (e instanceof CurriculumServiceError) {
          const error = e as { statusCode: number; errorCode: string };
          expect(error.statusCode).toBe(400);
          expect(error.errorCode).toBe('INVALID_ANSWER');
        }
      }
    });

    it('should propagate error on 5xx response', async () => {
      const request: GradeRequest = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        exercise_type: 'coding',
        prompt: 'Write a function',
        rubric: 'JavaScript',
        correct_answer: { solution: 'function test() {}' },
        user_answer: 'function test() {}',
        user_level: 'intermediate',
        request_id: 'grade-request-500',
      };

      const errorResponse = {
        response: {
          status: 500,
          data: {
            error: 'GRADING_ERROR',
            message: 'Failed to grade answer',
          },
          statusText: 'Internal Server Error',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.gradeAnswer(request)).rejects.toThrow(CurriculumServiceError);
    });

    it('should handle timeout gracefully', async () => {
      const request: GradeRequest = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        exercise_type: 'short_answer',
        prompt: 'Complex question',
        rubric: 'Complex rubric',
        correct_answer: 'Long expected answer',
        user_answer: 'Long user answer',
        user_level: 'advanced',
        request_id: 'grade-request-timeout',
      };

      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout exceeded',
      };

      mockAxiosInstance.post.mockRejectedValue(timeoutError);

      await expect(client.gradeAnswer(request)).rejects.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { status: 'ok' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should accept the FastAPI healthy status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { status: 'healthy' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when service returns non-ok status', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { status: 'error' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false when service is unavailable', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Service unavailable'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout exceeded',
      };

      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('warmUp', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should succeed on first health response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { status: 'healthy' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(client.warmUp('warmup-request-1')).resolves.toBeUndefined();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', {
        timeout: 15000,
        headers: { 'X-Request-ID': 'warmup-request-1' },
      });
    });

    it('should retry a cold-start timeout then succeed', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce({
          code: 'ECONNABORTED',
          message: 'timeout exceeded',
        })
        .mockResolvedValueOnce({
          data: { status: 'healthy' },
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      const warmup = client.warmUp('warmup-request-2');
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1000);
      await expect(warmup).resolves.toBeUndefined();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should throw warm-up failure after exhausted retryable failures', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: {
          status: 503,
          data: 'Service unavailable',
          headers: {},
        },
        message: 'Service unavailable',
      });

      const firstWarmup = client.warmUp('warmup-request-3');
      const firstExpectation = expect(firstWarmup).rejects.toThrow(CurriculumServiceError);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(3000);
      await firstExpectation;

      const secondWarmup = client.warmUp('warmup-request-3');
      const capturedError = secondWarmup.catch((e: unknown) => e);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(3000);
      const e = await capturedError;
      expect(e).toBeInstanceOf(CurriculumServiceError);
      const error = e as { statusCode: number; errorCode: string; details?: Record<string, unknown> };
      expect(error.statusCode).toBe(503);
      expect(error.errorCode).toBe('CURRICULUM_SERVICE_WARMUP_FAILED');
      expect(error.details).toEqual(
        expect.objectContaining({
          attempts: 3,
          timeout_ms: 15000,
          last_status: 503,
        })
      );
    });

    it('should fail fast and preserve Retry-After when health is rate-limited', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        config: { url: '/health' },
        response: {
          status: 429,
          data: 'Too many requests',
          headers: {
            'retry-after': '45',
            'cf-ray': 'warmup-ray',
            'content-type': 'text/plain',
          },
        },
        message: 'Request failed with status code 429',
      });

      const e = await client.warmUp('warmup-request-429').catch((error: unknown) => error);

      expect(e).toBeInstanceOf(CurriculumServiceError);
      const error = e as { statusCode: number; errorCode: string; details?: Record<string, unknown> };
      expect(error.statusCode).toBe(503);
      expect(error.errorCode).toBe('CURRICULUM_SERVICE_RATE_LIMITED');
      expect(error.details).toEqual(
        expect.objectContaining({
          upstream_status: 429,
          upstream_url: '/health',
          retry_after: '45',
          cf_ray: 'warmup-ray',
          content_type: 'text/plain',
        })
      );
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateVideo', () => {
    const mockValidationResponse = {
      schema_version: 'video_validation.v1',
      video_id: 'test-video-id',
      plan_id: 'plan-123',
      node_id: 'node-123',
      is_relevant: true,
      relevance_score: 0.85,
      matched_objectives: ['Learn variables', 'Understand data types'],
      rejection_reason: null,
      metadata: mockMetadata,
    };

    it('should successfully validate video', async () => {
      const request = {
        video_id: 'test-video-id',
        plan_id: 'plan-123',
        node_id: 'node-123',
        node_title: 'Variables',
        node_objectives: ['Learn variables'],
        transcript_text: 'This video is about variables',
        request_id: 'validation-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { validation: mockValidationResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.validateVideo(request);

      expect(result).toEqual(mockValidationResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/validate-video',
        request
      );
    });

    it('should throw error on validation failure', async () => {
      const request = {
        video_id: 'irrelevant-video',
        plan_id: 'plan-123',
        node_id: 'node-123',
        node_title: 'Advanced Topics',
        node_objectives: ['Complex concepts'],
        transcript_text: 'Basic content',
        request_id: 'validation-request-error',
      };

      const errorResponse = {
        response: {
          status: 400,
          data: {
            error: 'VALIDATION_ERROR',
            message: 'Video content does not match node objectives',
          },
          statusText: 'Bad Request',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.validateVideo(request)).rejects.toThrow(CurriculumServiceError);
    });
  });

  describe('checkStaleness', () => {
    const mockStalenessResponse = {
      schema_version: 'staleness_result.v1',
      cache_key: 'javascript-basics',
      is_stale: false,
      contradiction_rate: 0.0,
      stale_reason: null,
      sources_checked: ['source1', 'source2'],
      contradictions_found: [],
      metadata: mockMetadata,
    };

    it('should successfully check staleness', async () => {
      const request = {
        cache_key: 'javascript-basics',
        topic: 'JavaScript Basics',
        plan_summary: 'Learn JS fundamentals',
        resources: [],
        request_id: 'staleness-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { result: mockStalenessResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.checkStaleness(request);

      expect(result).toEqual(mockStalenessResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/check-staleness',
        request
      );
    });

    it('should throw error on staleness check failure', async () => {
      const request = {
        cache_key: 'test-key',
        topic: 'Test',
        plan_summary: 'Test plan',
        request_id: 'staleness-request-error',
      };

      const errorResponse = {
        response: {
          status: 500,
          data: {
            error: 'STALENESS_CHECK_FAILED',
            message: 'Failed to check staleness',
          },
          statusText: 'Internal Server Error',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.checkStaleness(request)).rejects.toThrow(CurriculumServiceError);
    });
  });

  describe('generateExercises', () => {
    const mockExerciseSetResponse = {
      schema_version: 'exercise_set.v1',
      plan_id: 'plan-123',
      node_id: 'node-123',
      user_level: 'beginner',
      exercises: [
        {
          id: 'ex-1',
          type: 'mcq' as const,
          prompt: 'What is 2+2?',
          rubric: 'Basic arithmetic',
          difficulty: 1,
          choices: ['3', '4', '5', '6'],
          correct_answer: '4',
        },
      ],
      metadata: mockMetadata,
    };

    it('should successfully generate exercises', async () => {
      const request = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        topic: 'JavaScript Basics',
        node_title: 'Variables',
        objectives: ['Learn variables'],
        user_level: 'beginner' as const,
        count: 5,
        request_id: 'exercise-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { exercise_set: mockExerciseSetResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.generateExercises(request);

      expect(result).toEqual(mockExerciseSetResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/exercises',
        request
      );
    });

    it('should throw error on exercise generation failure', async () => {
      const request = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        topic: 'Unknown Topic',
        node_title: 'Unknown',
        objectives: [],
        user_level: 'beginner' as const,
        request_id: 'exercise-request-error',
      };

      const errorResponse = {
        response: {
          status: 400,
          data: {
            error: 'EXERCISE_GENERATION_FAILED',
            message: 'Cannot generate exercises for unknown topic',
          },
          statusText: 'Bad Request',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.generateExercises(request)).rejects.toThrow(CurriculumServiceError);
    });
  });

  describe('normalizeTopic', () => {
    const mockNormalizeResponse = {
      topic_normalized: 'react js',
      domain_category: 'web',
      staleness_policy: '14d',
      metadata: mockMetadata,
    };

    it('should successfully normalize topic', async () => {
      const request = {
        topic: 'React.js',
        request_id: 'normalize-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockNormalizeResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.normalizeTopic(request);

      expect(result).toEqual(mockNormalizeResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/normalize-topic',
        request
      );
    });

    it('should throw error on normalization failure', async () => {
      const request = {
        topic: '',
        request_id: 'normalize-request-error',
      };

      const errorResponse = {
        response: {
          status: 400,
          data: {
            error: 'NORMALIZATION_FAILED',
            message: 'Topic is too short',
          },
          statusText: 'Bad Request',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.normalizeTopic(request)).rejects.toThrow(CurriculumServiceError);
    });
  });

  describe('getFacts', () => {
    const mockFactsResponse = {
      facts: ['JavaScript was created in 1995', 'JavaScript is multi-paradigm'],
      sources: ['Wikipedia', 'MDN'],
    };

    it('should successfully get facts', async () => {
      const request = {
        normalized_topic: 'javascript basics',
        keywords: ['javascript', 'basics'],
        request_id: 'facts-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockFactsResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.getFacts(request);

      expect(result.facts).toEqual(mockFactsResponse.facts);
      expect(result.sources).toEqual(mockFactsResponse.sources);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/get-facts',
        expect.objectContaining({
          normalized_topic: 'javascript basics',
          keywords: ['javascript', 'basics'],
        })
      );
    });

    it('should use empty array for keywords if not provided', async () => {
      const request = {
        normalized_topic: 'react js',
        request_id: 'facts-request-456',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: mockFactsResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await client.getFacts(request);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/get-facts',
        expect.objectContaining({
          keywords: [],
        })
      );
    });

    it('should throw error on fact fetch failure', async () => {
      const request = {
        normalized_topic: 'unknown-topic-xyz',
        request_id: 'facts-request-error',
      };

      const errorResponse = {
        response: {
          status: 404,
          data: {
            error: 'FACT_FETCH_FAILED',
            message: 'No facts found for topic',
          },
          statusText: 'Not Found',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.getFacts(request)).rejects.toThrow(CurriculumServiceError);
    });
  });

  describe('generateExam', () => {
    const mockExamResponse = {
      schema_version: 'exercise_set.v1',
      plan_id: 'plan-123',
      node_id: 'node-123',
      user_level: 'intermediate',
      exercises: [
        {
          id: 'exam-ex-1',
          type: 'mcq' as const,
          prompt: 'Exam question',
          rubric: 'Exam rubric',
          difficulty: 3,
          choices: ['A', 'B', 'C', 'D'],
          correct_answer: 'A',
        },
      ],
      exam_difficulty: 3,
      metadata: mockMetadata,
    };

    it('should successfully generate exam', async () => {
      const request = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        topic: 'JavaScript Functions',
        node_title: 'Functions',
        objectives: ['Define functions', 'Call functions'],
        user_level: 'intermediate' as const,
        current_mastery: 0.5,
        exercise_count: 10,
        request_id: 'exam-request-123',
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { exam_exercise_set: mockExamResponse },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const result = await client.generateExam(request);

      expect(result).toEqual(mockExamResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/llm/exam',
        request
      );
    });

    it('should throw error on exam generation failure', async () => {
      const request = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        topic: 'Unknown Topic',
        node_title: 'Unknown',
        objectives: [],
        user_level: 'beginner' as const,
        current_mastery: 0,
        request_id: 'exam-request-error',
      };

      const errorResponse = {
        response: {
          status: 500,
          data: {
            error: 'EXAM_GENERATION_FAILED',
            message: 'Failed to generate exam',
          },
          statusText: 'Internal Server Error',
        },
      };

      mockAxiosInstance.post.mockRejectedValue(errorResponse);

      await expect(client.generateExam(request)).rejects.toThrow(CurriculumServiceError);
    });
  });

  describe('CurriculumServiceError', () => {
    it('should create error with all properties', () => {
      const error = new CurriculumServiceError(
        'Test error message',
        400,
        'TEST_ERROR',
        { detail: 'test detail' }
      );

      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.details).toEqual({ detail: 'test detail' });
      expect(error.name).toBe('CurriculumServiceError');
    });
  });
});
