/**
 * Tests for tier.middleware.ts: each middleware factory.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/config/tier.config');
jest.mock('../../../src/services/tier.service');
jest.mock('../../../src/db/queries/exercises');
jest.mock('../../../src/utils/logger');

import { getLimitsForUser } from '../../../src/config/tier.config';
import * as tierService from '../../../src/services/tier.service';
import { getExerciseById } from '../../../src/db/queries/exercises';
import {
  enforcePlanLimit,
  enforcePlanSize,
  enforceDailyAttemptQuota,
  enforceExamLimit,
  enforceExerciseRegenLimit,
} from '../../../src/middleware/tier.middleware';
import {
  createMockRequest,
  createMockResponse,
  createMockNextFunction,
} from '../../../tests/fixtures/express.mocks';

const mockedGetLimits = getLimitsForUser as jest.MockedFunction<typeof getLimitsForUser>;
const mockedCanCreatePlan = tierService.canCreatePlan as jest.MockedFunction<typeof tierService.canCreatePlan>;
const mockedReserveDailyLlmAttempt = tierService.reserveDailyLlmAttempt as jest.MockedFunction<typeof tierService.reserveDailyLlmAttempt>;
const mockedIsLlmGradedType = tierService.isLlmGradedType as jest.MockedFunction<typeof tierService.isLlmGradedType>;
const mockedCanStartExam = tierService.canStartExam as jest.MockedFunction<typeof tierService.canStartExam>;
const mockedCanRegenerateExercises = tierService.canRegenerateExercises as jest.MockedFunction<typeof tierService.canRegenerateExercises>;
const mockedGetExerciseById = getExerciseById as jest.MockedFunction<typeof getExerciseById>;

const FREE_LIMITS = {
  maxActivePlans: 3,
  allowedPlanSizes: ['basic', 'moderate'] as readonly string[],
  dailyLlmAttempts: 15,
  maxExamsPerNode: 2,
  exerciseRegenerations: 0,
  planHistoryDays: 30,
};

const PRO_LIMITS = {
  maxActivePlans: Infinity,
  allowedPlanSizes: ['basic', 'moderate', 'large', 'dynamic'] as readonly string[],
  dailyLlmAttempts: Infinity,
  maxExamsPerNode: Infinity,
  exerciseRegenerations: Infinity,
  planHistoryDays: null,
};

const SUPER_LIMITS = {
  maxActivePlans: Infinity,
  allowedPlanSizes: ['basic', 'moderate', 'large', 'dynamic'] as readonly string[],
  dailyLlmAttempts: Infinity,
  maxExamsPerNode: Infinity,
  exerciseRegenerations: Infinity,
  planHistoryDays: null,
};

describe('Tier Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enforcePlanLimit', () => {
    it('should call next for pro users (bypasses check)', async () => {
      mockedGetLimits.mockReturnValue(PRO_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'pro'] },
        headers: { 'x-request-id': 'req-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforcePlanLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should call next for super users (bypasses check)', async () => {
      mockedGetLimits.mockReturnValue(SUPER_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'super'] },
        headers: { 'x-request-id': 'req-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforcePlanLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should call next for free user under limit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanCreatePlan.mockResolvedValue({ allowed: true, current: 2, limit: 3 });
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforcePlanLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should return 403 for free user at limit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanCreatePlan.mockResolvedValue({ allowed: false, current: 3, limit: 3 });
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforcePlanLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
      expect((res.jsonData as any).error).toBe('TIER_LIMIT_EXCEEDED');
    });
  });

  describe('enforcePlanSize', () => {
    it('should call next for allowed plan size', () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { plan_size: 'basic' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      enforcePlanSize()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should return 403 for disallowed plan size', () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { plan_size: 'large' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      enforcePlanSize()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
      expect((res.jsonData as any).error).toBe('TIER_LIMIT_EXCEEDED');
    });

    it('should allow all sizes for pro users', () => {
      mockedGetLimits.mockReturnValue(PRO_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'pro'] },
        body: { plan_size: 'large' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      enforcePlanSize()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should allow all sizes for super users', () => {
      mockedGetLimits.mockReturnValue(SUPER_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'super'] },
        body: { plan_size: 'dynamic' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      enforcePlanSize()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });
  });

  describe('enforceDailyAttemptQuota', () => {
    it('should skip quota check for MCQ exercises', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedGetExerciseById.mockResolvedValue({
        exercise_id: 'ex-1',
        plan_id: 'p1',
        node_id: 'n1',
        type: 'mcq',
        prompt: 'test',
        choices: ['a', 'b'],
        correct_answer: 'a',
        rubric: '',
        difficulty: 1,
        created_at: new Date(),
      });
      mockedIsLlmGradedType.mockReturnValue(false);

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
      expect((req as any).tierQuotaApplies).toBeUndefined();
    });

    it('should block LLM-graded attempt when quota exceeded', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedGetExerciseById.mockResolvedValue({
        exercise_id: 'ex-1',
        plan_id: 'p1',
        node_id: 'n1',
        type: 'short_answer',
        prompt: 'test',
        choices: null,
        correct_answer: 'answer',
        rubric: '',
        difficulty: 1,
        created_at: new Date(),
      });
      mockedIsLlmGradedType.mockReturnValue(true);
      mockedReserveDailyLlmAttempt.mockResolvedValue({ allowed: false, current: 15, limit: 15 });

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
    });

    it('should set tierQuotaApplies when LLM attempt is allowed', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedGetExerciseById.mockResolvedValue({
        exercise_id: 'ex-1',
        plan_id: 'p1',
        node_id: 'n1',
        type: 'coding',
        prompt: 'test',
        choices: null,
        correct_answer: 'answer',
        rubric: '',
        difficulty: 1,
        created_at: new Date(),
      });
      mockedIsLlmGradedType.mockReturnValue(true);
      mockedReserveDailyLlmAttempt.mockResolvedValue({ allowed: true, current: 5, limit: 15 });

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
      expect((req as any).tierQuotaApplies).toBe(true);
    });

    it('should bypass for pro users', async () => {
      mockedGetLimits.mockReturnValue(PRO_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'pro'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should bypass for super users', async () => {
      mockedGetLimits.mockReturnValue(SUPER_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'super'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });
  });

  describe('enforceExamLimit', () => {
    it('should call next when under limit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanStartExam.mockResolvedValue({ allowed: true, current: 1, limit: 2 });
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExamLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should return 403 when at limit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanStartExam.mockResolvedValue({ allowed: false, current: 2, limit: 2 });
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExamLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
    });

    it('should bypass for super users', async () => {
      mockedGetLimits.mockReturnValue(SUPER_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'super'] },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExamLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });
  });

  describe('enforceExerciseRegenLimit', () => {
    it('should call next when force is not set', async () => {
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: {},
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExerciseRegenLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should return 403 for free user with force=true and limit=0', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanRegenerateExercises.mockResolvedValue({ allowed: false, current: 0, limit: 0 });
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { force: true },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExerciseRegenLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
    });

    it('should allow pro user to regenerate', async () => {
      mockedGetLimits.mockReturnValue(PRO_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'pro'] },
        body: { force: true },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExerciseRegenLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });

    it('should allow super user to regenerate', async () => {
      mockedGetLimits.mockReturnValue(SUPER_LIMITS);
      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user', 'super'] },
        body: { force: true },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExerciseRegenLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should return 503 when Postgres fails in enforcePlanLimit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanCreatePlan.mockRejectedValue(new Error('Postgres connection failed'));

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforcePlanLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(503);
      expect((res.jsonData as any).error).toBe('SERVICE_UNAVAILABLE');
    });

    it('should return 503 when Postgres fails in enforceExamLimit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanStartExam.mockRejectedValue(new Error('Database unavailable'));

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExamLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(503);
    });

    it('should return 503 when Postgres fails in enforceExerciseRegenLimit', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedCanRegenerateExercises.mockRejectedValue(new Error('DB timeout'));

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { force: true },
        params: { planId: 'p1', nodeId: 'n1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceExerciseRegenLimit()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(503);
    });

    it('should return 503 when exercise lookup fails in enforceDailyAttemptQuota (fail-closed)', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedGetExerciseById.mockRejectedValue(new Error('Postgres connection failed'));

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(503);
      expect((res.jsonData as any).error).toBe('SERVICE_UNAVAILABLE');
      // Reserve should never be called when exercise lookup fails
      expect(mockedReserveDailyLlmAttempt).not.toHaveBeenCalled();
    });

    it('should fail open when Redis fails in enforceDailyAttemptQuota', async () => {
      mockedGetLimits.mockReturnValue(FREE_LIMITS);
      mockedGetExerciseById.mockResolvedValue({
        exercise_id: 'ex-1',
        plan_id: 'p1',
        node_id: 'n1',
        type: 'short_answer',
        prompt: 'test',
        choices: null,
        correct_answer: 'answer',
        rubric: '',
        difficulty: 1,
        created_at: new Date(),
      });
      mockedIsLlmGradedType.mockReturnValue(true);
      mockedReserveDailyLlmAttempt.mockRejectedValue(new Error('Redis timeout'));

      const req = createMockRequest({
        user: { user_id: 'u1', email: 'a@b.com', roles: ['user'] },
        body: { exercise_id: 'ex-1' },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      await enforceDailyAttemptQuota()(req, res, mockNext.next);
      expect(mockNext.calls).toBe(1); // Fail open - calls next
    });
  });
});
