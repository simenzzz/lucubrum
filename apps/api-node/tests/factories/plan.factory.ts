import { randomUUID } from 'crypto';

export interface TestPlan {
  plan_id: string;
  topic: string;
  user_id: string;
  normalized_topic: string;
  user_level: string;
  schedule: TestNode[];
  created_at: string;
}

export interface TestNode {
  node_id: string;
  plan_id: string;
  title: string;
  description: string;
  prerequisites: string[];
  estimated_minutes: number;
}

export interface TestUser {
  user_id: string;
  email: string;
  google_id: string;
  name: string;
  picture?: string;
  roles?: string[];
}

export const createTestPlan = (overrides = {}): TestPlan => ({
  plan_id: randomUUID(),
  topic: 'Test Topic',
  user_id: 'test-user-id',
  normalized_topic: 'test topic',
  user_level: 'beginner',
  schedule: [],
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createTestNode = (planId: string, overrides = {}): TestNode => ({
  node_id: `node-${randomUUID().slice(0, 8)}`,
  plan_id: planId,
  title: 'Test Node',
  description: 'Test description',
  prerequisites: [],
  estimated_minutes: 30,
  ...overrides,
});

export const createTestUser = (overrides = {}): TestUser => ({
  user_id: randomUUID(),
  email: 'test@example.com',
  google_id: 'google-123',
  name: 'Test User',
  roles: ['user'],
  ...overrides,
});

export const createTestExerciseBasic = (planId: string, nodeId: string, overrides = {}) => ({
  exercise_id: randomUUID(),
  plan_id: planId,
  node_id: nodeId,
  type: 'mcq',
  question: 'Test question?',
  options: ['A', 'B', 'C', 'D'],
  correct_answer: 'A',
  explanation: 'Test explanation',
  difficulty: 1,
  ...overrides,
});

export const createTestResource = (planId: string, nodeId: string, overrides = {}) => ({
  resource_id: randomUUID(),
  plan_id: planId,
  node_id: nodeId,
  type: 'youtube',
  youtube_id: 'test-video-id',
  title: 'Test Video',
  url: 'https://youtube.com/watch?v=test-video-id',
  relevance_score: 0.9,
  ...overrides,
});
