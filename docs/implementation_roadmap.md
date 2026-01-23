# Implementation Roadmap - Learning Helper

> **For AI Coding Agents**: This roadmap reflects the ACTUAL state of the codebase as of January 2026. Read the "What's Already Built" section carefully before implementing anything.

---

## Executive Summary

This roadmap has been reorganized to reflect what has already been implemented. The original plan was not followed sequentially—some features (YouTube integration, staleness detection) were built before the core plan generation. **The immediate priority is Phase 1: Plan Generation**, which is required before any other features can function end-to-end.

### Key Principles
1. **Schema-first**: Pydantic models are the source of truth; everything flows from them
2. **Incremental delivery**: Each phase produces testable, demonstrable functionality
3. **Don't duplicate work**: Many services already exist—wire them up, don't rewrite

---

## What's Already Built

**READ THIS SECTION BEFORE IMPLEMENTING ANYTHING.**

### Infrastructure (100% Complete)
| Component | Location | Status |
|-----------|----------|--------|
| Docker Compose | `infra/docker-compose.yml` | ✅ Postgres 15 + Redis 7 configured |
| Database schema | `infra/postgres/init.sql` | ✅ All tables created (plans, nodes, resources, exercises, attempts, user_mastery, users, refresh_tokens, llm_calls) |
| JSON Schemas | `packages/contracts/schemas/` | ✅ 7 schemas exported |

### Python Service - Curriculum (`apps/curriculum-python/`)

**Models (100% Complete)**:
| Model | File | Status |
|-------|------|--------|
| Plan, Node, ScheduleItem | `src/models/plan.py` | ✅ Complete with validators |
| ExerciseSet, MCQ, ShortAnswer, FillBlank, Coding, Flashcard | `src/models/exercise.py` | ✅ Discriminated union |
| Grade | `src/models/grade.py` | ✅ Complete |
| QuerySuggestions | `src/models/query_suggestions.py` | ✅ Complete |
| ArtifactMetadata | `src/models/metadata.py` | ✅ Complete |
| Transcript, VideoValidation, StalenessResult | `src/models/transcript.py` | ✅ Complete |

**Providers (100% Complete)**:
| Provider | File | Status |
|----------|------|--------|
| Base interface | `src/providers/base.py` | ✅ ABC class + factory |
| Gemini | `src/providers/gemini.py` | ✅ google-generativeai |
| Claude | `src/providers/claude.py` | ✅ anthropic SDK |

**Utilities (Partial)**:
| Utility | File | Status |
|---------|------|--------|
| Transcript fetcher | `src/utils/transcripts.py` | ✅ 192 lines, youtube-transcript-api |
| Prompt loader | `src/utils/prompts.py` | ✅ 44 lines, LRU cached |
| Hashing | `src/utils/hashing.py` | ✅ 28 lines, SHA-256 |
| Logger | `src/utils/logger.py` | ❌ Empty skeleton |
| Retry logic | `src/utils/retry.py` | ❌ Empty skeleton |

**API Endpoints (Partial)**:
| Endpoint | File | Status |
|----------|------|--------|
| POST /llm/transcript | `src/api/transcript.py` | ✅ 63 lines |
| POST /llm/validate-video | `src/api/validate_video.py` | ✅ 150 lines |
| POST /llm/check-staleness | `src/api/staleness.py` | ✅ 197 lines |
| POST /llm/plan | `src/api/plan.py` | ❌ Empty skeleton |
| POST /llm/exercises | `src/api/exercises.py` | ❌ Empty skeleton |
| POST /llm/grade | `src/api/grade.py` | ❌ Empty skeleton |
| POST /llm/queries | `src/api/queries.py` | ❌ Empty skeleton |

**Prompts (Partial)**:
| Prompt | File | Status |
|--------|------|--------|
| validate_video/v1 | `src/prompts/validate_video/v1.txt` | ✅ 80 lines |
| staleness/v1 | `src/prompts/staleness/v1.txt` | ✅ 89 lines |
| plan/v1 | `src/prompts/plan/v1.txt` | ❌ Empty |
| exercises/v1 | `src/prompts/exercises/v1.txt` | ❌ Empty |
| grade/v1 | `src/prompts/grade/v1.txt` | ❌ Empty |
| queries/v1 | `src/prompts/queries/v1.txt` | ❌ Empty |

