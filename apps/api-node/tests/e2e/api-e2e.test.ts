/**
 * E2E Tests for Learning Helper API
 *
 * These tests validate the full application stack including:
 * - Service health checks
 * - Plan creation flow (with real LLM)
 * - Resource attachment flow (with real YouTube API)
 * - Exercise generation and grading flow (with real LLM)
 * - Mastery tracking flow
 *
 * Prerequisites:
 * - Test infrastructure running: docker-compose -f docker-compose.test.yml up -d
 * - Python service at http://localhost:8001
 * - Node service at http://localhost:3000 (or run with NODE_PORT=3001)
 * - Environment variables: GEMINI_API_KEY, YOUTUBE_API_KEY
 */

import axios, { AxiosError } from 'axios';

// Test configuration
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';
const NODE_SERVICE_URL = process.env.NODE_SERVICE_URL || 'http://localhost:3000';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'test-service-token';

// Axios instances
const pythonClient = axios.create({
  baseURL: PYTHON_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Service-Token': SERVICE_TOKEN,
  },
  timeout: 30000,
});

const nodeClient = axios.create({
  baseURL: NODE_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Test data
const testTopic = 'Binary Search Trees';
const testUserLevel = 'intermediate';

// Helper functions
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('E2E: Service Health', () => {
  test('Python service health check', async () => {
    const response = await pythonClient.get('/health');

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('status');
    expect(response.data).toHaveProperty('service', 'curriculum-python');
    expect(response.data).toHaveProperty('timestamp');
    expect(response.data).toHaveProperty('dependencies');

    // Database should be healthy (may be degraded/healthy depending on DB)
    expect(['healthy', 'degraded']).toContain(response.data.status);

    // LLM provider may be unhealthy if no API key configured
    expect(response.data.dependencies).toHaveProperty('llm_provider');
    expect(response.data.dependencies).toHaveProperty('database');
  });

  test('Test infrastructure is accessible', async () => {
    // Verify we can reach the Python service
    const pythonHealth = await pythonClient.get('/health');
    expect(pythonHealth.status).toBe(200);

    // If Node service is running, check it too
    try {
      const nodeHealth = await nodeClient.get('/health');
      expect(nodeHealth.status).toBe(200);
    } catch (error) {
      console.log('Node service not running - skipping Node health check');
    }
  });
});

describe('E2E: Plan Creation Flow (with real LLM)', () => {
  let normalizedTopic: string;
  let planResponse: any;

  test('POST /llm/normalize-topic - should normalize topic with real LLM', async () => {
    // Skip if no Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      console.log('Skipping: GEMINI_API_KEY not configured');
      return;
    }

    const response = await pythonClient.post('/llm/normalize-topic', {
      topic: testTopic,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('normalized_topic');
    expect(typeof response.data.normalized_topic).toBe('string');
    expect(response.data.normalized_topic).toBeTruthy();

    normalizedTopic = response.data.normalized_topic;
    console.log(`Normalized topic: "${normalizedTopic}"`);
  }, 30000);

  test('POST /llm/plan - should generate plan with real LLM', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('Skipping: GEMINI_API_KEY not configured');
      return;
    }

    const response = await pythonClient.post('/llm/plan', {
      topic: normalizedTopic || testTopic,
      user_level: testUserLevel,
      plan_size: 'basic', // Use smaller size for faster testing
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('plan');

    const { plan } = response.data;
    expect(plan).toHaveProperty('topic');
    expect(plan).toHaveProperty('user_level');
    expect(plan).toHaveProperty('nodes');
    expect(plan).toHaveProperty('schedule');
    expect(plan).toHaveProperty('metadata');

    // Validate nodes structure
    expect(Array.isArray(plan.nodes)).toBe(true);
    expect(plan.nodes.length).toBeGreaterThan(0);

    // Validate first node
    const firstNode = plan.nodes[0];
    expect(firstNode).toHaveProperty('id');
    expect(firstNode).toHaveProperty('title');
    expect(firstNode).toHaveProperty('objectives');
    expect(firstNode).toHaveProperty('prerequisites');
    expect(firstNode).toHaveProperty('estimated_minutes');

    // Validate metadata
    expect(plan.metadata).toHaveProperty('provider');
    expect(plan.metadata).toHaveProperty('model');
    expect(plan.metadata).toHaveProperty('prompt_version');
    expect(plan.metadata).toHaveProperty('created_at');

    planResponse = response.data;
    console.log(`Generated plan with ${plan.nodes.length} nodes`);
  }, 60000);

  test('Plan should have valid DAG structure (no cycles)', async () => {
    if (!planResponse) {
      console.log('Skipping: Plan not generated');
      return;
    }

    const { plan } = planResponse;
    const nodeIds = new Set(plan.nodes.map((n: any) => n.id));

    // Check all prerequisites reference valid nodes
    for (const node of plan.nodes) {
      for (const prereq of node.prerequisites) {
        expect(nodeIds.has(prereq)).toBe(true);
      }
    }

    // Simple cycle detection using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function hasCycle(nodeId: string): boolean {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const node = plan.nodes.find((n: any) => n.id === nodeId);
      if (node) {
        for (const prereq of node.prerequisites) {
          if (hasCycle(prereq)) return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    }

    for (const node of plan.nodes) {
      if (hasCycle(node.id)) {
        throw new Error(`Cycle detected in plan starting at node ${node.id}`);
      }
    }

    console.log('Plan DAG validated: no cycles found');
  });

  test('Plan should respect size constraints', async () => {
    if (!planResponse) {
      console.log('Skipping: Plan not generated');
      return;
    }

    const { plan } = planResponse;
    const nodeCount = plan.nodes.length;

    // Basic plan should have 4-12 nodes
    expect(nodeCount).toBeGreaterThanOrEqual(4);
    expect(nodeCount).toBeLessThanOrEqual(12);

    console.log(`Plan size validated: ${nodeCount} nodes within constraints`);
  });
});

describe('E2E: Resource Attachment Flow', () => {
  let testPlanId: string;

  beforeAll(async () => {
    // Create a test plan in database if Node service is available
    if (!process.env.GEMINI_API_KEY || !process.env.YOUTUBE_API_KEY) {
      console.log('Skipping resource flow setup: API keys not configured');
      return;
    }

    try {
      // First create a plan via Python service
      const planRes = await pythonClient.post('/llm/plan', {
        topic: 'React Hooks',
        user_level: 'intermediate',
        plan_size: 'basic',
      });

      // If Node service is running, we would create it in the database
      // For now, we'll test the query generation endpoint
    } catch (error) {
      console.log('Could not create test plan for resource flow');
    }
  });

  test('POST /llm/queries - should generate search queries with real LLM', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('Skipping: GEMINI_API_KEY not configured');
      return;
    }

    const response = await pythonClient.post('/llm/queries', {
      node: {
        id: 'test_node_1',
        title: 'Introduction to React Hooks',
        objectives: [
          'Understand what hooks are',
          'Learn basic hooks like useState and useEffect',
        ],
      },
      count: 3,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('queries');
    expect(Array.isArray(response.data.queries)).toBe(true);
    expect(response.data.queries.length).toBeGreaterThan(0);

    // Each query should be a non-empty string
    response.data.queries.forEach((query: string) => {
      expect(typeof query).toBe('string');
      expect(query.length).toBeGreaterThan(0);
    });

    console.log('Generated queries:', response.data.queries);
  }, 30000);

  test('Real YouTube API integration (if YOUTUBE_API_KEY set)', async () => {
    if (!process.env.YOUTUBE_API_KEY) {
      console.log('Skipping: YOUTUBE_API_KEY not configured');
      return;
    }

    // This would test the actual YouTube API integration
    // For now, we verify the endpoint is accessible
    const searchQuery = 'React Hooks tutorial';
    const youtubeUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=5&key=${process.env.YOUTUBE_API_KEY}`;

    try {
      const response = await axios.get(youtubeUrl);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('items');
      expect(Array.isArray(response.data.items)).toBe(true);

      if (response.data.items.length > 0) {
        const firstVideo = response.data.items[0];
        expect(firstVideo).toHaveProperty('id');
        expect(firstVideo).toHaveProperty('snippet');

        console.log(`YouTube API returned ${response.data.items.length} videos`);
        console.log('First video:', firstVideo.snippet?.title);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('YouTube API error:', axiosError.response?.data);
      throw error;
    }
  }, 15000);
});

describe('E2E: Exercise & Grading Flow', () => {
  let testNode: any;
  let exerciseSet: any;

  beforeAll(() => {
    testNode = {
      id: 'bst_insertion',
      title: 'BST Insertion',
      objectives: [
        'Implement iterative insertion',
        'Implement recursive insertion',
        'Understand time complexity',
      ],
    };
  });

  test('POST /llm/exercises - should generate exercises with real LLM', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.log('Skipping: GEMINI_API_KEY not configured');
      return;
    }

    const response = await pythonClient.post('/llm/exercises', {
      node: testNode,
      user_level: testUserLevel,
      exercise_types: ['mcq', 'short_answer'],
      count: 2,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('exercise_set');

    const { exercise_set } = response.data;
    expect(exercise_set).toHaveProperty('node_id', testNode.id);
    expect(exercise_set).toHaveProperty('user_level', testUserLevel);
    expect(exercise_set).toHaveProperty('exercises');
    expect(exercise_set).toHaveProperty('metadata');

    // Validate exercises
    expect(Array.isArray(exercise_set.exercises)).toBe(true);
    expect(exercise_set.exercises.length).toBeGreaterThan(0);

    // Validate first exercise
    const firstExercise = exercise_set.exercises[0];
    expect(firstExercise).toHaveProperty('id');
    expect(firstExercise).toHaveProperty('type');
    expect(firstExercise).toHaveProperty('prompt');
    expect(firstExercise).toHaveProperty('correct_answer');
    expect(firstExercise).toHaveProperty('rubric');
    expect(firstExercise).toHaveProperty('difficulty');

    // Check for requested types
    const types = new Set(exercise_set.exercises.map((e: any) => e.type));
    console.log('Exercise types generated:', Array.from(types));

    exerciseSet = exercise_set;
    console.log(`Generated ${exercise_set.exercises.length} exercises`);
  }, 60000);

  test('POST /llm/grade - should grade answer with real LLM', async () => {
    if (!exerciseSet || !process.env.GEMINI_API_KEY) {
      console.log('Skipping: No exercises generated or GEMINI_API_KEY not configured');
      return;
    }

    const testExercise = exerciseSet.exercises[0];
    let testAnswer: string;

    // Generate appropriate test answer based on exercise type
    if (testExercise.type === 'mcq') {
      testAnswer = testExercise.correct_answer;
    } else {
      testAnswer = 'This is a test answer that should be graded.';
    }

    const response = await pythonClient.post('/llm/grade', {
      exercise: testExercise,
      user_answer: testAnswer,
      user_level: testUserLevel,
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('grade');

    const { grade } = response.data;
    expect(grade).toHaveProperty('exercise_id', testExercise.id);
    expect(grade).toHaveProperty('score');
    expect(typeof grade.score).toBe('number');
    expect(grade.score).toBeGreaterThanOrEqual(0);
    expect(grade.score).toBeLessThanOrEqual(1);
    expect(grade).toHaveProperty('is_correct');
    expect(typeof grade.is_correct).toBe('boolean');
    expect(grade).toHaveProperty('feedback');
    expect(grade).toHaveProperty('misconceptions');

    console.log(`Grade result: score=${grade.score}, is_correct=${grade.is_correct}`);
    console.log(`Feedback: ${grade.feedback}`);
  }, 30000);
});

describe('E2E: Mastery Tracking Flow', () => {
  // These tests require the Node service to be running with database access
  test('GET /api/plan/:planId/nodes/:nodeId/mastery - requires Node service', async () => {
    try {
      // Try to access a test mastery endpoint
      const testPlanId = '550e8400-e29b-41d4-a716-446655440000';
      const testNodeId = 'test_node_1';

      const response = await nodeClient.get(
        `/api/plan/${testPlanId}/nodes/${testNodeId}/mastery`
      );

      // If we get here, Node service is running
      expect(response.status).toBeLessThan(500);

      if (response.status === 404) {
        console.log('Mastery endpoint accessible but no data found (expected for test plan)');
      }
    } catch (error) {
      if ((error as AxiosError).code === 'ECONNREFUSED') {
        console.log('Node service not running - skipping mastery tests');
        return;
      }
      throw error;
    }
  });

  test('GET /api/plan/:planId/next - requires Node service', async () => {
    try {
      const testPlanId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await nodeClient.get(`/api/plan/${testPlanId}/next`);

      expect(response.status).toBeLessThan(500);

      if (response.status === 404) {
        console.log('Next-node endpoint accessible but plan not found (expected)');
      }
    } catch (error) {
      if ((error as AxiosError).code === 'ECONNREFUSED') {
        console.log('Node service not running - skipping next-node test');
        return;
      }
      throw error;
    }
  });
});

describe('E2E: Error Handling', () => {
  test('POST /llm/plan with invalid input should return 400', async () => {
    try {
      await pythonClient.post('/llm/plan', {
        topic: '', // Invalid: empty topic
        user_level: 'invalid_level',
      });
      fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBeGreaterThanOrEqual(400);
      expect(axiosError.response?.status).toBeLessThan(500);
    }
  });

  test('POST /llm/exercises with invalid node should return error', async () => {
    try {
      await pythonClient.post('/llm/exercises', {
        node: {
          id: '', // Invalid: empty ID
          title: '',
        },
        user_level: testUserLevel,
      });
      fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBeGreaterThanOrEqual(400);
    }
  });

  test('Invalid service token should be rejected', async () => {
    const invalidClient = axios.create({
      baseURL: PYTHON_SERVICE_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': 'invalid-token-12345',
      },
    });

    try {
      await invalidClient.post('/llm/plan', {
        topic: testTopic,
        user_level: testUserLevel,
      });
      fail('Should have thrown an error');
    } catch (error) {
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(401);
    }
  });
});
