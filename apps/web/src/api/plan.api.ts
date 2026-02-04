import apiClient, { getApiError } from './client';
import {
  CreatePlanResponseSchema,
  ExerciseSetResponseSchema,
  AttemptResponseSchema,
  NodeMasteryResponseSchema,
  PlanMasteryOverviewResponseSchema,
  UserPlansResponseSchema,
  safeParseWithLogging,
} from '@/types/schemas';
import type {
  CreatePlanRequest,
  CreatePlanResponse,
  ResourceAttachmentResponse,
  ExerciseSetResponse,
  GenerateExercisesRequest,
  SubmitAttemptRequest,
  AttemptResponse,
  NodeMasteryResponse,
  PlanMasteryOverviewResponse,
  NextNodeRecommendationResponse,
  UserPlansResponse,
  GetUserPlansRequest,
} from '@/types/api.types';

interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Plan API endpoints
 */
export const planApi = {
  /**
   * Create a new learning plan
   */
  async create(request: CreatePlanRequest, options?: RequestOptions): Promise<CreatePlanResponse> {
    try {
      const response = await apiClient.post<CreatePlanResponse>('/api/plan', request, {
        signal: options?.signal,
      });
      return safeParseWithLogging(CreatePlanResponseSchema, response.data, 'planApi.create');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get a plan by ID
   */
  async get(planId: string, options?: RequestOptions): Promise<CreatePlanResponse> {
    try {
      const response = await apiClient.get<CreatePlanResponse>(`/api/plan/${planId}`, {
        signal: options?.signal,
      });
      return safeParseWithLogging(CreatePlanResponseSchema, response.data, 'planApi.get');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Attach YouTube resources to a plan
   */
  async attachResources(planId: string, options?: RequestOptions): Promise<ResourceAttachmentResponse> {
    try {
      const response = await apiClient.post<ResourceAttachmentResponse>(
        `/api/plan/${planId}/resources`,
        null,
        { signal: options?.signal }
      );
      return response.data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get resources for a plan
   */
  async getResources(planId: string, options?: RequestOptions): Promise<ResourceAttachmentResponse> {
    try {
      const response = await apiClient.get<ResourceAttachmentResponse>(
        `/api/plan/${planId}/resources`,
        { signal: options?.signal }
      );
      return response.data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },
};

/**
 * Exercise API endpoints
 */
export const exerciseApi = {
  /**
   * Generate exercises for a node
   */
  async generate(
    planId: string,
    nodeId: string,
    params?: GenerateExercisesRequest,
    options?: RequestOptions
  ): Promise<ExerciseSetResponse> {
    try {
      const response = await apiClient.post<ExerciseSetResponse>(
        `/api/plan/${planId}/nodes/${nodeId}/exercises`,
        null,
        { params, signal: options?.signal }
      );
      return safeParseWithLogging(ExerciseSetResponseSchema, response.data, 'exerciseApi.generate');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get exercises for a node (cached)
   */
  async get(planId: string, nodeId: string, options?: RequestOptions): Promise<ExerciseSetResponse> {
    try {
      const response = await apiClient.get<ExerciseSetResponse>(
        `/api/plan/${planId}/nodes/${nodeId}/exercises`,
        { signal: options?.signal }
      );
      return safeParseWithLogging(ExerciseSetResponseSchema, response.data, 'exerciseApi.get');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },
};

/**
 * Mastery API endpoints
 */
export const masteryApi = {
  /**
   * Submit an exercise attempt
   */
  async submitAttempt(
    planId: string,
    nodeId: string,
    request: SubmitAttemptRequest,
    options?: RequestOptions
  ): Promise<AttemptResponse> {
    try {
      const response = await apiClient.post<AttemptResponse>(
        `/api/plan/${planId}/nodes/${nodeId}/attempts`,
        request,
        { signal: options?.signal }
      );
      return safeParseWithLogging(AttemptResponseSchema, response.data, 'masteryApi.submitAttempt');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get mastery for a specific node
   */
  async getNodeMastery(planId: string, nodeId: string, options?: RequestOptions): Promise<NodeMasteryResponse> {
    try {
      const response = await apiClient.get<NodeMasteryResponse>(
        `/api/plan/${planId}/nodes/${nodeId}/mastery`,
        { signal: options?.signal }
      );
      return safeParseWithLogging(NodeMasteryResponseSchema, response.data, 'masteryApi.getNodeMastery');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get mastery overview for a plan
   */
  async getPlanMastery(planId: string, options?: RequestOptions): Promise<PlanMasteryOverviewResponse> {
    try {
      const response = await apiClient.get<PlanMasteryOverviewResponse>(
        `/api/plan/${planId}/mastery`,
        { signal: options?.signal }
      );
      return safeParseWithLogging(PlanMasteryOverviewResponseSchema, response.data, 'masteryApi.getPlanMastery');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get next node recommendation
   */
  async getNextNode(planId: string, options?: RequestOptions): Promise<NextNodeRecommendationResponse> {
    try {
      const response = await apiClient.get<NextNodeRecommendationResponse>(
        `/api/plan/${planId}/next`,
        { signal: options?.signal }
      );
      // Note: NextNodeRecommendationResponse doesn't have a schema yet, using raw response
      return response.data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },
};

/**
 * User API endpoints
 */
export const userApi = {
  /**
   * Get plans for the current user
   */
  async getPlans(params?: GetUserPlansRequest, options?: RequestOptions): Promise<UserPlansResponse> {
    try {
      const response = await apiClient.get<UserPlansResponse>('/api/users/me/plans', {
        params,
        signal: options?.signal,
      });
      return safeParseWithLogging(UserPlansResponseSchema, response.data, 'userApi.getPlans');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },
};
