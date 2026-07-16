/**
 * Mastery tracking hooks
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { masteryApi } from '@/api/plan.api';
import type { SubmitAttemptRequest } from '@/types/api.types';

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
        queryKey: ['plan-mastery', variables.planId],
      });
      queryClient.invalidateQueries({
        queryKey: ['next-node', variables.planId],
      });
    },
  });
}
