import { describe, expect, it } from 'vitest';
import { getApiError } from './client';

function axiosLikeError(data: unknown): unknown {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: {
      data,
    },
  };
}

describe('getApiError', () => {
  it('includes first validation detail when present', () => {
    const message = getApiError(axiosLikeError({
      error: 'VALIDATION_FAILED',
      message: 'Failed to generate valid exercises after retries',
      request_id: 'req-1',
      details: {
        validation_errors: ['rubric must be at least 20 characters'],
      },
    }));

    expect(message).toBe(
      'Failed to generate valid exercises after retries: rubric must be at least 20 characters'
    );
  });

  it('includes provider error detail when present', () => {
    const message = getApiError(axiosLikeError({
      error: 'LLM_PROVIDER_QUOTA_EXHAUSTED',
      message: 'LLM provider quota exhausted. Please check provider billing or API credits.',
      request_id: 'req-1',
      details: {
        provider_error: 'Insufficient balance or no resource package. Please recharge.',
      },
    }));

    expect(message).toBe(
      'LLM provider quota exhausted. Please check provider billing or API credits: Insufficient balance or no resource package. Please recharge.'
    );
  });
});