### Node Service - Orchestrator (`apps/api-node/`)

**Services (Partial)**:
| Service | File | Status |
|---------|------|--------|
| YouTube integration | `src/services/youtube.service.ts` | ✅ 397 lines, ranking algorithm |
| Curriculum client | `src/services/curriculum-client.ts` | ✅ 253 lines, HTTP client |
| Plan cache | `src/services/plan-cache.service.ts` | ✅ 250 lines, staleness logic |
| Logger | `src/utils/logger.ts` | ✅ 20 lines, pino |
| Plan service | `src/services/plan.service.ts` | ❌ Empty |
| Exercise service | `src/services/exercise.service.ts` | ❌ Empty |
| Mastery service | `src/services/mastery.service.ts` | ❌ Empty |
| Auth service | `src/services/auth.service.ts` | ❌ Empty |

**Routes (Partial)**:
| Route | File | Status |
|-------|------|--------|
| POST /api/plan/:planId/resources | `src/routes/plan.routes.ts` | ✅ 195 lines (but no POST /api/plan) |
| Auth routes | `src/routes/auth.routes.ts` | ❌ Empty |
| Exercise routes | `src/routes/exercise.routes.ts` | ❌ Empty |
| Mastery routes | `src/routes/mastery.routes.ts` | ❌ Empty |

