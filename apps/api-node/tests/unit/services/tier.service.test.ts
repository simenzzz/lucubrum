/**
 * Tests for tier.service.ts: Redis counter logic, TTL, fail-open behavior.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies before imports
jest.mock('../../../src/db/redis');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/db/queries/tier');

import { redis } from '../../../src/db/redis';
import {
  isLlmGradedType,
  getDailyLlmAttemptCount,
  reserveDailyLlmAttempt,
  rollbackDailyLlmAttempt,
  canCreatePlan,
  canStartExam,
  canRegenerateExercises,
} from '../../../src/services/tier.service';
import {
  countActivePlansForUser,
  countExamAttemptsForNode,
  countExerciseRegensForNode,
} from '../../../src/db/queries/tier';

const mockedRedis = redis as jest.Mocked<typeof redis>;
const mockedCountActivePlans = countActivePlansForUser as jest.MockedFunction<typeof countActivePlansForUser>;
const mockedCountExamAttempts = countExamAttemptsForNode as jest.MockedFunction<typeof countExamAttemptsForNode>;
const mockedCountExerciseRegens = countExerciseRegensForNode as jest.MockedFunction<typeof countExerciseRegensForNode>;

describe('Tier Service', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      get: jest.fn(),
      incr: jest.fn(),
      decr: jest.fn(),
      expire: jest.fn(),
      pipeline: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      }),
    };
    mockedRedis.getClient.mockReturnValue(mockClient as any);
    mockedRedis.isReady.mockReturnValue(true);
  });

  describe('isLlmGradedType', () => {
    it('should return true for LLM-graded types', () => {
      expect(isLlmGradedType('short_answer')).toBe(true);
      expect(isLlmGradedType('fill_blank')).toBe(true);
      expect(isLlmGradedType('coding')).toBe(true);
    });

    it('should return false for locally-graded types', () => {
      expect(isLlmGradedType('mcq')).toBe(false);
      expect(isLlmGradedType('flashcard')).toBe(false);
      expect(isLlmGradedType('unknown')).toBe(false);
    });
  });

  describe('getDailyLlmAttemptCount', () => {
    it('should return count from Redis', async () => {
      mockClient.get.mockResolvedValue('7');
      const count = await getDailyLlmAttemptCount('user-1');
      expect(count).toBe(7);
    });

    it('should return 0 when key does not exist', async () => {
      mockClient.get.mockResolvedValue(null);
      const count = await getDailyLlmAttemptCount('user-1');
      expect(count).toBe(0);
    });

    it('should fail open (return 0) when Redis is down', async () => {
      mockedRedis.isReady.mockReturnValue(false);
      const count = await getDailyLlmAttemptCount('user-1');
      expect(count).toBe(0);
    });

    it('should fail open (return 0) on Redis error', async () => {
      mockClient.get.mockRejectedValue(new Error('connection refused'));
      const count = await getDailyLlmAttemptCount('user-1');
      expect(count).toBe(0);
    });
  });

  describe('canCreatePlan', () => {
    it('should allow when under limit', async () => {
      mockedCountActivePlans.mockResolvedValue(2);
      const result = await canCreatePlan('user-1', 3, 30);
      expect(result).toEqual({ allowed: true, current: 2, limit: 3 });
    });

    it('should block when at limit', async () => {
      mockedCountActivePlans.mockResolvedValue(3);
      const result = await canCreatePlan('user-1', 3, 30);
      expect(result).toEqual({ allowed: false, current: 3, limit: 3 });
    });

    it('should always allow for pro users (Infinity)', async () => {
      const result = await canCreatePlan('user-1', Infinity, null);
      expect(result.allowed).toBe(true);
      expect(mockedCountActivePlans).not.toHaveBeenCalled();
    });
  });

  describe('canStartExam', () => {
    it('should allow when under limit', async () => {
      mockedCountExamAttempts.mockResolvedValue(1);
      const result = await canStartExam('user-1', 'plan-1', 'node-1', 2);
      expect(result).toEqual({ allowed: true, current: 1, limit: 2 });
    });

    it('should block when at limit', async () => {
      mockedCountExamAttempts.mockResolvedValue(2);
      const result = await canStartExam('user-1', 'plan-1', 'node-1', 2);
      expect(result).toEqual({ allowed: false, current: 2, limit: 2 });
    });

    it('should always allow for Infinity limit', async () => {
      const result = await canStartExam('user-1', 'plan-1', 'node-1', Infinity);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canRegenerateExercises', () => {
    it('should block when limit is 0 without querying DB', async () => {
      const result = await canRegenerateExercises('user-1', 'plan-1', 'node-1', 0);
      expect(result).toEqual({ allowed: false, current: 0, limit: 0 });
      expect(mockedCountExerciseRegens).not.toHaveBeenCalled();
    });

    it('should allow when limit > 0 and usage under limit', async () => {
      mockedCountExerciseRegens.mockResolvedValue(2);
      const result = await canRegenerateExercises('user-1', 'plan-1', 'node-1', 5);
      expect(result).toEqual({ allowed: true, current: 2, limit: 5 });
      expect(mockedCountExerciseRegens).toHaveBeenCalledWith('user-1', 'plan-1', 'node-1');
    });

    it('should block when limit > 0 and usage at limit', async () => {
      mockedCountExerciseRegens.mockResolvedValue(5);
      const result = await canRegenerateExercises('user-1', 'plan-1', 'node-1', 5);
      expect(result).toEqual({ allowed: false, current: 5, limit: 5 });
    });

    it('should always allow for Infinity limit', async () => {
      const result = await canRegenerateExercises('user-1', 'plan-1', 'node-1', Infinity);
      expect(result.allowed).toBe(true);
    });
  });

  describe('reserveDailyLlmAttempt (atomic pattern)', () => {
    it('should allow when under limit and return new count', async () => {
      mockClient.incr.mockResolvedValue(5);
      mockClient.expire.mockResolvedValue(1);

      const result = await reserveDailyLlmAttempt('user-1', 15);

      expect(result).toEqual({ allowed: true, current: 5, limit: 15 });
      expect(mockClient.incr).toHaveBeenCalled();
      // expire is only called on first increment (newCount === 1)
      expect(mockClient.expire).not.toHaveBeenCalled();
    });

    it('should block when over limit and rollback with DECR', async () => {
      // INCR returns 16, but limit is 15
      mockClient.incr.mockResolvedValue(16);
      mockClient.decr.mockResolvedValue(15);

      const result = await reserveDailyLlmAttempt('user-1', 15);

      expect(result).toEqual({ allowed: false, current: 15, limit: 15 });
      expect(mockClient.incr).toHaveBeenCalled();
      expect(mockClient.decr).toHaveBeenCalled(); // Rollback called
    });

    it('should set TTL only on first increment (newCount === 1)', async () => {
      mockClient.incr.mockResolvedValue(1);
      mockClient.expire.mockResolvedValue(1);

      await reserveDailyLlmAttempt('user-1', 15);

      expect(mockClient.expire).toHaveBeenCalledWith(expect.any(String), expect.any(Number));
    });

    it('should NOT set TTL when counter already exists (newCount > 1)', async () => {
      mockClient.incr.mockResolvedValue(5);

      await reserveDailyLlmAttempt('user-1', 15);

      expect(mockClient.expire).not.toHaveBeenCalled();
    });

    it('should fail open when Redis is down', async () => {
      mockedRedis.isReady.mockReturnValue(false);

      const result = await reserveDailyLlmAttempt('user-1', 15);

      expect(result).toEqual({ allowed: true, current: 0, limit: 15 });
    });

    it('should fail open on Redis error', async () => {
      mockClient.incr.mockRejectedValue(new Error('connection refused'));

      const result = await reserveDailyLlmAttempt('user-1', 15);

      expect(result).toEqual({ allowed: true, current: 0, limit: 15 });
    });

    it('should always allow for Infinity limit (pro users)', async () => {
      const result = await reserveDailyLlmAttempt('user-1', Infinity);

      expect(result.allowed).toBe(true);
      expect(mockClient.incr).not.toHaveBeenCalled();
    });
  });

  describe('rollbackDailyLlmAttempt', () => {
    it('should decrement the counter', async () => {
      mockClient.decr.mockResolvedValue(14);

      await rollbackDailyLlmAttempt('user-1');

      expect(mockClient.decr).toHaveBeenCalledWith(expect.stringContaining('user-1'));
    });

    it('should not throw when Redis is down', async () => {
      mockedRedis.isReady.mockReturnValue(false);

      await expect(rollbackDailyLlmAttempt('user-1')).resolves.toBeUndefined();
    });

    it('should not throw on Redis error', async () => {
      mockClient.decr.mockRejectedValue(new Error('connection refused'));

      await expect(rollbackDailyLlmAttempt('user-1')).resolves.toBeUndefined();
    });

    it('should delete key when DECR goes negative', async () => {
      mockClient.decr.mockResolvedValue(-1);
      mockClient.del = jest.fn<() => Promise<number>>().mockResolvedValue(1);

      await rollbackDailyLlmAttempt('user-1');

      expect(mockClient.decr).toHaveBeenCalled();
      expect(mockClient.del).toHaveBeenCalledWith(expect.stringContaining('user-1'));
    });

    it('should not delete key when DECR returns non-negative', async () => {
      mockClient.decr.mockResolvedValue(0);
      mockClient.del = jest.fn<() => Promise<number>>().mockResolvedValue(0);

      await rollbackDailyLlmAttempt('user-1');

      expect(mockClient.decr).toHaveBeenCalled();
      expect(mockClient.del).not.toHaveBeenCalled();
    });
  });
});
