---
name: orchestrator-skill
description: This skill provides guidance for developing the Node/TypeScript orchestrator service (apps/api-node/). It should be used when adding endpoints, creating services, implementing database operations, or working with validation in the Node service. The orchestrator handles public API, YouTube integration, Postgres persistence, mastery tracking, and communication with the Python LLM service.
---

# Orchestrator Service Development Guide

## Overview

The Node/TypeScript orchestrator service (`apps/api-node/`) is the public-facing API layer that:

- **Public API**: Exposes REST endpoints for plans, exercises, attempts, and mastery
- **YouTube Integration**: Searches and ranks videos via YouTube Data API
- **Postgres Persistence**: Owns database schema and all persistence logic
- **Mastery Tracking**: Calculates user progress and recommends next steps
- **Python Service Orchestration**: Calls the Python LLM service for content generation

**Key Principle**: LLMs are components, not the product. The Node service handles all deterministic operations while delegating LLM calls to Python.

## Key Documentation

| Document | Purpose |
|----------|---------|
| `docs/SPEC.md` | Full technical specification with data flows and architecture |
| `docs/API.md` | Complete API endpoint documentation |

## Workflow: Adding Endpoints

**File location**: `apps/api-node/src/routes/<feature>.routes.ts`

### 1. Create Route File Structure

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const router = Router();

// Type definitions for request/response
interface MyRequestParams {
  planId: string;
}

interface MyRequestBody {
  // request body fields
}

interface MySuccessResponse {
  // success response fields
}

interface ErrorResponse {
  error: string;       // ERROR_CODE (uppercase snake_case)
  message: string;     // Human-readable description
  details?: Record<string, unknown>;
  request_id: string;
}
```

### 2. Implement Handler Pattern

```typescript
router.post(
  '/:planId/action',
  async (
    req: Request<MyRequestParams, unknown, MyRequestBody>,
    res: Response<MySuccessResponse | ErrorResponse>,
    next: NextFunction
  ) => {
    const { planId } = req.params;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    logger.info({ planId, requestId }, 'Starting operation');

    try {
      // Business logic here

      logger.info({ planId, requestId, ...metrics }, 'Operation complete');
      return res.json({ /* success response */ });
    } catch (error) {
      logger.error({ planId, requestId, error }, 'Operation failed');
      return res.status(500).json({
        error: 'OPERATION_FAILED',
        message: 'Human-readable error description',
        details: error instanceof Error ? { message: error.message } : undefined,
        request_id: requestId,
      });
    }
  }
);

export default router;
```

### 3. Standard HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success with response body |
| 201 | Resource created |
| 400 | Validation error (bad input) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (valid token, no permission) |
| 404 | Resource not found |
| 500 | Internal server error |

### 4. Error Code Conventions

- Use UPPER_SNAKE_CASE: `PLAN_NOT_FOUND`, `VALIDATION_FAILED`
- Be specific: `RESOURCE_ATTACHMENT_FAILED` not `ERROR`
- Include context in `details` when helpful

## Workflow: Creating Services

**File location**: `apps/api-node/src/services/<feature>.service.ts`

### 1. Class Structure with Singleton Pattern

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../utils/logger';

// Custom error class
export class MyServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MyServiceError';
  }
}

// Specific error subclass
export class SpecificError extends MyServiceError {
  constructor(resourceId: string, reason: string) {
    super(
      `Resource ${resourceId} failed: ${reason}`,
      404,
      'RESOURCE_NOT_FOUND',
      { resource_id: resourceId, reason }
    );
    this.name = 'SpecificError';
  }
}

class MyService {
  private client: AxiosInstance;

  constructor() {
    // Initialize HTTP client or other dependencies
    this.client = axios.create({
      baseURL: process.env.SERVICE_URL || 'http://localhost:8000',
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async performOperation(params: OperationParams): Promise<OperationResult> {
    logger.info({ ...params }, 'Starting operation');

    try {
      // Implementation
      return result;
    } catch (error) {
      logger.error({ ...params, error }, 'Operation failed');
      throw error;
    }
  }
}

// Export singleton instance
export const myService = new MyService();
export default myService;
```