**Database & Validation (Not Started)**:
| Component | File | Status |
|-----------|------|--------|
| Postgres client | `src/db/client.ts` | ❌ Empty |
| Redis client | `src/db/redis.ts` | ❌ Empty |
| AJV validators | `src/validation/schemas/` | ❌ Empty directory |
| DAG validator | `src/validation/semantic/dag.validator.ts` | ❌ Empty |
| Prereq validator | `src/validation/semantic/prereq.validator.ts` | ❌ Empty |
| Input schemas (Zod) | `src/validation/input/` | ❌ Empty directory |

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: PLAN GENERATION (CRITICAL)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Python: prompts/plan/v1.txt + api/plan.py + utils/retry.py         │    │
│  │  Node: db/client.ts + validation/* + plan.service.ts + routes       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌───────────────────────────────────────┬─────────────────────────────────────┐
│   PHASE 2: WIRE YOUTUBE RESOURCES     │     PHASE 3: AUTHENTICATION          │
│  ┌─────────────────────────────────┐  │  ┌─────────────────────────────────┐ │
│  │ • Connect db/redis.ts           │  │  │ • Google OAuth 2.0 + PKCE       │ │
│  │ • Resource persistence queries  │  │  │ • JWT access/refresh tokens     │ │
│  │ • Wire existing youtube.service │  │  │ • Auth middleware               │ │
│  │ • Query suggestions endpoint    │  │  │ • Protect plan routes           │ │
│  └─────────────────────────────────┘  │  └─────────────────────────────────┘ │
│                  │                    │                  │                    │
└──────────────────┼────────────────────┴──────────────────┼────────────────────┘
                   └──────────────────┬────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 4: EXERCISES & GRADING                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Python: prompts + api/exercises.py + api/grade.py                  │    │
│  │  Node: exercise.service.ts + mastery.service.ts + routes            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 5: RECOMMENDATIONS & EVALUATION                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • GET /api/plan/:id/next (next node recommendation)                │    │
│  │  • Prerequisite-aware unlocking                                     │    │
│  │  • Evaluation harness with golden topics                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 6: POLISH & DEPLOYMENT                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Rate limiting, admin endpoints, Dockerfiles, K8s                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  PHASE 7: COMPLETE CACHING & STALENESS                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • POST /llm/normalize-topic (topic normalization)                  │    │
│  │  • MCP integration (FastMCP SDK)                                    │    │
│  │  • Quality signal aggregation + cache invalidation                  │    │
│  │  (Note: validate-video, staleness, transcripts already built)       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Plan Generation (CRITICAL PATH)

**Goal**: Generate learning plans via LLM with full validation. THIS IS THE CORE FEATURE.

**Why Critical**: The YouTube resource attachment (`POST /api/plan/:planId/resources`) already exists but cannot function without plans to attach resources to.

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 1.1 | Plan prompt template | `apps/curriculum-python/src/prompts/plan/v1.txt` | See template below |
| 1.2 | Retry logic utility | `apps/curriculum-python/src/utils/retry.py` | Max 2 retries on validation failure |
| 1.3 | POST /llm/plan endpoint | `apps/curriculum-python/src/api/plan.py` | Call LLM, validate, return |
| 1.4 | Postgres client | `apps/api-node/src/db/client.ts` | pg pool connection |
| 1.5 | AJV validator setup | `apps/api-node/src/validation/schemas/validator.ts` | Load JSON schemas from packages/contracts |
| 1.6 | Zod input schemas | `apps/api-node/src/validation/input/plan.ts` | Request validation |
| 1.7 | DAG validator | `apps/api-node/src/validation/semantic/dag.validator.ts` | Cycle detection |
| 1.8 | Prerequisite validator | `apps/api-node/src/validation/semantic/prereq.validator.ts` | Refs exist |
| 1.9 | Plan database queries | `apps/api-node/src/db/queries/plans.ts` | INSERT plan + nodes |
| 1.10 | Plan service | `apps/api-node/src/services/plan.service.ts` | Orchestrate flow |
| 1.11 | POST /api/plan route | `apps/api-node/src/routes/plan.routes.ts` | Add to existing file |

### Exit Criteria
- [ ] `curl -X POST localhost:3000/api/plan -d '{"topic": "Python basics", "user_level": "beginner"}'` returns a valid plan
- [ ] Plan is persisted to Postgres (check `SELECT * FROM plans`)
- [ ] DAG validation rejects cyclic prerequisites
- [ ] Response includes full metadata (provider, model, prompt_version, hashes)

### Verification
```bash
# Generate a plan
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Introduction to Machine Learning",
    "user_level": "beginner"
  }'

# Check database
psql postgresql://learning_helper:learning_helper_dev@localhost:5432/learning_helper \
  -c "SELECT plan_id, topic, user_level FROM plans ORDER BY created_at DESC LIMIT 1;"

# Check nodes were created
psql postgresql://learning_helper:learning_helper_dev@localhost:5432/learning_helper \
  -c "SELECT plan_id, node_id, title FROM nodes LIMIT 10;"
```

### Implementation Details

**Prompt Template (plan/v1.txt)**:
```
You are a curriculum designer creating a learning roadmap.

## Task
Create a structured learning plan for the topic: {topic}
User level: {user_level}

## Output Requirements
- Return ONLY valid JSON (no markdown, no code fences)
- Follow the exact schema below
- Generate 4-30 nodes depending on topic complexity
- Each node must have unique node_id (snake_case, 3-100 chars)
- Prerequisites must reference existing node_ids
- No circular dependencies allowed
- Schedule must cover all nodes exactly once in topological order

## Schema
{schema_json}

## Example Output
{example_json}

## Quality Criteria
GOOD: Clear learning progression, appropriate granularity, realistic time estimates (5-240 mins per node)
BAD: Not respecting node limits, circular dependencies, vague objectives, self-prerequisites
```

**DAG Validation Algorithm**:
```typescript
// apps/api-node/src/validation/semantic/dag.validator.ts

interface Node {
  node_id: string;
  prerequisites: string[];
}

interface DAGValidationResult {
  valid: boolean;
  cycle?: string[];
  error?: string;
}

export function validateDAG(nodes: Node[]): DAGValidationResult {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const nodeMap = new Map(nodes.map(n => [n.node_id, n]));

  // Check all prerequisites reference existing nodes
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (!nodeMap.has(prereq)) {
        return {
          valid: false,
          error: `Node "${node.node_id}" has prerequisite "${prereq}" which does not exist`
        };
      }
    }
    // Check no self-prerequisites
    if (node.prerequisites.includes(node.node_id)) {
      return {
        valid: false,
        error: `Node "${node.node_id}" has itself as a prerequisite`
      };
    }
  }

  function dfs(nodeId: string, path: string[]): string[] | null {
    if (recursionStack.has(nodeId)) {
      return [...path, nodeId]; // Cycle found
    }
    if (visited.has(nodeId)) return null;

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = nodeMap.get(nodeId);
    for (const prereq of node?.prerequisites || []) {
      const cycle = dfs(prereq, [...path, nodeId]);
      if (cycle) return cycle;
    }

    recursionStack.delete(nodeId);
    return null;
  }

  for (const node of nodes) {
    const cycle = dfs(node.node_id, []);
    if (cycle) {
      return { valid: false, cycle };
    }
  }

  return { valid: true };
}
```

**Retry Logic**:
```python
# apps/curriculum-python/src/utils/retry.py

import asyncio
from typing import TypeVar, Type
from pydantic import BaseModel, ValidationError

T = TypeVar('T', bound=BaseModel)

async def validate_with_retry(
    generate_fn,  # async () -> str (raw LLM output)
    model_class: Type[T],
    max_retries: int = 2
) -> tuple[T, int]:
    """
    Attempt to generate and validate LLM output.
    Returns (validated_model, retry_count).
    Raises ValidationError if all retries fail.
    """
    last_error = None

    for attempt in range(max_retries + 1):
        raw_output = await generate_fn()

        try:
            # Try to parse JSON
            import json
            data = json.loads(raw_output)

            # Validate with Pydantic
            validated = model_class.model_validate(data)
            return validated, attempt

        except (json.JSONDecodeError, ValidationError) as e:
            last_error = e
            if attempt < max_retries:
                # Could add exponential backoff here
                await asyncio.sleep(0.5 * (attempt + 1))
                continue

    raise last_error
```

---

## Phase 2: Wire YouTube Resources

**Goal**: Connect existing YouTube service to database persistence and Redis caching.

**What Already Exists**:
- `youtube.service.ts` (397 lines) - search, ranking, validation
- `curriculum-client.ts` (253 lines) - calls Python for transcript validation
- `plan.routes.ts` has `POST /api/plan/:planId/resources`

**What's Missing**: Database persistence, Redis caching

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 2.1 | Redis client | `apps/api-node/src/db/redis.ts` | ioredis connection |
| 2.2 | Resource database queries | `apps/api-node/src/db/queries/resources.ts` | INSERT/SELECT |
| 2.3 | Add Redis caching to YouTube service | `apps/api-node/src/services/youtube.service.ts` | 7-30 day TTL |
| 2.4 | Persist resources in plan.routes.ts | `apps/api-node/src/routes/plan.routes.ts` | Call db after attachment |
| 2.5 | Query suggestions endpoint (optional) | `apps/curriculum-python/src/api/queries.py` | LLM-suggested queries |
| 2.6 | Query suggestions prompt | `apps/curriculum-python/src/prompts/queries/v1.txt` | |

### Exit Criteria
- [ ] Resources are persisted to `resources` table after attachment
- [ ] Second request for same search uses Redis cache
- [ ] YouTube quota usage is logged

### Existing Ranking Algorithm (Reference)
The ranking algorithm is already implemented in `youtube.service.ts`:
```typescript
// Weights (already implemented):
// 40% relevance score (from LLM validation)
// 20% engagement ratio (likes/views)
// 15% duration appropriateness
// 15% objective coverage
// 10% recency bonus
```

---

## Phase 3: Authentication

**Goal**: Users can sign in with Google and access protected endpoints.

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 3.1 | Google OAuth credentials | Google Cloud Console | Get client ID/secret |
| 3.2 | JWT utilities | `apps/api-node/src/utils/jwt.ts` | Sign/verify tokens |
| 3.3 | Auth service | `apps/api-node/src/services/auth.service.ts` | OAuth flow |
| 3.4 | Auth routes | `apps/api-node/src/routes/auth.routes.ts` | /auth/* endpoints |
| 3.5 | Auth middleware | `apps/api-node/src/middleware/auth.middleware.ts` | JWT verification |
| 3.6 | User database queries | `apps/api-node/src/db/queries/users.ts` | Upsert user |
| 3.7 | Token database queries | `apps/api-node/src/db/queries/tokens.ts` | Refresh tokens |
| 3.8 | Redis token blacklist | `apps/api-node/src/db/redis.ts` | Add to existing |
| 3.9 | Protect plan routes | `apps/api-node/src/routes/plan.routes.ts` | Add auth middleware |

### Exit Criteria
- [ ] `GET /auth/google` redirects to Google OAuth
- [ ] `POST /auth/callback` exchanges code for tokens
- [ ] `POST /auth/refresh` issues new access token
- [ ] `POST /auth/logout` revokes refresh token
- [ ] Protected routes return 401 without valid JWT

### Verification
```bash
# Test protected route without token
curl http://localhost:3000/api/plan
# Should return 401

# Test with token
curl http://localhost:3000/api/plan \
  -H "Authorization: Bearer <access_token>"
# Should return plans or empty array
```

---

## Phase 4: Exercises & Grading

**Goal**: Generate exercises for nodes and grade user answers with mastery tracking.

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 4.1 | Exercise prompt template | `apps/curriculum-python/src/prompts/exercises/v1.txt` | |
| 4.2 | POST /llm/exercises | `apps/curriculum-python/src/api/exercises.py` | Discriminated union |
| 4.3 | Grade prompt template | `apps/curriculum-python/src/prompts/grade/v1.txt` | Low temperature (0.2) |
| 4.4 | POST /llm/grade | `apps/curriculum-python/src/api/grade.py` | |
| 4.5 | Exercise service | `apps/api-node/src/services/exercise.service.ts` | |
| 4.6 | Mastery service | `apps/api-node/src/services/mastery.service.ts` | Calculate score |
| 4.7 | Exercise routes | `apps/api-node/src/routes/exercise.routes.ts` | GET/POST exercises |
| 4.8 | Mastery routes | `apps/api-node/src/routes/mastery.routes.ts` | POST /api/attempts |
| 4.9 | Exercise database queries | `apps/api-node/src/db/queries/exercises.ts` | |
| 4.10 | Mastery database queries | `apps/api-node/src/db/queries/mastery.ts` | |

### Exit Criteria
- [ ] Can generate exercises via `POST /api/plan/:id/nodes/:nodeId/exercises`
- [ ] All requested exercise types are present in response
- [ ] Can submit answer via `POST /api/attempts`
- [ ] Grade includes score, is_correct, feedback, misconceptions
- [ ] Mastery score updates after each attempt

### Mastery Calculation
```typescript
function calculateMastery(
  recentAttempts: Attempt[],  // Last 5 attempts
  allAttempts: Attempt[],     // All attempts for this node
  maxDifficultyCompleted: number
): number {
  const recentAccuracy = recentAttempts.length > 0
    ? recentAttempts.filter(a => a.is_correct).length / recentAttempts.length
    : 0;

  const historicalAccuracy = allAttempts.length > 0
    ? allAttempts.filter(a => a.is_correct).length / allAttempts.length
    : 0;

  const difficultyBonus = maxDifficultyCompleted / 5;

  return (
    recentAccuracy * 0.6 +
    historicalAccuracy * 0.3 +
    difficultyBonus * 0.1
  );
}

function masteryToDifficulty(mastery: number): number {
  if (mastery < 0.2) return 1;
  if (mastery < 0.4) return 2;
  if (mastery < 0.6) return 3;
  if (mastery < 0.8) return 4;
  return 5;
}
```

---

## Phase 5: Recommendations & Evaluation

**Goal**: Smart next-step recommendations and quality measurement.

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 5.1 | Next-node algorithm | `apps/api-node/src/services/mastery.service.ts` | Add to existing |
| 5.2 | GET /api/plan/:id/next | `apps/api-node/src/routes/mastery.routes.ts` | |
| 5.3 | Golden topics dataset | `eval/golden_topics.json` | 10-30 topics |
| 5.4 | Evaluation harness | `eval/run.py` | Metrics collection |
| 5.5 | Schema validity metrics | `eval/run.py` | First try vs retry |
| 5.6 | DAG validity metrics | `eval/run.py` | All plans valid |

### Exit Criteria
- [ ] `GET /api/plan/:id/next` returns best next node
- [ ] Nodes with unmet prerequisites are not recommended
- [ ] Evaluation harness runs against golden topics
- [ ] Metrics: >95% schema validity (first try)
- [ ] Metrics: 100% DAG validity

### Next-Node Algorithm
```typescript
function getNextNode(
  plan: Plan,
  masteryByNode: Map<string, number>
): { nodeId: string; rationale: string } | null {
  const scheduleOrder = new Map(plan.schedule.map(s => [s.node_id, s.order]));

  // Filter to nodes where all prerequisites are met (mastery >= 0.6)
  const unlockedNodes = plan.nodes.filter(node => {
    return node.prerequisites.every(prereq =>
      (masteryByNode.get(prereq) || 0) >= 0.6
    );
  });

  if (unlockedNodes.length === 0) return null;

  // Score each unlocked node
  const scored = unlockedNodes.map(node => {
    const mastery = masteryByNode.get(node.node_id) || 0;
    let score = 0;

    // Prefer partial progress (0.1-0.7)
    if (mastery > 0.1 && mastery < 0.7) {
      score += 10;
    }
    // Deprioritize not started
    if (mastery === 0) {
      score += 5;
    }
    // Deprioritize mastered
    if (mastery >= 0.8) {
      score -= 10;
    }
    // Use schedule order as tiebreaker
    score -= (scheduleOrder.get(node.node_id) || 0) * 0.01;

    return { node, score };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  return {
    nodeId: best.node.node_id,
    rationale: generateRationale(best.node, masteryByNode.get(best.node.node_id) || 0)
  };
}
```

---

## Phase 6: Polish & Deployment

**Goal**: Production-ready system with proper operational tooling.

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 6.1 | Rate limiting middleware | `apps/api-node/src/middleware/rate-limit.middleware.ts` | Redis-backed |
| 6.2 | Admin endpoints | `apps/api-node/src/routes/admin.routes.ts` | Cache invalidation |
| 6.3 | Error handling improvements | Both services | Consistent format |
| 6.4 | Health check enhancements | Both services | DB/Redis connectivity |
| 6.5 | Dockerfile for Node | `apps/api-node/Dockerfile` | Multi-stage |
| 6.6 | Dockerfile for Python | `apps/curriculum-python/Dockerfile` | |
| 6.7 | Production docker-compose | `infra/docker-compose.prod.yml` | |
| 6.8 | Python structured logging | `apps/curriculum-python/src/utils/logger.py` | structlog |

### Exit Criteria
- [ ] Rate limiting prevents abuse (429 responses)
- [ ] Admin can invalidate YouTube cache
- [ ] All errors return consistent JSON format
- [ ] Health endpoints check all dependencies
- [ ] Docker images build and run

---

## Phase 7: Complete Caching & Staleness

**Goal**: Finish the partially-built caching and staleness detection system.

**What Already Exists**:
- `POST /llm/check-staleness` endpoint (complete)
- `POST /llm/validate-video` endpoint (complete)
- `POST /llm/transcript` endpoint (complete)
- `plan-cache.service.ts` (staleness logic)
- Prompts for staleness and video validation

**What's Missing**: Topic normalization, MCP integration, quality aggregation

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 7.1 | Topic normalization prompt | `apps/curriculum-python/src/prompts/normalize/v1.txt` | |
| 7.2 | POST /llm/normalize-topic | `apps/curriculum-python/src/api/normalize.py` | |
| 7.3 | MCP integration | `apps/curriculum-python/src/mcp/` | FastMCP SDK |
| 7.4 | Quality signal aggregation | `apps/api-node/src/jobs/quality-signals.ts` | Daily cron |
| 7.5 | Cache invalidation triggers | `apps/api-node/src/services/plan-cache.service.ts` | Add to existing |
| 7.6 | Redis hot cache layer | `apps/api-node/src/db/redis.ts` | 24h TTL |
| 7.7 | Admin force-invalidate | `apps/api-node/src/routes/admin.routes.ts` | Add to existing |

### Exit Criteria
- [ ] Topics are normalized via LLM (handles typos, free-text)
- [ ] Same normalized topic+level returns cached plan
- [ ] MCP queries Context7 for freshness
- [ ] Cache invalidated when thresholds exceeded

### Topic Normalization Prompt
```
You are a topic normalization assistant for an educational platform.

## Task
Given a user's free-text topic request, return:
1. topic_normalized: canonical form (lowercase, proper spacing, corrected typos)
2. domain_category: one of the predefined categories
3. staleness_policy: derived from category

## Categories
- math/fundamentals (policy: never)
- cs/theory (policy: annual)
- networking/protocols (policy: 90d)
- cloud/infrastructure (policy: 30d)
- web/frameworks (policy: 14d)
- ai/ml (policy: 7d)
- general (policy: 30d)

## Input
{topic}

## Output (JSON only)
{"topic_normalized": "...", "domain_category": "...", "staleness_policy": "..."}
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM output inconsistency | High | High | Strict schema validation, 2 retries, prompt iteration |
| YouTube quota exhaustion | Medium | High | Aggressive caching (7-30 days), quota monitoring |
| OAuth configuration errors | Medium | Medium | Test with mock OAuth first, clear documentation |
| Schema drift between services | Medium | High | Automated schema generation, contract tests |
| Grading inconsistency | Medium | Medium | Low temperature, caching same-answer grades |

---

## Success Metrics

### Technical
| Metric | Target | Measurement |
|--------|--------|-------------|
| Schema validity (first try) | >95% | Evaluation harness |
| DAG validity | 100% | Evaluation harness |
| Plan generation p95 | <2s | Load test |
| Grading p95 | <500ms | Load test |
| YouTube cache hit rate | >80% | Redis metrics |

### Quality
| Metric | Target | Measurement |
|--------|--------|-------------|
| Exercise completion rate | >70% | Database analytics |
| Next-step acceptance | >80% | User tracking |
| Grading issue rate | <10% | User feedback |

---

## Appendix: File Checklist

### Python Service - What Needs Implementation
- [ ] `src/prompts/plan/v1.txt` - Plan generation prompt
- [ ] `src/prompts/exercises/v1.txt` - Exercise generation prompt
- [ ] `src/prompts/grade/v1.txt` - Grading prompt
- [ ] `src/prompts/queries/v1.txt` - Query suggestions prompt
- [ ] `src/prompts/normalize/v1.txt` - Topic normalization prompt
- [ ] `src/api/plan.py` - Plan generation endpoint
- [ ] `src/api/exercises.py` - Exercise generation endpoint
- [ ] `src/api/grade.py` - Grading endpoint
- [ ] `src/api/queries.py` - Query suggestions endpoint
- [ ] `src/api/normalize.py` - Topic normalization endpoint
- [ ] `src/utils/retry.py` - Validation retry logic
- [ ] `src/utils/logger.py` - Structured logging (structlog)

### Node Service - What Needs Implementation
- [ ] `src/db/client.ts` - Postgres connection pool
- [ ] `src/db/redis.ts` - Redis connection
- [ ] `src/db/queries/plans.ts` - Plan CRUD queries
- [ ] `src/db/queries/resources.ts` - Resource queries
- [ ] `src/db/queries/exercises.ts` - Exercise queries
- [ ] `src/db/queries/mastery.ts` - Mastery queries
- [ ] `src/db/queries/users.ts` - User queries
- [ ] `src/db/queries/tokens.ts` - Token queries
- [ ] `src/validation/schemas/validator.ts` - AJV setup
- [ ] `src/validation/semantic/dag.validator.ts` - DAG validation
- [ ] `src/validation/semantic/prereq.validator.ts` - Prerequisite validation
- [ ] `src/validation/input/plan.ts` - Zod schemas
- [ ] `src/services/plan.service.ts` - Plan orchestration
- [ ] `src/services/exercise.service.ts` - Exercise handling
- [ ] `src/services/mastery.service.ts` - Mastery calculation
- [ ] `src/services/auth.service.ts` - OAuth logic
- [ ] `src/routes/plan.routes.ts` - Add POST /api/plan (file exists, needs route)
- [ ] `src/routes/auth.routes.ts` - OAuth endpoints
- [ ] `src/routes/exercise.routes.ts` - Exercise endpoints
- [ ] `src/routes/mastery.routes.ts` - Mastery endpoints
- [ ] `src/middleware/auth.middleware.ts` - JWT verification
- [ ] `src/middleware/rate-limit.middleware.ts` - Rate limiting
- [ ] `src/utils/jwt.ts` - JWT utilities

### Already Complete (Do Not Reimplement)
**Python:**
- ✅ All models in `src/models/`
- ✅ `src/providers/base.py`, `gemini.py`, `claude.py`
- ✅ `src/utils/transcripts.py`, `prompts.py`, `hashing.py`
- ✅ `src/api/transcript.py`, `validate_video.py`, `staleness.py`
- ✅ `src/prompts/validate_video/v1.txt`, `staleness/v1.txt`

**Node:**
- ✅ `src/services/youtube.service.ts`
- ✅ `src/services/curriculum-client.ts`
- ✅ `src/services/plan-cache.service.ts`
- ✅ `src/utils/logger.ts`
- ✅ `src/routes/plan.routes.ts` (resource attachment only)

---

*Last updated: January 2026 (Post codebase review)*
