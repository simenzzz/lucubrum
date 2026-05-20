/**
 * Mastery service tests
 * Tests for services/mastery.service.ts: calculateMastery, masteryToLevel, getNextNode functions
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EXERCISE_MASTERY_CAP, MASTERY_VOLUME_TARGET } from '../../../src/constants/mastery';

// Mock setup BEFORE imports
const mockGetExerciseById = jest.fn() as jest.MockedFunction<(exerciseId: string) => Promise<any>>;
const mockGetPlanWithNodes = jest.fn() as jest.MockedFunction<(planId: string) => Promise<any>>;

const mockGetNodeResourceStatusBatch = jest.fn() as jest.MockedFunction<(planId: string) => Promise<any>>;
const mockPreloadNodeResources = jest.fn() as jest.MockedFunction<(planId: string, nodeIds: string[], allNodes: any[]) => Promise<void>>;
const mockGetDepth1NeighborIds = jest.fn().mockReturnValue([]);
const mockNodeRowsToLearningNodes = jest.fn().mockReturnValue([]);

jest.mock('../../../src/db/queries/exercises', () => ({
  getExerciseById: mockGetExerciseById,
  __esModule: true,
}));

jest.mock('../../../src/db/queries/plans', () => ({
  getPlanWithNodes: mockGetPlanWithNodes,
  __esModule: true,
}));

jest.mock('../../../src/db/client', () => ({
  db: {
    query: jest.fn(),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    transaction: jest.fn().mockImplementation(async (callback: unknown) => {
      // Execute the callback with a fake client — the individual query functions are already mocked
      return (callback as (client: any) => Promise<any>)(undefined);
    }),
  },
  __esModule: true,
}));

jest.mock('../../../src/db/queries/mastery', () => ({
  insertAttempt: jest.fn(),
  getRecentAttempts: jest.fn(),
getAttemptStats: jest.fn(),
  getAttemptStatsForPlan: jest.fn(),
  upsertMastery: jest.fn(),
  upsertMasteryIfHigher: jest.fn(),
  getMastery: jest.fn(),
  getMasteryForPlan: jest.fn(),
  getMaxCompletedDifficulty: jest.fn(),
  __esModule: true,
}));

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/learn.service', () => ({
  preloadNodeResources: mockPreloadNodeResources,
  getDepth1NeighborIds: mockGetDepth1NeighborIds,
  nodeRowsToLearningNodes: mockNodeRowsToLearningNodes,
  __esModule: true,
}));
jest.mock('../../../src/db/queries/resources', () => ({
  getNodeResourceStatusBatch: mockGetNodeResourceStatusBatch,
  __esModule: true,
}));
jest.mock('../../../src/services/curriculum-client', () => ({
  __esModule: true,
  curriculumClient: {
    gradeAnswer: jest.fn(),
    generatePlan: jest.fn(),
    generateExercises: jest.fn(),
    validateVideo: jest.fn(),
    checkStaleness: jest.fn(),
    normalizeTopic: jest.fn(),
    getFacts: jest.fn(),
    generateExam: jest.fn(),
    healthCheck: jest.fn(),
  },
  CurriculumClient: jest.fn(),
  CurriculumServiceError: class CurriculumServiceError extends Error {
    constructor(msg: string, public statusCode: number, public errorCode: string, public details?: any) {
      super(msg);
      this.name = 'CurriculumServiceError';
    }
  },
}));

import {
  masteryService,
  MasteryLevel,
  type SubmitAttemptInput,
  type SubmitAttemptResult,
  type GetMasteryResult,
  type NextNodeRecommendation,
} from '../../../src/services/mastery.service';
import type { AttemptRow } from '../../../src/db/queries/mastery';

import { curriculumClient } from '../../../src/services/curriculum-client';
import {
  insertAttempt,
  getRecentAttempts,
  getAttemptStats,
  getAttemptStatsForPlan,
  getMastery,
  getMasteryForPlan,
  getMaxCompletedDifficulty,
  upsertMastery,
  upsertMasteryIfHigher,
} from '../../../src/db/queries/mastery';
// Type assertions for mocked functions
const mockedCurriculumClient = curriculumClient as jest.Mocked<typeof curriculumClient>;
const mockedInsertAttempt = insertAttempt as jest.MockedFunction<typeof insertAttempt>;
const mockedGetRecentAttempts = getRecentAttempts as jest.MockedFunction<typeof getRecentAttempts>;
const mockedUpsertMastery = upsertMastery as jest.MockedFunction<typeof upsertMastery>;
const mockedUpsertMasteryIfHigher = upsertMasteryIfHigher as jest.MockedFunction<typeof upsertMasteryIfHigher>;
const mockedGetMastery = getMastery as jest.MockedFunction<typeof getMastery>;
const mockedGetMasteryForPlan = getMasteryForPlan as jest.MockedFunction<typeof getMasteryForPlan>;
const mockedGetAttemptStats = getAttemptStats as jest.MockedFunction<typeof getAttemptStats>;
const mockedGetAttemptStatsForPlan = getAttemptStatsForPlan as jest.MockedFunction<typeof getAttemptStatsForPlan>;
const mockedGetMaxCompletedDifficulty = getMaxCompletedDifficulty as jest.MockedFunction<typeof getMaxCompletedDifficulty>;

describe('MasteryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to convert attempt array to stats for calculateMastery
  const toStats = (attempts: AttemptRow[]) => ({
    total: attempts.length,
    correct: attempts.filter(a => a.is_correct).length,
  });

  // Helper to create mock attempt
  const createMockAttempt = (isCorrect: boolean): AttemptRow => ({
    attempt_id: `attempt-${Math.random()}`,
    user_id: 'user-123',
    exercise_id: 'exercise-123',
    created_at: new Date(),
    is_correct: isCorrect,
    score: isCorrect ? 1.0 : 0.0,
    feedback: isCorrect ? 'Correct!' : 'Incorrect',
    misconceptions: null,
    user_answer: isCorrect ? 'correct-answer' : 'wrong-answer',
  });

  describe('calculateMastery', () => {
    it('should return 0 for no attempts', () => {
      const result = masteryService.calculateMastery([], { total: 0, correct: 0 }, 0);

      expect(result).toBe(0);
    });

    it('should return ~0.05 for 1 correct answer at difficulty 1', () => {
      const oneCorrect = [createMockAttempt(true)];

      const result = masteryService.calculateMastery(oneCorrect, toStats(oneCorrect), 1);

      // Formula: accuracy(1.0) * volume(sqrt(1)/sqrt(15)) * difficulty(0.2)
      // = 1.0 * 0.258 * 0.2 = ~0.052
      expect(result).toBeCloseTo(0.05, 1);
    });

    it('should return ~0.23 for 5 correct answers at difficulty 2', () => {
      const fiveCorrect = Array(5).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(fiveCorrect, toStats(fiveCorrect), 2);

      // Formula: accuracy(1.0) * volume(sqrt(5)/sqrt(15)) * difficulty(0.4)
      // = 1.0 * 0.577 * 0.4 = ~0.231
      expect(result).toBeCloseTo(0.23, 1);
    });

    it('should return ~0.16 for 3 correct answers at difficulty 3', () => {
      const threeCorrect = Array(3).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(threeCorrect, toStats(threeCorrect), 3);

      // Formula: accuracy(1.0) * volume(sqrt(3)/sqrt(15)) * difficulty(0.6)
      // = 1.0 * 0.447 * 0.6 = ~0.268 (but clamped)
      expect(result).toBeGreaterThan(0.25);
      expect(result).toBeLessThan(0.28);
    });

    it('should return raw score above cap for 10 correct at difficulty 5', () => {
      const tenCorrect = Array(10).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(tenCorrect, toStats(tenCorrect), 5);

      // Formula: accuracy(1.0) * volume(sqrt(10)/sqrt(15)) * difficulty(1.0)
      // = 1.0 * 0.816 * 1.0 = 0.816 (caller will cap at 0.35)
      expect(result).toBeCloseTo(0.82, 1);
    });

    it('should return raw score at cap for 15 correct at difficulty 5', () => {
      const fifteenCorrect = Array(15).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(fifteenCorrect, toStats(fifteenCorrect), 5);

      // Formula: accuracy(1.0) * volume(sqrt(15)/sqrt(15)) * difficulty(1.0)
      // = 1.0 * 1.0 * 1.0 = 1.0 (caller will cap at 0.35)
      expect(result).toBeCloseTo(1.0, 1);
    });

    it('should return ~0.35 for 10 correct + 5 wrong at difficulty 5 (accuracy penalty)', () => {
      const mixed = [
        ...Array(10).fill(null).map(() => createMockAttempt(true)),
        ...Array(5).fill(null).map(() => createMockAttempt(false)),
      ];

      const result = masteryService.calculateMastery(mixed.slice(0, 10), toStats(mixed), 5);

      // Formula: accuracy(recent 1.0 * 0.6 + historical 0.667 * 0.4 = 0.867)
      //          * volume(sqrt(10)/sqrt(15)=0.816) * difficulty(1.0)
      // = 0.867 * 0.816 * 1.0 = ~0.71 (caller will cap at 0.35)
      expect(result).toBeCloseTo(0.71, 1);
    });

    it('should return ~0.17 for 5 correct + 5 wrong at difficulty 3', () => {
      const mixed = [
        ...Array(5).fill(null).map(() => createMockAttempt(true)),
        ...Array(5).fill(null).map(() => createMockAttempt(false)),
      ];

      const result = masteryService.calculateMastery(mixed.slice(0, 10), toStats(mixed), 3);

      // Formula: accuracy(0.5) * volume(sqrt(5)/sqrt(15)=0.577) * difficulty(0.6)
      // = 0.5 * 0.577 * 0.6 = ~0.173
      expect(result).toBeCloseTo(0.17, 1);
    });

    it('should return 0 for all wrong answers', () => {
      const allWrong = [
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
      ];

      const result = masteryService.calculateMastery(allWrong, toStats(allWrong), 5);

      // Accuracy is 0, so entire formula becomes 0
      expect(result).toBe(0);
    });

    it('should clamp score to 0-1 range', () => {
      // Create a scenario that would exceed 1.0
      // With volume multiplier at 1.0 (at or above target) and max difficulty
      const manyCorrect = Array(MASTERY_VOLUME_TARGET).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(manyCorrect, toStats(manyCorrect), 5);

      // Should not exceed 1.0
      expect(result).toBeLessThanOrEqual(1.0);
      expect(result).toBeGreaterThan(0.95);
    });

    it('should handle difficulty of 0', () => {
      const oneCorrect = [createMockAttempt(true)];

      const result = masteryService.calculateMastery(oneCorrect, toStats(oneCorrect), 0);

      // Difficulty multiplier is 0, so entire formula becomes 0
      expect(result).toBe(0);
    });

    it('should handle negative max difficulty gracefully', () => {
      const oneCorrect = [createMockAttempt(true)];

      const result = masteryService.calculateMastery(oneCorrect, toStats(oneCorrect), -1);

      // Negative difficulty treated as 0 (0/5 = 0)
      expect(result).toBe(0);
    });

    it('should handle difficulty greater than 5', () => {
      const fiveCorrect = Array(5).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(fiveCorrect, toStats(fiveCorrect), 10);

      // Difficulty should cap at 5 (1.0 multiplier)
      expect(result).toBeCloseTo(0.58, 1); // Same as difficulty 5
    });

    it('should weight recent accuracy 60% and historical 40%', () => {
      const recent = [
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(false),
      ]; // 75% recent

      const all = [
        ...recent,
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
      ]; // 37.5% historical

      const result = masteryService.calculateMastery(recent, toStats(all), 2);

      // Accuracy = 0.75 * 0.6 + 0.375 * 0.4 = 0.45 + 0.15 = 0.6
      // Volume = sqrt(3) / sqrt(15) = 0.447
      // Difficulty = 0.4
      // Raw = 0.6 * 0.447 * 0.4 = ~0.107
      expect(result).toBeCloseTo(0.11, 1);
    });
  });

  describe('masteryToLevel', () => {
    it('should return novice for score < 0.3', () => {
      expect(masteryService.masteryToLevel(0)).toBe('novice');
      expect(masteryService.masteryToLevel(0.1)).toBe('novice');
      expect(masteryService.masteryToLevel(0.29)).toBe('novice');
    });

    it('should return intermediate for score 0.3 - 0.6', () => {
      expect(masteryService.masteryToLevel(0.3)).toBe('intermediate');
      expect(masteryService.masteryToLevel(0.45)).toBe('intermediate');
      expect(masteryService.masteryToLevel(0.59)).toBe('intermediate');
    });

    it('should return competent for score 0.6 - 0.8', () => {
      expect(masteryService.masteryToLevel(0.6)).toBe('competent');
      expect(masteryService.masteryToLevel(0.7)).toBe('competent');
      expect(masteryService.masteryToLevel(0.79)).toBe('competent');
    });

    it('should return expert for score >= 0.8', () => {
      expect(masteryService.masteryToLevel(0.8)).toBe('expert');
      expect(masteryService.masteryToLevel(0.9)).toBe('expert');
      expect(masteryService.masteryToLevel(1.0)).toBe('expert');
    });

    it('should handle edge cases at boundaries', () => {
      // Test exact boundaries
      expect(masteryService.masteryToLevel(0.2999)).toBe('novice');
      expect(masteryService.masteryToLevel(0.3001)).toBe('intermediate');
      expect(masteryService.masteryToLevel(0.5999)).toBe('intermediate');
      expect(masteryService.masteryToLevel(0.6001)).toBe('competent');
      expect(masteryService.masteryToLevel(0.7999)).toBe('competent');
      expect(masteryService.masteryToLevel(0.8001)).toBe('expert');
    });

    it('should clamp negative scores to novice', () => {
      expect(masteryService.masteryToLevel(-0.1)).toBe('novice');
      expect(masteryService.masteryToLevel(-1)).toBe('novice');
    });

    it('should clamp scores above 1 to expert', () => {
      expect(masteryService.masteryToLevel(1.1)).toBe('expert');
      expect(masteryService.masteryToLevel(2)).toBe('expert');
    });
  });

  describe('getNextNode', () => {
    const mockPlanWithNodes = {
      plan: {
        plan_id: 'plan-123',
        user_id: 'user-123',
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        plan_size: 'moderate',
        metadata: {},
        created_at: new Date(),
      },
      nodes: [
        {
          plan_id: 'plan-123',
          node_id: 'basics',
          title: 'JavaScript Basics',
          objectives: ['Learn syntax'],
          prerequisites: [],
          estimated_minutes: 30,
          tags: null,
          order_index: 1,
        },
        {
          plan_id: 'plan-123',
          node_id: 'variables',
          title: 'Variables',
          objectives: ['let, const, var'],
          prerequisites: ['basics'],
          estimated_minutes: 45,
          tags: null,
          order_index: 2,
        },
        {
          plan_id: 'plan-123',
          node_id: 'functions',
          title: 'Functions',
          objectives: ['Define and call functions'],
          prerequisites: ['basics', 'variables'],
          estimated_minutes: 60,
          tags: null,
          order_index: 3,
        },
      ],
    };

    it('should recommend first incomplete node in linear chain', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([['basics', { total: 1, correct: 1 }]]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBe('variables');
      expect(result.all_prerequisites_met).toBe(true);
      expect(result.current_progress.nodes_completed).toBe(1);
      expect(result.current_progress.total_nodes).toBe(3);
    });

    it('should recommend first incomplete node when all unmastered', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map());

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBe('basics');
      expect(result.all_prerequisites_met).toBe(true);
      expect(result.current_progress.completion_percentage).toBe(0);
    });

    it('should return null when all nodes are mastered', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.85, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'functions', mastery_score: 0.95, last_updated: new Date(), has_exam_attempt: false },
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['basics', { total: 1, correct: 1 }],
        ['variables', { total: 1, correct: 1 }],
        ['functions', { total: 1, correct: 1 }],
      ]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBeNull();
      expect(result.current_progress.completion_percentage).toBe(100);
      expect(result.rationale).toContain('mastered all nodes');
    });

    it('should recommend partial progress node when available', async () => {
      // User has partial progress on variables (prereq met, but not mastered)
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.3, last_updated: new Date(), has_exam_attempt: false }, // Partial progress
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['basics', { total: 1, correct: 1 }],
        ['variables', { total: 1, correct: 1 }],
      ]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBe('variables');
      expect(result.all_prerequisites_met).toBe(true); // variables' prereq (basics) is mastered
      expect(result.rationale).toContain('making progress');
    });

    it('should recommend prerequisite when prerequisites are not met', async () => {
      // User mastered basics but variables is below prereq threshold for functions
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.5, last_updated: new Date(), has_exam_attempt: false }, // Below 0.6 prereq threshold
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'functions', mastery_score: 0.7, last_updated: new Date(), has_exam_attempt: false }, // Wants to do functions
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['basics', { total: 1, correct: 1 }],
        ['variables', { total: 1, correct: 1 }],
        ['functions', { total: 1, correct: 1 }],
      ]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      // Should recommend improving variables since it's blocking functions
      expect(result.recommended_node_id).toBe('variables');
      expect(result.all_prerequisites_met).toBe(true); // For variables itself, its prereqs are met
      expect(result.rationale).toContain('making progress');
    });

    it('should prioritize nodes with partial progress', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.5, last_updated: new Date(), has_exam_attempt: false }, // Partial progress
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['basics', { total: 1, correct: 1 }],
        ['variables', { total: 1, correct: 1 }],
      ]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      // Should recommend variables (partial progress) over functions (not started)
      expect(result.recommended_node_id).toBe('variables');
      expect(result.rationale).toContain('making progress');
    });

    it('should return null for plan with no nodes', async () => {
      mockGetPlanWithNodes.mockResolvedValue({
        ...mockPlanWithNodes,
        nodes: [],
      });

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBeNull();
      expect(result.current_progress.total_nodes).toBe(0);
      expect(result.rationale).toContain('no nodes');
    });

    it('should handle diamond prerequisite pattern correctly', async () => {
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['js-basics', { total: 1, correct: 1 }],
        ['jsx', { total: 1, correct: 1 }],
      ]));

      const diamondPlan = {
        plan: {
          plan_id: 'plan-456',
          user_id: 'user-123',
          topic: 'React',
          user_level: 'intermediate',
          plan_size: 'moderate',
          metadata: {},
          created_at: new Date(),
        },
        nodes: [
          {
            plan_id: 'plan-456',
            node_id: 'js-basics',
            title: 'JS Basics',
            objectives: ['Learn JS'],
            prerequisites: [],
            estimated_minutes: 30,
            tags: null,
            order_index: 1,
          },
          {
            plan_id: 'plan-456',
            node_id: 'jsx',
            title: 'JSX',
            objectives: ['Learn JSX'],
            prerequisites: ['js-basics'],
            estimated_minutes: 30,
            tags: null,
            order_index: 2,
          },
          {
            plan_id: 'plan-456',
            node_id: 'components',
            title: 'Components',
            objectives: ['Build components'],
            prerequisites: ['jsx'],
            estimated_minutes: 45,
            tags: null,
            order_index: 3,
          },
          {
            plan_id: 'plan-456',
            node_id: 'props',
            title: 'Props',
            objectives: ['Pass data'],
            prerequisites: ['jsx'],
            estimated_minutes: 30,
            tags: null,
            order_index: 4,
          },
          {
            plan_id: 'plan-456',
            node_id: 'state',
            title: 'State',
            objectives: ['Manage state'],
            prerequisites: ['components', 'props'],
            estimated_minutes: 45,
            tags: null,
            order_index: 5,
          },
        ],
      };

      mockGetPlanWithNodes.mockResolvedValue(diamondPlan);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-456', node_id: 'js-basics', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-456', node_id: 'jsx', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
      ]);

      const result = await masteryService.getNextNode('user-123', 'plan-456');

      // Should recommend components (earlier in order than props)
      expect(result.recommended_node_id).toBe('components');
    });

    it('should calculate completion percentage correctly', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.85, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'functions', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['basics', { total: 1, correct: 1 }],
        ['functions', { total: 1, correct: 1 }],
      ]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.current_progress.nodes_completed).toBe(2);
      expect(result.current_progress.total_nodes).toBe(3);
      expect(result.current_progress.completion_percentage).toBe(67); // 2/3 = 66.6... rounded to 67
    });

    it('should throw error for non-existent plan', async () => {
      mockGetPlanWithNodes.mockResolvedValue(null);

      await expect(masteryService.getNextNode('user-123', 'non-existent-plan')).rejects.toThrow('Plan not found');
    });

    it('should handle mastery at exactly threshold boundary', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.8, last_updated: new Date(), has_exam_attempt: false }, // Exactly at threshold
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['basics', { total: 1, correct: 1 }],
      ]));

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.current_progress.nodes_completed).toBe(1);
      expect(result.recommended_node_id).toBe('variables');
    });
  });

  describe('getNodeMastery', () => {
    it('should return novice with 0 score for no mastery', async () => {
      mockedGetMastery.mockResolvedValue(null);
      mockedGetAttemptStats.mockResolvedValue({ total: 0, correct: 0 });

      const result = await masteryService.getNodeMastery('user-123', 'plan-123', 'node-123');

      expect(result.score).toBe(0);
      expect(result.level).toBe('novice');
      expect(result.total_attempts).toBe(0);
      expect(result.last_updated).toBeNull();
    });

    it('should return correct mastery for existing mastery record', async () => {
      const lastUpdated = new Date();
      mockedGetMastery.mockResolvedValue({
        user_id: 'user-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        mastery_score: 0.75,
        last_updated: lastUpdated,
        has_exam_attempt: false,
      });
      mockedGetAttemptStats.mockResolvedValue({ total: 2, correct: 1 });

      const result = await masteryService.getNodeMastery('user-123', 'plan-123', 'node-123');

      expect(result.score).toBe(0.75);
      expect(result.level).toBe('competent'); // 0.75 is in competent range
      expect(result.total_attempts).toBe(2);
      expect(result.last_updated).toBe(lastUpdated);
    });
  });

  describe('getPlanMastery', () => {
    it('should return empty object for no mastery records', async () => {
      mockedGetMasteryForPlan.mockResolvedValue([]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map());

      const result = await masteryService.getPlanMastery('user-123', 'plan-123');

      expect(result).toEqual({});
    });

    it('should return mastery for all nodes in plan', async () => {
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'node-1', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'node-2', mastery_score: 0.5, last_updated: new Date(), has_exam_attempt: false },
      ]);
      mockedGetAttemptStatsForPlan.mockResolvedValue(new Map([
        ['node-1', { total: 1, correct: 1 }],
        ['node-2', { total: 2, correct: 1 }],
      ]));

      const result = await masteryService.getPlanMastery('user-123', 'plan-123');

      expect(result['node-1'].score).toBe(0.9);
      expect(result['node-1'].level).toBe('expert');
      expect(result['node-1'].total_attempts).toBe(1);

      expect(result['node-2'].score).toBe(0.5);
      expect(result['node-2'].level).toBe('intermediate');
      expect(result['node-2'].total_attempts).toBe(2);
    });
  });

  describe('submitAttempt integration', () => {
    const mockExercise = {
      exercise_id: 'exercise-123',
      plan_id: 'plan-123',
      node_id: 'node-123',
      type: 'mcq',
      prompt: 'What is 2+2?',
      rubric: 'Basic math',
      correct_answer: '4',
    };

    const mockGrade = {
      schema_version: 'grade.v1',
      plan_id: 'plan-123',
      node_id: 'node-123',
      exercise_id: 'exercise-123',
      score: 1.0,
      is_correct: true,
      feedback: 'Correct!',
      misconceptions: null,
      metadata: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        prompt_version: '1.0',
        created_at: new Date().toISOString(),
        request_id: 'test-request',
        raw_output_hash: 'abc',
        artifact_hash: 'def',
        validation_retry_count: 0,
      },
    };

    it('should submit attempt and return grade with updated mastery', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        user_answer: '4',
      };

      mockGetExerciseById.mockResolvedValue(mockExercise as any);
      mockGetPlanWithNodes.mockResolvedValue({
        plan: { plan_id: 'plan-123', user_id: 'user-123', topic: 'Test', user_level: 'intermediate', plan_size: 'moderate', metadata: {}, created_at: new Date() },
        nodes: [],
      });
      mockedCurriculumClient.gradeAnswer.mockResolvedValue(mockGrade);
      mockedInsertAttempt.mockResolvedValue({ attempt_id: 'attempt-123' });
      mockedGetRecentAttempts.mockResolvedValue([createMockAttempt(true)]);
      mockedGetAttemptStats.mockResolvedValue({ total: 1, correct: 1 });
      mockedGetMaxCompletedDifficulty.mockResolvedValue(1);
      mockedUpsertMasteryIfHigher.mockResolvedValue(true);

      const result = await masteryService.submitAttempt('user-123', input, 'request-123');

      expect(result.attempt_id).toBe('attempt-123');
      expect(result.grade).toEqual(mockGrade);
      expect(result.mastery.score).toBeGreaterThan(0);
      expect(result.mastery.level).toBeDefined();
    });

    it('should throw error for non-existent exercise', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'non-existent',
        user_answer: '4',
      };

      mockGetExerciseById.mockResolvedValue(null);

      await expect(masteryService.submitAttempt('user-123', input, 'request-123')).rejects.toThrow('Exercise non-existent not found');
    });

    it('should throw error when exercise plan/node does not match input', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'wrong-plan',
        node_id: 'wrong-node',
        exercise_id: 'exercise-123',
        user_answer: '4',
      };

      mockGetExerciseById.mockResolvedValue(mockExercise as any);

      await expect(masteryService.submitAttempt('user-123', input, 'request-123')).rejects.toThrow('does not belong to the specified plan/node');
    });
  });

  describe('MasteryServiceError', () => {
    it('should create error with all properties', async () => {
      mockGetPlanWithNodes.mockResolvedValue(null);

      try {
        await masteryService.getNextNode('user-123', 'non-existent-plan');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty('statusCode', 404);
        expect(error).toHaveProperty('code', 'PLAN_NOT_FOUND');
        expect(error).toHaveProperty('details');
      }
    });
  });

  describe('Exercise Mastery Cap', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should cap exercise mastery at EXERCISE_MASTERY_CAP (0.35)', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        user_answer: 'correct-answer',
      };

      const mockExercise = {
        exercise_id: 'exercise-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        type: 'mcq',
        prompt: 'Test question',
        rubric: 'Test rubric',
        correct_answer: 'correct-answer',
      };

      const mockGrade = {
        schema_version: 'grade.v1',
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        score: 1.0,
        is_correct: true,
        feedback: 'Correct!',
        misconceptions: null,
        metadata: {
          provider: 'test',
          model: 'test-model',
          prompt_version: '1.0',
          created_at: new Date().toISOString(),
          request_id: 'test-request',
          raw_output_hash: 'abc',
          artifact_hash: 'def',
          validation_retry_count: 0,
        },
      };

      // Create many correct attempts that would yield > 0.35 without cap
      const perfectAttempts = Array(10).fill(null).map(() => createMockAttempt(true));

      mockGetExerciseById.mockResolvedValue(mockExercise as any);
      mockGetPlanWithNodes.mockResolvedValue({
        plan: { plan_id: 'plan-123', user_id: 'user-123', topic: 'Test', user_level: 'intermediate', plan_size: 'moderate', metadata: {}, created_at: new Date() },
        nodes: [],
      });
      mockedCurriculumClient.gradeAnswer.mockResolvedValue(mockGrade);
      mockedInsertAttempt.mockResolvedValue({ attempt_id: 'attempt-123' });
      mockedGetRecentAttempts.mockResolvedValue(perfectAttempts);
      mockedGetAttemptStats.mockResolvedValue({ total: 10, correct: 10 });
      mockedGetMaxCompletedDifficulty.mockResolvedValue(5);
      mockedGetMastery.mockResolvedValue(null);
      mockedUpsertMasteryIfHigher.mockResolvedValue(true);

      const result = await masteryService.submitAttempt('user-123', input, 'request-123');

      // Mastery should be capped at EXERCISE_MASTERY_CAP
      expect(result.mastery.score).toBeLessThanOrEqual(EXERCISE_MASTERY_CAP);
      expect(mockedUpsertMasteryIfHigher).toHaveBeenCalledWith(
        'user-123',
        'plan-123',
        'node-123',
        EXERCISE_MASTERY_CAP,
        undefined
      );
    });

    it('should not lower exam-set mastery with exercise submission', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        user_answer: 'correct-answer',
      };

      const mockExercise = {
        exercise_id: 'exercise-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        type: 'mcq',
        prompt: 'Test question',
        rubric: 'Test rubric',
        correct_answer: 'correct-answer',
      };

      const mockGrade = {
        schema_version: 'grade.v1',
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        score: 1.0,
        is_correct: true,
        feedback: 'Correct!',
        misconceptions: null,
        metadata: {
          provider: 'test',
          model: 'test-model',
          prompt_version: '1.0',
          created_at: new Date().toISOString(),
          request_id: 'test-request',
          raw_output_hash: 'abc',
          artifact_hash: 'def',
          validation_retry_count: 0,
        },
      };

      // Current mastery from exam is 0.7 (higher than cap)
      mockedGetMastery.mockResolvedValue({
        user_id: 'user-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        mastery_score: 0.7,
        last_updated: new Date(),
        has_exam_attempt: true,
      });

      const perfectAttempts = Array(10).fill(null).map(() => createMockAttempt(true));

      mockGetExerciseById.mockResolvedValue(mockExercise as any);
      mockGetPlanWithNodes.mockResolvedValue({
        plan: { plan_id: 'plan-123', user_id: 'user-123', topic: 'Test', user_level: 'intermediate', plan_size: 'moderate', metadata: {}, created_at: new Date() },
        nodes: [],
      });
      mockedCurriculumClient.gradeAnswer.mockResolvedValue(mockGrade);
      mockedInsertAttempt.mockResolvedValue({ attempt_id: 'attempt-123' });
      mockedGetRecentAttempts.mockResolvedValue(perfectAttempts);
      mockedGetAttemptStats.mockResolvedValue({ total: 10, correct: 10 });
      mockedGetMaxCompletedDifficulty.mockResolvedValue(5);
      // upsertMasteryIfHigher returns false since current mastery is higher
      mockedUpsertMasteryIfHigher.mockResolvedValue(false);

      const result = await masteryService.submitAttempt('user-123', input, 'request-123');

      // Should keep the higher exam-based mastery (0.7), not lower to cap (0.35)
      expect(result.mastery.score).toBe(0.7);
      // upsertMasteryIfHigher should be called but return false (no update)
      expect(mockedUpsertMasteryIfHigher).toHaveBeenCalledWith(
        'user-123',
        'plan-123',
        'node-123',
        EXERCISE_MASTERY_CAP,
        undefined
      );
    });

    it('should handle edge case: mastery exactly at cap', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        user_answer: 'correct-answer',
      };

      const mockExercise = {
        exercise_id: 'exercise-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        type: 'mcq',
        prompt: 'Test question',
        rubric: 'Test rubric',
        correct_answer: 'correct-answer',
      };

      const mockGrade = {
        schema_version: 'grade.v1',
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        score: 1.0,
        is_correct: true,
        feedback: 'Correct!',
        misconceptions: null,
        metadata: {
          provider: 'test',
          model: 'test-model',
          prompt_version: '1.0',
          created_at: new Date().toISOString(),
          request_id: 'test-request',
          raw_output_hash: 'abc',
          artifact_hash: 'def',
          validation_retry_count: 0,
        },
      };

      // Current mastery is exactly at cap
      mockedGetMastery.mockResolvedValue({
        user_id: 'user-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        mastery_score: EXERCISE_MASTERY_CAP,
        last_updated: new Date(),
        has_exam_attempt: false,
      });

      mockGetExerciseById.mockResolvedValue(mockExercise as any);
      mockGetPlanWithNodes.mockResolvedValue({
        plan: { plan_id: 'plan-123', user_id: 'user-123', topic: 'Test', user_level: 'intermediate', plan_size: 'moderate', metadata: {}, created_at: new Date() },
        nodes: [],
      });
      mockedCurriculumClient.gradeAnswer.mockResolvedValue(mockGrade);
      mockedInsertAttempt.mockResolvedValue({ attempt_id: 'attempt-123' });
      mockedGetRecentAttempts.mockResolvedValue([]);
      mockedGetAttemptStats.mockResolvedValue({ total: 0, correct: 0 });
      mockedGetMaxCompletedDifficulty.mockResolvedValue(0);
      // No update since raw score (0) < current mastery (cap)
      mockedUpsertMasteryIfHigher.mockResolvedValue(false);

      const result = await masteryService.submitAttempt('user-123', input, 'request-123');

      // Should keep mastery at cap (not lower)
      expect(result.mastery.score).toBe(EXERCISE_MASTERY_CAP);
    });

    it('should write exercise mastery normally when raw score is below cap', async () => {
      const input: SubmitAttemptInput = {
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        user_answer: 'partial-answer',
      };

      const mockExercise = {
        exercise_id: 'exercise-123',
        plan_id: 'plan-123',
        node_id: 'node-123',
        type: 'mcq',
        prompt: 'Test question',
        rubric: 'Test rubric',
        correct_answer: 'correct-answer',
        difficulty: 0.1,
      };

      const mockGrade = {
        schema_version: 'grade.v1',
        plan_id: 'plan-123',
        node_id: 'node-123',
        exercise_id: 'exercise-123',
        score: 0.6,
        is_correct: false,
        feedback: 'Partially correct',
        misconceptions: null,
        metadata: {
          provider: 'test',
          model: 'test-model',
          prompt_version: '1.0',
          created_at: new Date().toISOString(),
          request_id: 'test-request',
          raw_output_hash: 'abc',
          artifact_hash: 'def',
          validation_retry_count: 0,
        },
      };

      // 30% accuracy (3/10 correct), low difficulty exercise
      const partialAttempts = [
        createMockAttempt(true),
        createMockAttempt(false),
        createMockAttempt(true),
        createMockAttempt(false),
        createMockAttempt(true),
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
      ];

      mockedGetMastery.mockResolvedValue(null); // No prior mastery
      mockGetExerciseById.mockResolvedValue(mockExercise as any);
      mockGetPlanWithNodes.mockResolvedValue({
        plan: { plan_id: 'plan-123', user_id: 'user-123', topic: 'Test', user_level: 'intermediate', plan_size: 'moderate', metadata: {}, created_at: new Date() },
        nodes: [],
      });
      mockedCurriculumClient.gradeAnswer.mockResolvedValue(mockGrade);
      mockedInsertAttempt.mockResolvedValue({ attempt_id: 'attempt-123' });
      mockedGetRecentAttempts.mockResolvedValue(partialAttempts);
      mockedGetAttemptStats.mockResolvedValue({ total: 10, correct: 3 });
      mockedGetMaxCompletedDifficulty.mockResolvedValue(0.1);
      mockedUpsertMasteryIfHigher.mockResolvedValue(true);

      const result = await masteryService.submitAttempt('user-123', input, 'request-123');

      // Expected new formula: accuracy * volume * difficulty
      // recent_accuracy = 3/10 = 0.3, historical_accuracy = 3/10 = 0.3
      // accuracy = 0.3 * 0.6 + 0.3 * 0.4 = 0.3
      // volume = sqrt(3) / sqrt(15) = 0.447
      // difficulty = 0.1 / 5 = 0.02
      // score = 0.3 * 0.447 * 0.02 = 0.0027
      // Raw score 0.0027 is below cap 0.35, so should write the uncapped value
      expect(mockedUpsertMasteryIfHigher).toHaveBeenCalledWith(
        'user-123',
        'plan-123',
        'node-123',
        expect.closeTo(0.003, 3),
        undefined
      );
      expect(result.mastery.score).toBeCloseTo(0.003, 3);
    });
  });

  describe('triggerMasteryUnlockPreload', () => {
    // Import the function after mocks are set up
    const { triggerMasteryUnlockPreload } = require('../../../src/services/mastery.service');

    beforeEach(() => {
      jest.clearAllMocks();
      // Set up default mock behavior
      mockNodeRowsToLearningNodes.mockImplementation((nodes: any) => nodes);
      mockGetDepth1NeighborIds.mockReturnValue(['node1_depth1', 'node2_depth1']);
    });

    it('returns early when plan not found', async () => {
      mockGetPlanWithNodes.mockResolvedValue(null);
      await triggerMasteryUnlockPreload('user1', 'plan1');
      expect(mockPreloadNodeResources).not.toHaveBeenCalled();
    });

    it('calls preloadNodeResources with unlocked + depth-1 nodes', async () => {
      const mockPlan = {
        nodes: [
          { node_id: 'node1', prerequisites: [] },
          { node_id: 'node2', prerequisites: ['node1'] },
        ],
      };
      mockGetPlanWithNodes.mockResolvedValue(mockPlan);
      mockedGetMasteryForPlan.mockResolvedValue([{ user_id: 'user1', plan_id: 'plan1', node_id: 'node1', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false }]);
      mockGetNodeResourceStatusBatch.mockResolvedValue([]);

      await triggerMasteryUnlockPreload('user1', 'plan1');

      expect(mockPreloadNodeResources).toHaveBeenCalledWith(
        'plan1',
        expect.arrayContaining(['node1']),
        expect.any(Array)
      );
    });

    it('filters out nodes with existing resources and reading material', async () => {
      const mockPlan = {
        nodes: [{ node_id: 'node1', prerequisites: [] }],
      };
      mockGetPlanWithNodes.mockResolvedValue(mockPlan);
      mockedGetMasteryForPlan.mockResolvedValue([{ user_id: 'user1', plan_id: 'plan1', node_id: 'node1', mastery_score: 0.9, last_updated: new Date(), has_exam_attempt: false }]);
      // Mock empty depth-1 neighbors (no neighbors to preload)
      mockGetDepth1NeighborIds.mockReturnValue([]);
      mockGetNodeResourceStatusBatch.mockResolvedValue([
        { node_id: 'node1', has_resources: true, has_reading: true },
      ]);

      await triggerMasteryUnlockPreload('user1', 'plan1');

      expect(mockPreloadNodeResources).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockGetPlanWithNodes.mockRejectedValue(new Error('DB error'));
      await expect(triggerMasteryUnlockPreload('user1', 'plan1')).resolves.not.toThrow();
    });
  });
});
