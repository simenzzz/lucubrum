/**
 * React hooks for plan-related operations
 * Uses TanStack Query for caching and state management
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planApi, masteryApi, exerciseApi, userApi, examApi } from '@/api/plan.api';
import type {
  CreatePlanRequest,
  GenerateExercisesRequest,
  NodeResourceStatus,
  ExamAnswer,
} from '@/types/api.types';
import { useAuth } from './useAuth';

const MAX_RESOURCE_POLL_COUNT = 120; // ~10 minutes at 5s intervals

/**
 * Create a new learning plan
 */
export function useCreatePlan() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: (request: CreatePlanRequest) => {
      if (!isAuthenticated) {
        throw new Error('You must be signed in to create a plan');
      }
      return planApi.create(request);
    },
    onSuccess: (data) => {
      // Invalidate and refetch plans list
      queryClient.invalidateQueries({ queryKey: ['user-plans'] });
      // Cache the new plan
      queryClient.setQueryData(['plan', data.plan_id], data);
    },
  });
}

/**
 * Get a plan by ID
 */
export function usePlan(planId: string) {
  return useQuery({
    queryKey: ['plan', planId],
    queryFn: ({ signal }) => planApi.get(planId, { signal }),
    enabled: !!planId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

/**
 * Attach YouTube resources to a plan
 */
export function useAttachResources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId }: { planId: string }) => planApi.attachResources(planId),
    onSuccess: (data, variables) => {
      // Update the plan cache with resources
      queryClient.setQueryData(['plan-resources', variables.planId], data);
    },
  });
}

/**
 * Get resources for a plan
 */
export function usePlanResources(planId: string) {
  return useQuery({
    queryKey: ['plan-resources', planId],
    queryFn: ({ signal }) => planApi.getResources(planId, { signal }),
    enabled: !!planId,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - resources change rarely
  });
}

/**
 * Get learn content for a specific node (on-demand with caching).
 * Fetches videos + reading material when user opens Learn tab.
 * Supports polling based on node resource status.
 */
export function useNodeLearnContent(
  planId: string,
  nodeId: string,
  enabled = true,
  nodeStatus?: NodeResourceStatus
) {
  return useQuery({
    queryKey: ['node-learn', planId, nodeId],
    queryFn: ({ signal }) => planApi.getNodeLearnContent(planId, nodeId, { signal }),
    enabled: enabled && !!planId && !!nodeId,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - content is DB-cached on backend
    retry: 1, // Only retry once since generation can be slow
    refetchInterval: (query) => {
      if (query.state.data) return false; // Data arrived — stop polling regardless of nodeStatus
      return nodeStatus === 'pending' ? 5000 : false;
    },
  });
}

/**
 * Generate exercises for a node
 */
export function useGenerateExercises() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      planId,
      nodeId,
      params,
    }: {
      planId: string;
      nodeId: string;
      params?: GenerateExercisesRequest;
    }) => exerciseApi.generate(planId, nodeId, params),
    onSuccess: (data, variables) => {
      // Cache the exercises
      queryClient.setQueryData(['exercises', variables.planId, variables.nodeId], data);
    },
  });
}

/**
 * Get exercises for a node (cached)
 */
export function useExercises(planId: string, nodeId: string, enabled = true) {
  return useQuery({
    queryKey: ['exercises', planId, nodeId],
    queryFn: ({ signal }) => exerciseApi.get(planId, nodeId, { signal }),
    enabled: enabled && !!planId && !!nodeId,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get mastery overview for a plan
 */
export function usePlanMastery(planId: string) {
  return useQuery({
    queryKey: ['plan-mastery', planId],
    queryFn: ({ signal }) => masteryApi.getPlanMastery(planId, { signal }),
    enabled: !!planId,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Get next node recommendation for a plan
 */
export function useNextNode(planId: string, enabled = true) {
  return useQuery({
    queryKey: ['next-node', planId],
    queryFn: ({ signal }) => masteryApi.getNextNode(planId, { signal }),
    enabled: enabled && !!planId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get all plans for the current user
 */
export function useUserPlans(params?: { limit?: number; offset?: number }) {
  const { isAuthenticated, user } = useAuth();

  return useQuery({
    queryKey: ['user-plans', user?.id, params],
    queryFn: ({ signal }) => {
      if (!user) throw new Error('User not authenticated');
      return userApi.getPlans(user.id, params, { signal });
    },
    enabled: isAuthenticated && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Start an exam session for a node
 */
export function useStartExam() {
  return useMutation({
    mutationFn: ({ planId, nodeId, timeLimitSeconds }: {
      planId: string;
      nodeId: string;
      timeLimitSeconds?: number;
    }) => examApi.start(planId, nodeId, timeLimitSeconds ? { time_limit_seconds: timeLimitSeconds } : undefined),
  });
}

/**
 * Submit answers for a completed exam session
 */
export function useSubmitExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, nodeId, sessionId, answers }: {
      planId: string;
      nodeId: string;
      sessionId: string;
      answers: ExamAnswer[];
    }) => examApi.submit(planId, nodeId, { session_id: sessionId, answers }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plan-mastery', variables.planId] });
      queryClient.invalidateQueries({ queryKey: ['next-node', variables.planId] });
    },
  });
}

/**
 * Get resource loading statuses for all nodes in a plan
 * Auto-polls while any node is not ready
 */
export function useNodeResourceStatuses(planId: string) {
  return useQuery({
    queryKey: ['resource-status', planId],
    queryFn: ({ signal }) => planApi.getNodeResourceStatuses(planId, { signal }),
    enabled: !!planId,
    staleTime: 0, // Always fresh
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      const hasLoading = Object.values(data).some(s => s !== 'ready');
      if (!hasLoading) return false;
      // Stop polling after ~10 minutes to prevent infinite loops on permanent failures
      if (query.state.dataUpdateCount > MAX_RESOURCE_POLL_COUNT) return false;
      return 5000;
    },
  });
}

