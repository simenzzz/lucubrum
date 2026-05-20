/**
 * Tests for tier.config.ts: tier detection, limit resolution, env var parsing.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Tier Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    // Reset env to original between tests
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getTierForUser', () => {
    it('should return "free" for users without pro role', async () => {
      const { getTierForUser } = await import('../../../src/config/tier.config');
      expect(getTierForUser(['user'])).toBe('free');
      expect(getTierForUser([])).toBe('free');
      expect(getTierForUser(['admin'])).toBe('free');
    });

    it('should return "pro" for users with pro role', async () => {
      const { getTierForUser } = await import('../../../src/config/tier.config');
      expect(getTierForUser(['user', 'pro'])).toBe('pro');
      expect(getTierForUser(['pro'])).toBe('pro');
    });

    it('should respect TIER_PRO_ROLE env var', async () => {
      process.env.TIER_PRO_ROLE = 'premium';
      const { getTierForUser } = await import('../../../src/config/tier.config');
      expect(getTierForUser(['premium'])).toBe('pro');
      expect(getTierForUser(['pro'])).toBe('free');
    });

    it('should return "super" for users with super role', async () => {
      const { getTierForUser } = await import('../../../src/config/tier.config');
      expect(getTierForUser(['user', 'super'])).toBe('super');
      expect(getTierForUser(['super'])).toBe('super');
    });

    it('should prioritize super over pro when both present', async () => {
      const { getTierForUser } = await import('../../../src/config/tier.config');
      expect(getTierForUser(['user', 'pro', 'super'])).toBe('super');
    });

    it('should respect TIER_SUPER_ROLE env var', async () => {
      process.env.TIER_SUPER_ROLE = 'admin_dev';
      const { getTierForUser } = await import('../../../src/config/tier.config');
      expect(getTierForUser(['admin_dev'])).toBe('super');
      expect(getTierForUser(['super'])).toBe('free');
    });
  });

  describe('getLimitsForUser', () => {
    it('should return free limits for non-pro users', async () => {
      const { getLimitsForUser } = await import('../../../src/config/tier.config');
      const limits = getLimitsForUser(['user']);

      expect(limits.maxActivePlans).toBe(3);
      expect(limits.allowedPlanSizes).toEqual(
        expect.arrayContaining(['basic', 'moderate'])
      );
      expect(limits.dailyLlmAttempts).toBe(15);
      expect(limits.maxExamsPerNode).toBe(2);
      expect(limits.exerciseRegenerations).toBe(0);
      expect(limits.planHistoryDays).toBe(30);
    });

    it('should return pro limits (all Infinity/null) for pro users', async () => {
      const { getLimitsForUser } = await import('../../../src/config/tier.config');
      const limits = getLimitsForUser(['user', 'pro']);

      expect(limits.maxActivePlans).toBe(Infinity);
      expect(limits.allowedPlanSizes).toEqual(
        expect.arrayContaining(['basic', 'moderate', 'large', 'dynamic'])
      );
      expect(limits.dailyLlmAttempts).toBe(Infinity);
      expect(limits.maxExamsPerNode).toBe(Infinity);
      expect(limits.exerciseRegenerations).toBe(Infinity);
      expect(limits.planHistoryDays).toBeNull();
    });

    it('should parse custom env var values for free limits', async () => {
      process.env.FREE_MAX_ACTIVE_PLANS = '5';
      process.env.FREE_ALLOWED_PLAN_SIZES = 'basic';
      process.env.FREE_DAILY_LLM_ATTEMPTS = '20';
      process.env.FREE_MAX_EXAMS_PER_NODE = '3';
      process.env.FREE_EXERCISE_REGENERATIONS = '1';
      process.env.FREE_PLAN_HISTORY_DAYS = '60';

      const { getLimitsForUser } = await import('../../../src/config/tier.config');
      const limits = getLimitsForUser(['user']);

      expect(limits.maxActivePlans).toBe(5);
      expect(limits.allowedPlanSizes).toEqual(['basic']);
      expect(limits.dailyLlmAttempts).toBe(20);
      expect(limits.maxExamsPerNode).toBe(3);
      expect(limits.exerciseRegenerations).toBe(1);
      expect(limits.planHistoryDays).toBe(60);
    });

    it('should return unlimited limits for super users', async () => {
      const { getLimitsForUser } = await import('../../../src/config/tier.config');
      const limits = getLimitsForUser(['user', 'super']);

      expect(limits.maxActivePlans).toBe(Infinity);
      expect(limits.allowedPlanSizes).toEqual(
        expect.arrayContaining(['basic', 'moderate', 'large', 'dynamic'])
      );
      expect(limits.dailyLlmAttempts).toBe(Infinity);
      expect(limits.maxExamsPerNode).toBe(Infinity);
      expect(limits.exerciseRegenerations).toBe(Infinity);
      expect(limits.planHistoryDays).toBeNull();
    });

    it('should use defaults when env vars are invalid', async () => {
      process.env.FREE_MAX_ACTIVE_PLANS = 'not-a-number';
      process.env.FREE_DAILY_LLM_ATTEMPTS = '';

      const { getLimitsForUser } = await import('../../../src/config/tier.config');
      const limits = getLimitsForUser(['user']);

      // parseInt('not-a-number') = NaN, || 3 fallback
      expect(limits.maxActivePlans).toBe(3);
      // parseInt('') = NaN, || 15 fallback
      expect(limits.dailyLlmAttempts).toBe(15);
    });
  });
});
