/**
 * Tests for db/queries/tier.ts: query functions with mocked DB.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/db/client');
jest.mock('../../../src/utils/logger');

import { db } from '../../../src/db/client';
import {
  countActivePlansForUser,
  countExamAttemptsForNode,
  countExerciseRegensForNode,
  recordExerciseGenerationEvent,
  updateUserRoles,
  getUserRoles,
} from '../../../src/db/queries/tier';

const mockedDb = db as jest.Mocked<typeof db>;

describe('Tier DB Queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('countActivePlansForUser', () => {
    it('should count plans with date filter when historyDays is set', async () => {
      mockedDb.query.mockResolvedValue({ rows: [{ count: '5' }], rowCount: 1 } as any);

      const result = await countActivePlansForUser('user-1', 30);
      expect(result).toBe(5);
      expect(mockedDb.query).toHaveBeenCalledTimes(1);

      const [query, params] = mockedDb.query.mock.calls[0];
      expect(query).toContain('INTERVAL');
      expect(params).toEqual(['user-1', 30]);
    });

    it('should count all plans when historyDays is null', async () => {
      mockedDb.query.mockResolvedValue({ rows: [{ count: '10' }], rowCount: 1 } as any);

      const result = await countActivePlansForUser('user-1', null);
      expect(result).toBe(10);

      const [query, params] = mockedDb.query.mock.calls[0];
      expect(query).not.toContain('INTERVAL');
      expect(params).toEqual(['user-1']);
    });

    it('should return 0 when no rows', async () => {
      mockedDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      const result = await countActivePlansForUser('user-1', 30);
      expect(result).toBe(0);
    });
  });

  describe('countExamAttemptsForNode', () => {
    it('should return count from query', async () => {
      mockedDb.query.mockResolvedValue({ rows: [{ count: '2' }], rowCount: 1 } as any);

      const result = await countExamAttemptsForNode('user-1', 'plan-1', 'node-1');
      expect(result).toBe(2);
      expect(mockedDb.query).toHaveBeenCalledWith(
        expect.stringContaining('exam_attempts'),
        ['user-1', 'plan-1', 'node-1']
      );
    });
  });

  describe('countExerciseRegensForNode', () => {
    it('should count only force=true events', async () => {
      mockedDb.query.mockResolvedValue({ rows: [{ count: '1' }], rowCount: 1 } as any);

      const result = await countExerciseRegensForNode('user-1', 'plan-1', 'node-1');
      expect(result).toBe(1);
      expect(mockedDb.query).toHaveBeenCalledWith(
        expect.stringContaining('is_force = true'),
        ['user-1', 'plan-1', 'node-1']
      );
    });
  });

  describe('recordExerciseGenerationEvent', () => {
    it('should insert event', async () => {
      mockedDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await recordExerciseGenerationEvent('user-1', 'plan-1', 'node-1', true);
      expect(mockedDb.query).toHaveBeenCalledWith(
        expect.stringContaining('exercise_generation_events'),
        ['user-1', 'plan-1', 'node-1', true]
      );
    });
  });

  describe('updateUserRoles', () => {
    it('should update roles and return true when user exists', async () => {
      mockedDb.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const result = await updateUserRoles('user-1', ['user', 'pro']);
      expect(result).toBe(true);
      expect(mockedDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        [JSON.stringify(['user', 'pro']), 'user-1']
      );
    });

    it('should return false when user not found', async () => {
      mockedDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await updateUserRoles('nonexistent', ['user']);
      expect(result).toBe(false);
    });
  });

  describe('getUserRoles', () => {
    it('should return roles array', async () => {
      mockedDb.query.mockResolvedValue({
        rows: [{ roles: ['user', 'pro'] }],
        rowCount: 1,
      } as any);

      const result = await getUserRoles('user-1');
      expect(result).toEqual(['user', 'pro']);
    });

    it('should return null when user not found', async () => {
      mockedDb.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await getUserRoles('nonexistent');
      expect(result).toBeNull();
    });
  });
});