### 2. HTTP Client with Interceptors

```typescript
constructor() {
  this.client = axios.create({
    baseURL: process.env.PYTHON_SERVICE_URL || 'http://localhost:8000',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.PYTHON_SERVICE_TOKEN && {
        'X-Service-Token': process.env.PYTHON_SERVICE_TOKEN
      }),
    },
  });

  // Request logging
  this.client.interceptors.request.use((config) => {
    logger.debug({ url: config.url, method: config.method }, 'API request');
    return config;
  });

  // Response logging
  this.client.interceptors.response.use(
    (response) => {
      logger.debug({ url: response.config.url, status: response.status }, 'API response');
      return response;
    },
    (error: AxiosError) => {
      logger.error({
        url: error.config?.url,
        status: error.response?.status,
        data: error.response?.data,
      }, 'API error');
      return Promise.reject(error);
    }
  );
}
```

## Workflow: Database Operations

**Schema location**: `infra/postgres/init.sql`
**Client**: `apps/api-node/src/db/client.ts`
**Redis**: `apps/api-node/src/db/redis.ts`
**Query builders**: `apps/api-node/src/db/queries/`

### Key Constraints

1. **Composite Primary Keys**: Nodes, resources, and exercises use `(plan_id, node_id)`
2. **Foreign Keys**: Always reference composite keys where applicable
3. **Indexes**: Add indexes for new query patterns

### Table Reference

| Table | Primary Key | Notes |
|-------|-------------|-------|
| `plans` | `plan_id` | User's learning plans |
| `nodes` | `(plan_id, node_id)` | DAG nodes within a plan |
| `resources` | `resource_id` | FK to `(plan_id, node_id)` |
| `exercises` | `exercise_id` | FK to `(plan_id, node_id)` |
| `attempts` | `attempt_id` | User exercise attempts |
| `user_mastery` | `(user_id, plan_id, node_id)` | Mastery scores |

### Query Pattern

```typescript
// Example: Fetch plan with nodes
const plan = await db.query(`
  SELECT p.*, json_agg(n.*) as nodes
  FROM plans p
  LEFT JOIN nodes n ON n.plan_id = p.plan_id
  WHERE p.plan_id = $1
  GROUP BY p.plan_id
`, [planId]);
```

## Workflow: Validation Layers

The orchestrator uses a three-layer validation architecture:

### 1. Input Validation (Zod)

**Location**: `apps/api-node/src/validation/input/`

Validates API request payloads before processing.

```typescript
import { z } from 'zod';

export const CreatePlanSchema = z.object({
  topic: z.string().min(3).max(500),
  user_level: z.enum(['beginner', 'intermediate', 'advanced']),
  exercise_types: z.array(z.enum(['mcq', 'short_answer', 'coding', 'fill_blank'])),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
```

### 2. Schema Validation (AJV)

**Location**: `apps/api-node/src/validation/schemas/`

Validates LLM outputs from Python service against JSON Schemas.

```typescript
import Ajv from 'ajv';
import planSchema from '../../packages/contracts/schemas/plan.schema.json';

const ajv = new Ajv();
const validatePlan = ajv.compile(planSchema);

if (!validatePlan(llmOutput)) {
  logger.error({ errors: validatePlan.errors }, 'LLM output validation failed');
  throw new ValidationError('Invalid plan schema', validatePlan.errors);
}
```

### 3. Semantic Validation

**Location**: `apps/api-node/src/validation/semantic/`

Validates business logic constraints that schema validation cannot catch.

```typescript
// dag.validator.ts - Detect cycles in prerequisite graph
// prereq.validator.ts - Ensure prerequisites reference existing nodes
```

