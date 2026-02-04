/**
 * Mastery tracking hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masteryApi } from '@/api/plan.api';
import type { SubmitAttemptRequest } from '@/types/api.types';

/**
 * Get mastery for a specific node
 */
export function useNodeMastery(planId: string, nodeId: string) {
  return useQuery({
    queryKey: ['node-mastery', planId, nodeId],
    queryFn: () => masteryApi.getNodeMastery(planId, nodeId),
    enabled: !!planId && !!nodeId,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Submit an exercise attempt
 */
export function useSubmitAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      planId,
      nodeId,
      request,
    }: {
      planId: string;
      nodeId: string;
      request: SubmitAttemptRequest;
    }) => masteryApi.submitAttempt(planId, nodeId, request),
    onSuccess: (_data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ['node-mastery', variables.planId, variables.nodeId],
      });
      queryClient.invalidateQueries({
        queryKey: ['plan-mastery', variables.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['next-node', variables.planId],
      });
    },
  });
}
