import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetExercisesForNode = jest.fn() as jest.MockedFunction<(planId: string, nodeId: string) => Promise<any[]>>;
const mockHasExercisesForNode = jest.fn() as jest.MockedFunction<(planId: string, nodeId: string) => Promise<boolean>>;
const mockDeleteExercisesForNode = jest.fn() as jest.MockedFunction<(planId: string, nodeId: string) => Promise<void>>;
const mockInsertExercises = jest.fn() as jest.MockedFunction<(planId: string, nodeId: string, exercises: any[]) => Promise<{ id_mapping: Record<string, string> }>>;
const mockGetPlanWithNodes = jest.fn() as jest.MockedFunction<(planId: string) => Promise<any>>;
const mockGenerateExercises = jest.fn() as jest.MockedFunction<(request: any) => Promise<any>>;

jest.mock('../../../src/db/queries/exercises', () => ({
  getExercisesForNode: mockGetExercisesForNode,
  hasExercisesForNode: mockHasExercisesForNode,
  deleteExercisesForNode: mockDeleteExercisesForNode,
  insertExercises: mockInsertExercises,
  __esModule: true,
}));

jest.mock('../../../src/db/queries/plans', () => ({
  getPlanWithNodes: mockGetPlanWithNodes,
  __esModule: true,
}));

jest.mock('../../../src/services/curriculum-client', () => ({
  __esModule: true,
  curriculumClient: {
    generateExercises: mockGenerateExercises,
  },
}));

jest.mock('../../../src/utils/logger');

import { exerciseService, ExerciseServiceError } from '../../../src/services/exercise.service';

describe('ExerciseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExercisesForNode.mockResolvedValue([]);
    mockGetPlanWithNodes.mockResolvedValue({
      plan: {
        topic: 'Web Security',
        user_level: 'beginner',
      },
      nodes: [
        {
          node_id: 'intro_to_waf',
          title: 'Introduction to WAF',
          objectives: ['Understand WAF basics'],
        },
      ],
    });
  });

  it('preserves upstream provider error details', async () => {
    const upstreamError = new Error('LLM provider quota exhausted') as Error & {
      statusCode: number;
      errorCode: string;
      details: Record<string, unknown>;
    };
    upstreamError.statusCode = 503;
    upstreamError.errorCode = 'LLM_PROVIDER_QUOTA_EXHAUSTED';
    upstreamError.details = {
      validation_errors: ['provider balance is exhausted'],
      provider_error: 'Insufficient balance or no resource package. Please recharge.',
      upstream_status: 503,
    };
    mockGenerateExercises.mockRejectedValue(upstreamError);

    await expect(
      exerciseService.generateExercises(
        '69267e87-4348-4248-aa71-b7e8bab5a264',
        'intro_to_waf',
        { difficulty_target: 1 },
        'request-1',
        false
      )
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'LLM_PROVIDER_QUOTA_EXHAUSTED',
      details: {
        validation_errors: ['provider balance is exhausted'],
        provider_error: 'Insufficient balance or no resource package. Please recharge.',
        upstream_status: 503,
        plan_id: '69267e87-4348-4248-aa71-b7e8bab5a264',
        node_id: 'intro_to_waf',
      },
    } satisfies Partial<ExerciseServiceError>);
  });
});
