import { randomUUID } from 'crypto';

// Local type definitions for test exercises
export type ExerciseTypeString = 'mcq' | 'short_answer' | 'fill_blank' | 'coding' | 'flashcard';
export type ExerciseType = ExerciseTypeString;

// Base exercise interface
export interface BaseExercise {
  exercise_id: string;
  plan_id: string;
  node_id: string;
  type: ExerciseType;
  question: string;
  created_at: string;
}

// Discriminated union for different exercise types
export interface MCQExercise extends BaseExercise {
  type: 'mcq';
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: number;
}

export interface ShortAnswerExercise extends BaseExercise {
  type: 'short_answer';
  answer: string;
  explanation: string;
  difficulty: number;
}

export interface FillBlankExercise extends BaseExercise {
  type: 'fill_blank';
  blanks: string[];
  explanation: string;
  difficulty: number;
}

export interface CodingExercise extends BaseExercise {
  type: 'coding';
  template: string;
  solution: string;
  test_cases: Array<{ input: unknown[]; expected: unknown }>;
  explanation: string;
  difficulty: number;
  language: string;
}

export interface FlashcardExercise extends BaseExercise {
  type: 'flashcard';
  front: string;
  back: string;
  explanation: string;
  difficulty: number;
}

export type Exercise = MCQExercise | ShortAnswerExercise | FillBlankExercise | CodingExercise | FlashcardExercise;

export const createTestExercise = (
  planId: string,
  nodeId: string,
  overrides: Partial<Exercise> & { type?: ExerciseTypeString } = {}
): Exercise => {
  const type = overrides.type || 'mcq';

  const base: Exercise = {
    exercise_id: randomUUID(),
    plan_id: planId,
    node_id: nodeId,
    type: type as ExerciseType,
    question: 'Test question?',
    created_at: new Date().toISOString(),
  } as Exercise;

  switch (type) {
    case 'mcq':
      return {
        ...base,
        type: 'mcq' as ExerciseType,
        question: overrides.question || 'What is 2 + 2?',
        options: ['3', '4', '5', '6'],
        correct_answer: '4',
        explanation: '2 + 2 equals 4',
        difficulty: 1,
      };
    case 'short_answer':
      return {
        ...base,
        type: 'short_answer' as ExerciseType,
        question: overrides.question || 'What is the capital of France?',
        answer: 'Paris',
        explanation: 'Paris is the capital of France',
        difficulty: 1,
      };
    case 'fill_blank':
      return {
        ...base,
        type: 'fill_blank' as ExerciseType,
        question: overrides.question || 'The capital of France is __________.',
        blanks: ['Paris'],
        explanation: 'Paris is the capital',
        difficulty: 1,
      };
    case 'coding':
      return {
        ...base,
        type: 'coding' as ExerciseType,
        question: overrides.question || 'Write a function that adds two numbers.',
        template: 'function add(a, b) {\n  // your code here\n}',
        solution: 'function add(a, b) {\n  return a + b;\n}',
        test_cases: [
          { input: [1, 2], expected: 3 },
          { input: [5, 10], expected: 15 },
        ],
        explanation: 'This is a simple addition function',
        difficulty: 2,
        language: 'javascript',
      };
    case 'flashcard':
      return {
        ...base,
        type: 'flashcard' as ExerciseType,
        front: 'What is the capital of France?',
        back: 'Paris',
        explanation: 'Basic geography',
        difficulty: 1,
      };
    default:
      return base as Exercise;
  }
};

export const createTestMCQExercise = (planId: string, nodeId: string, overrides = {}) => ({
  exercise_id: randomUUID(),
  plan_id: planId,
  node_id: nodeId,
  type: 'mcq' as const,
  question: 'What is 2 + 2?',
  options: ['3', '4', '5', '6'],
  correct_answer: '4',
  explanation: '2 + 2 equals 4',
  difficulty: 1,
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createTestShortAnswerExercise = (planId: string, nodeId: string, overrides = {}) => ({
  exercise_id: randomUUID(),
  plan_id: planId,
  node_id: nodeId,
  type: 'short_answer' as const,
  question: 'What is the capital of France?',
  answer: 'Paris',
  explanation: 'Paris is the capital',
  difficulty: 1,
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createTestCodingExercise = (planId: string, nodeId: string, overrides = {}) => ({
  exercise_id: randomUUID(),
  plan_id: planId,
  node_id: nodeId,
  type: 'coding' as const,
  question: 'Write a function to add two numbers.',
  template: 'function add(a, b) {\n  // your code\n}',
  solution: 'function add(a, b) {\n  return a + b;\n}',
  test_cases: [
    { input: [1, 2], expected: 3 },
  ],
  explanation: 'Simple addition',
  difficulty: 2,
  language: 'javascript',
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createTestFlashcardExercise = (planId: string, nodeId: string, overrides = {}) => ({
  exercise_id: randomUUID(),
  plan_id: planId,
  node_id: nodeId,
  type: 'flashcard' as const,
  front: 'What is the capital of France?',
  back: 'Paris',
  explanation: 'Geography',
  difficulty: 1,
  created_at: new Date().toISOString(),
  ...overrides,
});