**Semantic checks include**:
- DAG has no cycles (no circular prerequisites)
- All prerequisites reference existing nodes
- Node count within acceptable range (4-30)
- Schedule covers all nodes exactly once

## Python Service Communication

**Client**: `apps/api-node/src/services/curriculum-client.ts`

### Request Pattern

```typescript
async fetchTranscript(request: FetchTranscriptRequest): Promise<Transcript> {
  try {
    const response = await this.client.post<{ transcript: Transcript }>(
      '/llm/transcript',
      request
    );
    return response.data.transcript;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as Record<string, unknown> | undefined;

      // Map specific errors
      if (error.response?.status === 404 && data?.error === 'TRANSCRIPT_NOT_AVAILABLE') {
        throw new TranscriptNotAvailableError(
          request.video_id,
          (data?.reason as string) || 'Unknown reason'
        );
      }

      // Generic error mapping
      throw new CurriculumServiceError(
        (data?.message as string) || error.message,
        error.response?.status || 500,
        (data?.error as string) || 'UNKNOWN_ERROR',
        data
      );
    }
    throw error;
  }
}
```

### Python Service Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /llm/plan` | Generate learning plan |
| `POST /llm/exercises` | Generate exercises for node |
| `POST /llm/grade` | Grade user answer |
| `POST /llm/transcript` | Fetch YouTube transcript |
| `POST /llm/validate-video` | Validate video relevance |
| `POST /llm/check-staleness` | Check content freshness |
| `GET /health` | Health check |

## Non-Negotiable Rules

1. **All LLM outputs validated** - Use AJV against JSON Schemas from `packages/contracts/`
2. **LLMs never generate URLs** - YouTube resources come from YouTube Data API only
3. **Audit metadata required** - Every artifact must include:
   - `request_id` (UUID)
   - `prompt_version` (e.g., "plan/v2")
   - `provider` (gemini | claude)
   - `model` (e.g., "gemini-1.5-pro")
4. **Plan-scoped node identity** - `node_id` is unique within a plan only, always use `(plan_id, node_id)` composite key
5. **Request tracing** - Propagate `X-Request-ID` header across service boundaries

## Logging Standards

Use pino logger with structured context:

```typescript
import logger from '../utils/logger';

// Entry logging
logger.info({ planId, requestId, userId }, 'Starting operation');

// Debug logging
logger.debug({ candidateCount: videos.length }, 'YouTube search complete');

// Success logging with metrics
logger.info({
  planId,
  requestId,
  nodeCount: plan.nodes.length,
  totalResources: resourceCount,
  durationMs: Date.now() - startTime,
}, 'Operation complete');

// Error logging
logger.error({ planId, requestId, error }, 'Operation failed');

// Warning for non-fatal issues
logger.warn({ videoId }, 'No transcript available, skipping');
```

## Example Files to Reference

| File | Demonstrates |
|------|--------------|
| `services/curriculum-client.ts` | HTTP client with error handling, axios interceptors |
| `services/youtube.service.ts` | External API integration, ranking algorithm, singleton pattern |
| `routes/plan.routes.ts` | Route handler pattern, error responses, request tracing |
| `utils/logger.ts` | Pino logger configuration |
| `validation/semantic/dag.validator.ts` | Semantic validation pattern |
| `validation/semantic/prereq.validator.ts` | Prerequisite validation |

## Environment Variables

```bash
# Service
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Python LLM Service
PYTHON_SERVICE_URL=http://localhost:8000
PYTHON_SERVICE_TOKEN=<internal-token>

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/learning_helper

# YouTube API
YOUTUBE_API_KEY=<your-key>
YOUTUBE_CACHE_TTL_SECONDS=604800

# Redis
REDIS_URL=redis://localhost:6379

# Feature Flags
TRANSCRIPT_VALIDATION_ENABLED=true
TRANSCRIPT_MIN_RELEVANCE_SCORE=0.6
```

## Common Commands

```bash
# Start development server
cd apps/api-node && npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```
