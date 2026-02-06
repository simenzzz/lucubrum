/**
 * Mastery service tests
 * Tests for services/mastery.service.ts: calculateMastery, masteryToLevel, getNextNode functions
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock setup BEFORE imports
const mockGetExerciseById = jest.fn() as jest.MockedFunction<(exerciseId: string) => Promise<any>>;
const mockGetPlanWithNodes = jest.fn() as jest.MockedFunction<(planId: string) => Promise<any>>;
const mockGetAllAttemptsForNode2 = jest.fn() as jest.MockedFunction<(userId: string, planId: string, nodeId: string) => Promise<any>>;

jest.mock('../../../src/db/queries/exercises', () => ({
  getExerciseById: mockGetExerciseById,
  __esModule: true,
}));

jest.mock('../../../src/db/queries/plans', () => ({
  getPlanWithNodes: mockGetPlanWithNodes,
  __esModule: true,
}));

jest.mock('../../../src/db/queries/mastery', () => ({
  insertAttempt: jest.fn(),
  getRecentAttempts: jest.fn(),
  getAllAttemptsForNode: mockGetAllAttemptsForNode2,
  upsertMastery: jest.fn(),
  getMastery: jest.fn(),
  getMasteryForPlan: jest.fn(),
  getMaxCompletedDifficulty: jest.fn(),
  __esModule: true,
}));

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/curriculum-client', () => ({
  __esModule: true,
  curriculumClient: {
    gradeAnswer: jest.fn(),
    generatePlan: jest.fn(),
    generateExercises: jest.fn(),
    fetchTranscript: jest.fn(),
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
  TranscriptNotAvailableError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'TranscriptNotAvailableError';
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
  getMastery,
  getMasteryForPlan,
  getMaxCompletedDifficulty,
  upsertMastery,
} from '../../../src/db/queries/mastery';

// Type assertions for mocked functions
const mockedCurriculumClient = curriculumClient as jest.Mocked<typeof curriculumClient>;
const mockedInsertAttempt = insertAttempt as jest.MockedFunction<typeof insertAttempt>;
const mockedGetRecentAttempts = getRecentAttempts as jest.MockedFunction<typeof getRecentAttempts>;
const mockedUpsertMastery = upsertMastery as jest.MockedFunction<typeof upsertMastery>;
const mockedGetMastery = getMastery as jest.MockedFunction<typeof getMastery>;
const mockedGetMasteryForPlan = getMasteryForPlan as jest.MockedFunction<typeof getMasteryForPlan>;
const mockedGetMaxCompletedDifficulty = getMaxCompletedDifficulty as jest.MockedFunction<typeof getMaxCompletedDifficulty>;

describe('MasteryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      const result = masteryService.calculateMastery([], [], 0);

      expect(result).toBe(0);
    });

    it('should weight recent attempts 60%', () => {
      // All recent attempts correct = 0.6
      const recentAttempts = [
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(true),
      ];

      const result = masteryService.calculateMastery(recentAttempts, [], 0);

      // 1.0 * 0.6 + 0 * 0.3 + 0 * 0.1 = 0.6
      expect(result).toBeCloseTo(0.6, 1);
    });

    it('should weight historical accuracy 30%', () => {
      // All attempts correct = 0.3 for historical
      const allAttempts = [
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(true),
      ];

      const result = masteryService.calculateMastery([], allAttempts, 0);

      // 0 * 0.6 + 1.0 * 0.3 + 0 * 0.1 = 0.3
      expect(result).toBeCloseTo(0.3, 1);
    });

    it('should weight max difficulty 10%', () => {
      // Max difficulty 5 = 1.0 bonus
      const result = masteryService.calculateMastery([], [], 5);

      // 0 * 0.6 + 0 * 0.3 + 1.0 * 0.1 = 0.1
      expect(result).toBeCloseTo(0.1, 1);
    });

    it('should calculate combined score correctly', () => {
      const recentAttempts = [
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(false), // 66% recent
      ];

      const allAttempts = [
        ...recentAttempts,
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(true),
        createMockAttempt(true), // 50% overall
      ];

      const result = masteryService.calculateMastery(allAttempts.slice(0, 3), allAttempts, 3);

      // 0.667 * 0.6 + 0.5 * 0.3 + 0.6 * 0.1 = 0.4002 + 0.15 + 0.06 = 0.6102
      expect(result).toBeGreaterThan(0.55);
      expect(result).toBeLessThan(0.65);
    });

    it('should clamp score to 0-1 range', () => {
      // All correct with max difficulty should give > 1, but should be clamped
      const perfectAttempts = Array(10).fill(null).map(() => createMockAttempt(true));

      const result = masteryService.calculateMastery(perfectAttempts, perfectAttempts, 5);

      // Should not exceed 1.0
      expect(result).toBeLessThanOrEqual(1.0);
      // Should be very close to 1.0
      expect(result).toBeGreaterThan(0.95);
    });

    it('should handle partial difficulty bonus correctly', () => {
      const result = masteryService.calculateMastery([], [], 2);

      // Difficulty bonus: 2/5 = 0.4, times 0.1 = 0.04
      expect(result).toBeCloseTo(0.04, 2);
    });

    it('should handle max difficulty of 0', () => {
      const result = masteryService.calculateMastery([], [], 0);

      expect(result).toBe(0);
    });

    it('should handle negative max difficulty gracefully', () => {
      // Should treat as 0
      const result = masteryService.calculateMastery([], [], -1);

      expect(result).toBe(0);
    });

    it('should handle difficulty greater than 5', () => {
      const result = masteryService.calculateMastery([], [], 10);

      // Should cap at 5 (1.0 bonus)
      expect(result).toBeCloseTo(0.1, 1);
    });

    it('should calculate correct mastery for all wrong answers', () => {
      const wrongAttempts = [
        createMockAttempt(false),
        createMockAttempt(false),
        createMockAttempt(false),
      ];

      const result = masteryService.calculateMastery(wrongAttempts, wrongAttempts, 5);

      // 0 * 0.6 + 0 * 0.3 + 1.0 * 0.1 = 0.1 (only difficulty bonus)
      expect(result).toBeCloseTo(0.1, 1);
    });

    it('should calculate correct mastery for all correct answers', () => {
      const correctAttempts = [
        createMockAttempt(true),
        createMockAttempt(true),
        createMockAttempt(true),
      ];

      const result = masteryService.calculateMastery(correctAttempts, correctAttempts, 5);

      // 1.0 * 0.6 + 1.0 * 0.3 + 1.0 * 0.1 = 1.0
      expect(result).toBeCloseTo(1.0, 1);
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
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date() },
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBe('variables');
      expect(result.all_prerequisites_met).toBe(true);
      expect(result.current_progress.nodes_completed).toBe(1);
      expect(result.current_progress.total_nodes).toBe(3);
    });

    it('should recommend first incomplete node when all unmastered', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBe('basics');
      expect(result.all_prerequisites_met).toBe(true);
      expect(result.current_progress.completion_percentage).toBe(0);
    });

    it('should return null when all nodes are mastered', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.85, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'functions', mastery_score: 0.95, last_updated: new Date() },
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBeNull();
      expect(result.current_progress.completion_percentage).toBe(100);
      expect(result.rationale).toContain('mastered all nodes');
    });

    it('should recommend partial progress node when available', async () => {
      // User has partial progress on variables (prereq met, but not mastered)
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.3, last_updated: new Date() }, // Partial progress
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBe('variables');
      expect(result.all_prerequisites_met).toBe(true); // variables' prereq (basics) is mastered
      expect(result.rationale).toContain('making progress');
    });

    it('should recommend prerequisite when prerequisites are not met', async () => {
      // User mastered basics but variables is below prereq threshold for functions
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.5, last_updated: new Date() }, // Below 0.6 prereq threshold
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'functions', mastery_score: 0.7, last_updated: new Date() }, // Wants to do functions
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      // Should recommend improving variables since it's blocking functions
      expect(result.recommended_node_id).toBe('variables');
      expect(result.all_prerequisites_met).toBe(true); // For variables itself, its prereqs are met
      expect(result.rationale).toContain('making progress');
    });

    it('should prioritize nodes with partial progress', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.9, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'variables', mastery_score: 0.5, last_updated: new Date() }, // Partial progress
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

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
      mockedGetMasteryForPlan.mockResolvedValue([]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.recommended_node_id).toBeNull();
      expect(result.current_progress.total_nodes).toBe(0);
      expect(result.rationale).toContain('no nodes');
    });

    it('should handle diamond prerequisite pattern correctly', async () => {
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

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
        { user_id: 'user-123', plan_id: 'plan-456', node_id: 'js-basics', mastery_score: 0.9, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-456', node_id: 'jsx', mastery_score: 0.9, last_updated: new Date() },
      ]);

      const result = await masteryService.getNextNode('user-123', 'plan-456');

      // Should recommend components (earlier in order than props)
      expect(result.recommended_node_id).toBe('components');
    });

    it('should calculate completion percentage correctly', async () => {
      mockGetPlanWithNodes.mockResolvedValue(mockPlanWithNodes);
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.85, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'functions', mastery_score: 0.9, last_updated: new Date() },
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

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
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'basics', mastery_score: 0.8, last_updated: new Date() }, // Exactly at threshold
      ]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);

      const result = await masteryService.getNextNode('user-123', 'plan-123');

      expect(result.current_progress.nodes_completed).toBe(1);
      expect(result.recommended_node_id).toBe('variables');
    });
  });

  describe('getNodeMastery', () => {
    it('should return novice with 0 score for no mastery', async () => {
      mockedGetMastery.mockResolvedValue(null);
      mockGetAllAttemptsForNode2.mockResolvedValue([]);

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
      });
      mockGetAllAttemptsForNode2.mockResolvedValue([
        createMockAttempt(true),
        createMockAttempt(false),
      ]);

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
      mockGetAllAttemptsForNode2.mockResolvedValue([]);

      const result = await masteryService.getPlanMastery('user-123', 'plan-123');

      expect(result).toEqual({});
    });

    it('should return mastery for all nodes in plan', async () => {
      mockedGetMasteryForPlan.mockResolvedValue([
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'node-1', mastery_score: 0.9, last_updated: new Date() },
        { user_id: 'user-123', plan_id: 'plan-123', node_id: 'node-2', mastery_score: 0.5, last_updated: new Date() },
      ]);
      mockGetAllAttemptsForNode2.mockImplementation((userId, planId, nodeId) => {
        if (nodeId === 'node-1') return Promise.resolve([createMockAttempt(true)]);
        if (nodeId === 'node-2') return Promise.resolve([createMockAttempt(true), createMockAttempt(false)]);
        return Promise.resolve([]);
      });

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
      mockedCurriculumClient.gradeAnswer.mockResolvedValue(mockGrade);
      mockedInsertAttempt.mockResolvedValue({ attempt_id: 'attempt-123' });
      mockedGetRecentAttempts.mockResolvedValue([createMockAttempt(true)]);
      mockGetAllAttemptsForNode2.mockResolvedValue([createMockAttempt(true)]);
      mockedGetMaxCompletedDifficulty.mockResolvedValue(1);
      mockedUpsertMastery.mockResolvedValue(undefined);

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
});
