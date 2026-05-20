// LLM Response fixtures for testing

export const VALID_PLAN_RESPONSE = {
  plan_id: 'test-plan-123',
  topic: 'JavaScript Basics',
  normalized_topic: 'javascript basics',
  domain_category: 'cs',
  staleness_policy: 'annual',
  schedule: [
    {
      node_id: 'variables-and-types',
      title: 'Variables and Types',
      description: 'Learn about let, const, var and data types in JavaScript',
      prerequisites: [],
      estimated_minutes: 30,
      order: 0,
    },
    {
      node_id: 'functions',
      title: 'Functions',
      description: 'Learn how to define and use functions',
      prerequisites: ['variables-and-types'],
      estimated_minutes: 45,
      order: 1,
    },
    {
      node_id: 'arrays',
      title: 'Arrays',
      description: 'Learn about array methods and manipulation',
      prerequisites: ['variables-and-types'],
      estimated_minutes: 40,
      order: 2,
    },
  ],
  request_id: 'test-request-123',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  generated_at: new Date().toISOString(),
};

export const PLAN_WITH_CYCLE = {
  ...VALID_PLAN_RESPONSE,
  plan_id: 'cycle-plan-123',
  schedule: [
    {
      node_id: 'node-a',
      title: 'Node A',
      description: 'Description A',
      prerequisites: ['node-b'],
      estimated_minutes: 30,
      order: 0,
    },
    {
      node_id: 'node-b',
      title: 'Node B',
      description: 'Description B',
      prerequisites: ['node-a'], // Cycle!
      estimated_minutes: 30,
      order: 1,
    },
  ],
};

export const PLAN_WITH_SELF_REFERENCE = {
  ...VALID_PLAN_RESPONSE,
  plan_id: 'self-ref-plan-123',
  schedule: [
    {
      node_id: 'node-self',
      title: 'Self Node',
      description: 'Node that references itself',
      prerequisites: ['node-self'], // Self-reference!
      estimated_minutes: 30,
      order: 0,
    },
  ],
};

export const PLAN_WITH_INVALID_PREREQ = {
  ...VALID_PLAN_RESPONSE,
  plan_id: 'invalid-prereq-plan-123',
  schedule: [
    {
      node_id: 'node-a',
      title: 'Node A',
      description: 'Description A',
      prerequisites: ['non-existent-node'],
      estimated_minutes: 30,
      order: 0,
    },
  ],
};

export const VALID_EXERCISES_RESPONSE = {
  exercises: [
    {
      exercise_id: 'exercise-1',
      node_id: 'variables-and-types',
      type: 'mcq',
      question: 'What keyword declares a constant in JavaScript?',
      options: ['var', 'let', 'const', 'constant'],
      correct_answer: 'const',
      explanation: 'const is used to declare constants in JavaScript',
      difficulty: 1,
    },
    {
      exercise_id: 'exercise-2',
      node_id: 'variables-and-types',
      type: 'short_answer',
      question: 'What is the result of typeof null in JavaScript?',
      answer: 'object',
      explanation: 'This is a known bug in JavaScript',
      difficulty: 2,
    },
  ],
  request_id: 'test-exercise-request',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  generated_at: new Date().toISOString(),
};

export const VALID_GRADE_RESPONSE = {
  is_correct: true,
  score: 1.0,
  feedback: 'Correct! Well done.',
  misconceptions: [],
  request_id: 'test-grade-request',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  graded_at: new Date().toISOString(),
};

export const VALID_NORMALIZE_RESPONSE = {
  topic_normalized: 'react js',
  domain_category: 'web',
  staleness_policy: '14d',
  confidence: 0.95,
  request_id: 'test-normalize-request',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  normalized_at: new Date().toISOString(),
};

export const VALID_VIDEO_VALIDATION_RESPONSE = {
  is_relevant: true,
  relevance_score: 0.85,
  covers_objectives: ['variables', 'functions'],
  quality_issues: [],
  request_id: 'test-validation-request',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  validated_at: new Date().toISOString(),
};

export const VALID_STALENESS_RESPONSE = {
  is_stale: false,
  contradiction_rate: 0.0,
  contradictions: [],
  fact_count_old: 5,
  fact_count_new: 5,
  request_id: 'test-staleness-request',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  checked_at: new Date().toISOString(),
};

export const VALID_QUERY_SUGGESTIONS_RESPONSE = {
  queries: [
    'javascript tutorial for beginners',
    'learn javascript basics',
    'javascript variables and types',
  ],
  request_id: 'test-queries-request',
  prompt_version: '1.0',
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  generated_at: new Date().toISOString(),
};

export const LLM_ERROR_RESPONSE = {
  error: 'LLM provider error',
  message: 'Failed to generate response',
};

export const MALFORMED_JSON_RESPONSE = `{
  "plan_id": "test-plan",
  "schedule": [
    {
      "node_id": "node-1",
      "prerequisites": ["node-2"
    }
  ]
}`; // Missing closing bracket

export const MISSING_REQUIRED_FIELDS_RESPONSE = {
  plan_id: 'test-plan',
  // Missing required fields like schedule, topic, etc.
};
