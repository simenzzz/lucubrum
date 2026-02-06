#!/usr/bin/env ts-node
/**
 * E2E Test Runner for Learning Helper
 *
 * Usage:
 *   GEMINI_API_KEY=xxx YOUTUBE_API_KEY=yyy ts-node tests/e2e/run-e2e.ts
 *
 * Prerequisites:
 *   - Test infrastructure running: docker-compose -f docker-compose.test.yml up -d
 *   - Python service at http://localhost:8001
 *   - Environment variables: GEMINI_API_KEY (optional, for real LLM tests)
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;
if (!SERVICE_TOKEN) {
  throw new Error('SERVICE_TOKEN environment variable required for E2E tests');
}

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Generate a UUID v4 for request IDs
function generateUUID(): string {
  return uuidv4();
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    log(`✓ ${name} (${duration}ms)`, colors.green);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMessage, duration });
    log(`✗ ${name}`, colors.red);
    log(`  Error: ${errorMessage}`, colors.red);
  }
}

async function main() {
  log('\n=== Learning Helper E2E Tests ===\n', colors.blue);

  const client = axios.create({
    baseURL: PYTHON_SERVICE_URL,
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Token': SERVICE_TOKEN,
    },
    timeout: 60000,
  });

  // Test 1: Health Check
  await runTest('Python service health check', async () => {
    const response = await client.get('/health');
    assert(response.status === 200, 'Health check should return 200');
    // Status can be healthy, degraded, or unhealthy (if LLM not configured)
    assert(['healthy', 'degraded', 'unhealthy'].includes(response.data.status),
      'Status should be healthy, degraded, or unhealthy');
    assert(response.data.service === 'curriculum-python', 'Service should be curriculum-python');
    log(`    Status: ${response.data.status}`, colors.blue);
    log(`    Dependencies: ${JSON.stringify(response.data.dependencies)}`, colors.blue);
  });

  // Test 2: Normalize Topic (with real LLM)
  if (process.env.GEMINI_API_KEY) {
    await runTest('POST /llm/normalize-topic (real LLM)', async () => {
      const response = await client.post('/llm/normalize-topic', {
        topic: 'Binary Search Trees',
        request_id: 'e2e-test-' + Date.now(),
      });
      assert(response.status === 200, 'Should return 200');
      assert(response.data.topic_normalized || response.data.normalized_topic, 'Should have normalized topic result');
      const normalized = response.data.topic_normalized || response.data.normalized_topic;
      log(`    Normalized: "${normalized}"`, colors.blue);
      log(`    Domain: ${response.data.domain_category}`, colors.blue);
      log(`    Policy: ${response.data.staleness_policy}`, colors.blue);
    });
  } else {
    log('⊘ Skipping /llm/normalize-topic (no GEMINI_API_KEY)', colors.yellow);
  }

  // Test 3: Generate Plan (with real LLM)
  let generatedPlan: any = null;
  if (process.env.GEMINI_API_KEY) {
    await runTest('POST /llm/plan (real LLM)', async () => {
      const response = await client.post('/llm/plan', {
        topic: 'Binary Search Trees',
        user_level: 'intermediate',
        plan_size: 'basic',
        request_id: generateUUID(),
      });
      assert(response.status === 200, 'Should return 200');
      assert(response.data.plan, 'Should have plan object');
      assert(response.data.plan.nodes, 'Should have nodes array');
      assert(response.data.plan.nodes.length > 0, 'Should have at least one node');
      assert(response.data.plan.schedule, 'Should have schedule array');

      const plan = response.data.plan;
      assert(plan.topic, 'Plan should have topic');
      assert(plan.user_level, 'Plan should have user_level');
      assert(plan.metadata, 'Plan should have metadata');
      assert(plan.metadata.provider, 'Metadata should have provider');
      assert(plan.metadata.model, 'Metadata should have model');

      generatedPlan = plan;
      log(`    Generated plan with ${plan.nodes.length} nodes`, colors.blue);
      // Use generatedPlan to avoid unused variable warning
      void generatedPlan;
      log(`    Topic: ${plan.topic}`, colors.blue);
      log(`    Provider: ${plan.metadata.provider}/${plan.metadata.model}`, colors.blue);
    });
  } else {
    log('⊘ Skipping /llm/plan (no GEMINI_API_KEY)', colors.yellow);
  }

  // Test 4: Generate Queries
  if (process.env.GEMINI_API_KEY) {
    await runTest('POST /llm/queries (real LLM)', async () => {
      const testPlanId = generateUUID();
      const response = await client.post('/llm/queries', {
        plan_id: testPlanId,
        node_id: 'test_node',
        node_title: 'Introduction to React Hooks',
        node_objectives: ['Understand hooks', 'Learn useState and useEffect'],
        request_id: generateUUID(),
      });
      assert(response.status === 200, 'Should return 200');
      assert(response.data.suggestions, 'Should have suggestions object');
      assert(response.data.suggestions.queries, 'Should have queries array');
      assert(response.data.suggestions.queries.length > 0, 'Should have at least one query');
      log(`    Generated ${response.data.suggestions.queries.length} queries`, colors.blue);
      log(`    Queries: ${response.data.suggestions.queries.join(', ')}`, colors.blue);
    });
  } else {
    log('⊘ Skipping /llm/queries (no GEMINI_API_KEY)', colors.yellow);
  }

  // Test 5: Generate Exercises
  let generatedExercises: any = null;
  if (process.env.GEMINI_API_KEY) {
    await runTest('POST /llm/exercises (real LLM)', async () => {
      const testPlanId = generateUUID();
      const response = await client.post('/llm/exercises', {
        plan_id: testPlanId,
        node_id: 'bst_insertion',
        topic: 'Binary Search Trees',
        node_title: 'BST Insertion',
        objectives: ['Implement iterative insertion', 'Implement recursive insertion'],
        user_level: 'intermediate',
        exercise_types: ['mcq', 'short_answer'],
        count: 2,
        difficulty_target: 3,
        request_id: generateUUID(),
      });
      assert(response.status === 200, 'Should return 200');
      assert(response.data.exercise_set, 'Should have exercise_set');
      assert(response.data.exercise_set.exercises, 'Should have exercises array');
      assert(response.data.exercise_set.exercises.length > 0, 'Should have at least one exercise');

      const firstExercise = response.data.exercise_set.exercises[0];
      assert(firstExercise.id, 'Exercise should have id');
      assert(firstExercise.type, 'Exercise should have type');
      assert(firstExercise.prompt, 'Exercise should have prompt');
      assert(firstExercise.correct_answer, 'Exercise should have correct_answer');
      assert(firstExercise.rubric, 'Exercise should have rubric');

      generatedExercises = response.data.exercise_set;
      log(`    Generated ${generatedExercises.exercises.length} exercises`, colors.blue);
      log(`    Types: ${[...new Set(generatedExercises.exercises.map((e: any) => e.type))].join(', ')}`, colors.blue);
    });
  } else {
    log('⊘ Skipping /llm/exercises (no GEMINI_API_KEY)', colors.yellow);
  }

  // Test 6: Grade Answer
  if (generatedExercises && process.env.GEMINI_API_KEY) {
    await runTest('POST /llm/grade (real LLM)', async () => {
      const testExercise = generatedExercises.exercises[0];
      const testPlanId = generateUUID();
      const testAnswer = testExercise.type === 'mcq'
        ? testExercise.correct_answer
        : 'This is a test answer.';

      const response = await client.post('/llm/grade', {
        plan_id: testPlanId,
        node_id: 'bst_insertion',
        exercise_id: testExercise.id,
        exercise_type: testExercise.type,
        prompt: testExercise.prompt,
        rubric: testExercise.rubric,
        correct_answer: testExercise.correct_answer,
        user_answer: testAnswer,
        user_level: 'intermediate',
      });
      assert(response.status === 200, 'Should return 200');
      assert(response.data.grade, 'Should have grade object');
      assert(typeof response.data.grade.score === 'number', 'Grade should have numeric score');
      assert(response.data.grade.score >= 0 && response.data.grade.score <= 1,
        'Score should be between 0 and 1');
      assert(typeof response.data.grade.is_correct === 'boolean',
        'Grade should have boolean is_correct');
      assert(response.data.grade.feedback, 'Grade should have feedback');
      assert(Array.isArray(response.data.grade.misconceptions),
        'Grade should have misconceptions array');

      log(`    Score: ${response.data.grade.score}`, colors.blue);
      log(`    Correct: ${response.data.grade.is_correct}`, colors.blue);
      log(`    Feedback: ${response.data.grade.feedback.substring(0, 100)}...`, colors.blue);
    });
  } else {
    log('⊘ Skipping /llm/grade (no exercises generated or no GEMINI_API_KEY)', colors.yellow);
  }

  // Test 7: Error Handling - Invalid input
  await runTest('POST /llm/plan with invalid input returns 4xx', async () => {
    try {
      await client.post('/llm/plan', {
        topic: '', // Invalid
        user_level: 'invalid' as any, // Invalid
        request_id: generateUUID(),
      });
      throw new Error('Should have thrown an error for invalid input');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        assert(error.response!.status >= 400 && error.response!.status < 500,
          'Should return 4xx status');
      } else {
        throw error;
      }
    }
  });

  // Test 8: Authentication - Invalid token
  await runTest('Invalid service token is rejected', async () => {
    const invalidClient = axios.create({
      baseURL: PYTHON_SERVICE_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': 'invalid-token',
      },
    });
    try {
      // Call an endpoint that requires authentication
      await invalidClient.post('/llm/plan', {
        topic: 'test',
        user_level: 'intermediate',
        request_id: generateUUID(),
      });
      throw new Error('Should have rejected invalid token');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        assert(error.response!.status === 401, 'Should return 401 Unauthorized');
      } else {
        throw error;
      }
    }
  });

  // Summary
  log('\n=== Test Summary ===', colors.blue);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  log(`Total: ${results.length} tests`, colors.blue);
  log(`Passed: ${passed}`, colors.green);
  log(`Failed: ${failed}`, failed > 0 ? colors.red : colors.green);
  log(`Duration: ${totalDuration}ms`, colors.blue);

  if (failed > 0) {
    log('\nFailed tests:', colors.red);
    results
      .filter(r => !r.passed)
      .forEach(r => log(`  - ${r.name}: ${r.error}`, colors.red));
    process.exit(1);
  } else {
    log('\n✓ All tests passed!', colors.green);
    process.exit(0);
  }
}

main().catch(error => {
  log(`\nFatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
