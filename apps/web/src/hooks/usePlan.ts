/**
 * React hooks for plan-related operations
 * Uses TanStack Query for caching and state management
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planApi, masteryApi, exerciseApi, userApi } from '@/api/plan.api';
import type {
  CreatePlanRequest,
  GenerateExercisesRequest,
} from '@/types/api.types';
import { useAuth } from './useAuth';

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
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['user-plans', params],
    queryFn: ({ signal }) => userApi.getPlans(params, { signal }),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

