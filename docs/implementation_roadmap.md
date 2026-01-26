# Implementation Roadmap - Learning Helper

> **For AI Coding Agents**: This roadmap reflects the ACTUAL state of the codebase as of January 2026. Read the "What's Already Built" section carefully before implementing anything.

---

## Executive Summary

**Current Status (January 2026):**
- ✅ **Phase 1: Plan Generation** - COMPLETE
- ✅ **Phase 2: YouTube Resources** - COMPLETE
- ✅ **Phase 3: Authentication** - COMPLETE
- ✅ **Phase 4: Exercises & Grading** - COMPLETE
- ❌ **Phases 5-7** - Not started

**Overall Progress: ~70% complete** (core plan generation, resource attachment, authentication, and exercises/grading working end-to-end)

**Next Priority**: Phase 5 (Recommendations & Evaluation)

### Key Principles
1. **Schema-first**: Pydantic models are the source of truth; everything flows from them
2. **Incremental delivery**: Each phase produces testable, demonstrable functionality
3. **Don't duplicate work**: Many services already exist—wire them up, don't rewrite

### Skills Reference

Use the appropriate skill when working on each service:

| Skill | When to Use | Service |
|-------|-------------|---------|
| `/curriculum-skill` | LLM integration, Pydantic models, prompts, FastAPI endpoints | `apps/curriculum-python/` |
| `/orchestrator-skill` | Public API, database, validation, services, routes | `apps/api-node/` |

**Phase-to-Skill Mapping**:
| Phase | Primary Skill(s) |
|-------|------------------|
| Phase 1 | Both (Python: prompts, api; Node: db, validation, service, routes) |
| Phase 2 | Primarily `/orchestrator-skill` (Node: redis, resources) |
| Phase 3 | `/orchestrator-skill` only (Node: auth) |
| Phase 4 | Both (Python: exercises, grade; Node: services, routes) |
| Phase 5 | Both (Node: mastery; Python: eval harness) |
| Phase 6 | Both (deployment, logging) |
| Phase 7 | Both (Python: normalize, MCP; Node: cache, admin) |

---

## What's Already Built

**READ THIS SECTION BEFORE IMPLEMENTING ANYTHING.**

### Infrastructure (100% Complete)
| Component | Location | Status |
|-----------|----------|--------|
| Docker Compose | `infra/docker-compose.yml` | ✅ Postgres 15 + Redis 7 configured |
| Database schema | `infra/postgres/init.sql` | ✅ Core tables created (plans, nodes, resources, exercises, attempts, user_mastery, users, refresh_tokens, llm_calls). Phase 3 adds: `roles` column to users, `user_plans` junction table |
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

**Utilities (100% Complete)**:
| Utility | File | Status |
|---------|------|--------|
| Transcript fetcher | `src/utils/transcripts.py` | ✅ 192 lines, youtube-transcript-api |
| Prompt loader | `src/utils/prompts.py` | ✅ 44 lines, LRU cached |
| Hashing | `src/utils/hashing.py` | ✅ 28 lines, SHA-256 |
| Logger | `src/utils/logger.py` | ✅ Uses Python logging module |
| Retry logic | `src/utils/retry.py` | ✅ 216 lines, retry with validation |

**API Endpoints (Partial)**:
| Endpoint | File | Status |
|----------|------|--------|
| POST /llm/transcript | `src/api/transcript.py` | ✅ 63 lines |
| POST /llm/validate-video | `src/api/validate_video.py` | ✅ 150 lines |
| POST /llm/check-staleness | `src/api/staleness.py` | ✅ 197 lines |
| POST /llm/plan | `src/api/plan.py` | ✅ 179 lines, full implementation |
| POST /llm/exercises | `src/api/exercises.py` | ✅ Full implementation with web search |
| POST /llm/grade | `src/api/grade.py` | ✅ Full implementation (local + LLM grading) |
| POST /llm/queries | `src/api/queries.py` | ❌ Empty skeleton |

**Utilities (100% Complete)**:
| Utility | File | Status |
|---------|------|--------|
| Transcript fetcher | `src/utils/transcripts.py` | ✅ 192 lines, youtube-transcript-api |
| Prompt loader | `src/utils/prompts.py` | ✅ 44 lines, LRU cached |
| Hashing | `src/utils/hashing.py` | ✅ 28 lines, SHA-256 |
| Logger | `src/utils/logger.py` | ✅ Uses Python logging module |
| Retry logic | `src/utils/retry.py` | ✅ 216 lines, retry with validation |
| Web search | `src/utils/web_search.py` | ✅ Google CSE integration with graceful degradation |

**Prompts (Partial)**:
| Prompt | File | Status |
|--------|------|--------|
| validate_video/v1 | `src/prompts/validate_video/v1.txt` | ✅ 80 lines |
| staleness/v1 | `src/prompts/staleness/v1.txt` | ✅ 89 lines |
| plan/v1 | `src/prompts/plan/v1.txt` | ✅ 65 lines |
| exercises/v1 | `src/prompts/exercises/v1.txt` | ✅ Full prompt with all exercise types |
| grade/v1 | `src/prompts/grade/v1.txt` | ✅ Full prompt with rubric-based grading |
| queries/v1 | `src/prompts/queries/v1.txt` | ❌ Empty |

### Node Service - Orchestrator (`apps/api-node/`)

**Services (Partial)**:
| Service | File | Status |
|---------|------|--------|
| YouTube integration | `src/services/youtube.service.ts` | ✅ 397 lines, ranking algorithm |
| Curriculum client | `src/services/curriculum-client.ts` | ✅ Extended with exercises/grade methods |
| Plan cache | `src/services/plan-cache.service.ts` | ✅ 250 lines, staleness logic |
| Logger | `src/utils/logger.ts` | ✅ 20 lines, pino |
| Plan service | `src/services/plan.service.ts` | ✅ 255 lines, full orchestration |
| Auth service | `src/services/auth.service.ts` | ✅ ~280 lines, Google OAuth + PKCE |
| Exercise service | `src/services/exercise.service.ts` | ✅ Full implementation with caching |
| Mastery service | `src/services/mastery.service.ts` | ✅ Full implementation with weighted scoring |

**Routes (Partial)**:
| Route | File | Status |
|-------|------|--------|
| POST /api/plan | `src/routes/plan.routes.ts` | ✅ Protected, full CRUD + resources |
| GET /api/plan/:planId | `src/routes/plan.routes.ts` | ✅ Protected, included above |
| POST /api/plan/:planId/resources | `src/routes/plan.routes.ts` | ✅ Protected, included above |
| GET /api/plan/:planId/resources | `src/routes/plan.routes.ts` | ✅ Protected, included above |
| GET /auth/google | `src/routes/auth.routes.ts` | ✅ OAuth initiation |
| POST /auth/callback | `src/routes/auth.routes.ts` | ✅ Code exchange |
| POST /auth/refresh | `src/routes/auth.routes.ts` | ✅ Token refresh |
| POST /auth/logout | `src/routes/auth.routes.ts` | ✅ Token revocation |
| POST /api/plan/:id/nodes/:nodeId/exercises | `src/routes/exercise.routes.ts` | ✅ Generate exercises |
| GET /api/plan/:id/nodes/:nodeId/exercises | `src/routes/exercise.routes.ts` | ✅ Get exercises |
| POST /api/attempts | `src/routes/mastery.routes.ts` | ✅ Submit and grade answer |
| GET /api/plan/:id/nodes/:nodeId/mastery | `src/routes/mastery.routes.ts` | ✅ Get node mastery |
| GET /api/plan/:id/mastery | `src/routes/mastery.routes.ts` | ✅ Get plan mastery overview |

**Database Queries (Updated)**:
| Component | File | Status |
|-----------|------|--------|
| Postgres client | `src/db/client.ts` | ✅ 142 lines, pool + transactions |
| Redis client | `src/db/redis.ts` | ✅ ~220 lines, fail-open caching + auth (blacklist, PKCE) |
| Plan queries | `src/db/queries/plans.ts` | ✅ 194 lines, full CRUD |
| Resource queries | `src/db/queries/resources.ts` | ✅ Complete |
| User queries | `src/db/queries/users.ts` | ✅ ~85 lines, upsert/get by id/email |
| Token queries | `src/db/queries/tokens.ts` | ✅ ~95 lines, SHA-256 hashed storage |
| User-plans queries | `src/db/queries/user-plans.ts` | ✅ ~100 lines, junction table |
| Exercise queries | `src/db/queries/exercises.ts` | ✅ Full CRUD with transaction support |
| Mastery queries | `src/db/queries/mastery.ts` | ✅ Attempts + mastery tracking |

**Database & Validation (100% Complete)**:
| Component | File | Status |
|-----------|------|--------|
| Postgres client | `src/db/client.ts` | ✅ 142 lines, pool + transactions |
| Redis client | `src/db/redis.ts` | ✅ ~220 lines, fail-open caching + auth (blacklist, PKCE) |
| Plan queries | `src/db/queries/plans.ts` | ✅ 194 lines, full CRUD |
| Resource queries | `src/db/queries/resources.ts` | ✅ Complete |
| User queries | `src/db/queries/users.ts` | ✅ ~85 lines, upsert/get by id/email |
| Token queries | `src/db/queries/tokens.ts` | ✅ ~95 lines, SHA-256 hashed storage |
| User-plans queries | `src/db/queries/user-plans.ts` | ✅ ~100 lines, junction table |
| AJV validators | `src/validation/schemas/validator.ts` | ✅ 181 lines, all schemas |
| DAG validator | `src/validation/semantic/dag.validator.ts` | ✅ 149 lines, cycle detection |
| Prereq validator | `src/validation/semantic/prereq.validator.ts` | ✅ 107 lines |
| Input schemas (Zod) | `src/validation/schemas.ts` | ✅ ~120 lines, includes auth schemas |

**Auth & Middleware**:
| Component | File | Status |
|-----------|------|--------|
| JWT utilities | `src/utils/jwt.ts` | ✅ ~180 lines, sign/verify access+refresh |
| Auth middleware | `src/middleware/auth.middleware.ts` | ✅ ~170 lines, requireAuth/requireRole/optionalAuth |
| Rate limiting | `src/middleware/rate-limit.middleware.ts` | ❌ Empty |

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: PLAN GENERATION ✅ COMPLETE                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Python: prompts/plan/v1.txt + api/plan.py + utils/retry.py         │    │
│  │  Node: db/client.ts + validation/* + plan.service.ts + routes       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌───────────────────────────────────────┬─────────────────────────────────────┐
│   PHASE 2: YOUTUBE RESOURCES ✅       │     PHASE 3: AUTHENTICATION ✅       │
│  ┌─────────────────────────────────┐  │  ┌─────────────────────────────────┐ │
│  │ ✅ Connect db/redis.ts          │  │  │ ✅ Google OAuth 2.0 + PKCE       │ │
│  │ ✅ Resource persistence queries │  │  │ ✅ JWT access/refresh tokens     │ │
│  │ ✅ Wire existing youtube.service│  │  │ ✅ Auth middleware               │ │
│  │ • Query suggestions endpoint    │  │  │ ✅ Protect plan routes           │ │
│  └─────────────────────────────────┘  │  └─────────────────────────────────┘ │
│                  │                    │                  │                    │
└──────────────────┼────────────────────┴──────────────────┼────────────────────┘
                   └──────────────────┬────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 4: EXERCISES & GRADING ❌                        │
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

## Phase 1: Plan Generation ✅ COMPLETE

**Goal**: Generate learning plans via LLM with full validation. THIS IS THE CORE FEATURE.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented and working end-to-end.

**Skills**: Use `/curriculum-skill` for Python tasks (1.1-1.3), `/orchestrator-skill` for Node tasks (1.4-1.11)

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
- [x] `curl -X POST localhost:3000/api/plan -d '{"topic": "Python basics", "user_level": "beginner"}'` returns a valid plan
- [x] Plan is persisted to Postgres (check `SELECT * FROM plans`)
- [x] DAG validation rejects cyclic prerequisites
- [x] Response includes full metadata (provider, model, prompt_version, hashes)

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

## Phase 2: Wire YouTube Resources ✅ COMPLETE

**Goal**: Connect existing YouTube service to database persistence and Redis caching.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented.

**Skills**: Use `/orchestrator-skill` for Node tasks (2.1-2.4), `/curriculum-skill` for Python tasks (2.5-2.6)

**What's Implemented**:
- `youtube.service.ts` (397 lines) - search, ranking, validation
- `curriculum-client.ts` (253 lines) - calls Python for transcript validation
- `plan.routes.ts` has full resource CRUD (POST + GET)
- `db/redis.ts` (149 lines) - Redis caching with fail-open
- `db/queries/resources.ts` - Resource persistence

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
- [x] Resources are persisted to `resources` table after attachment
- [x] Redis caching implemented with fail-open behavior
- [x] YouTube quota usage is logged

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

## Phase 3: Authentication ✅ COMPLETE

**Goal**: Users can sign in with Google and access protected endpoints.

**Status**: ✅ **PHASE COMPLETE** - Google OAuth 2.0 with PKCE flow implemented.

**Skills**: Use `/orchestrator-skill` for all tasks (Node-only phase)

### Architecture Notes

**Plan Access Model**: Plans are shared content (cached by topic+level). There are NO ownership checks—any authenticated user can access any plan. The `user_plans` junction table tracks which users are engaging with which plans, enabling "my plans" features without restricting access.

**Token Strategy**:
- Access JWT: 15-min expiry, contains `user_id`, `email`, `roles[]`
- Refresh JWT: 7-day expiry, stored hashed in Postgres, revocable
- PKCE flow for SPA security (code_verifier stored server-side in Redis)

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 3.1 | Google OAuth credentials | Google Cloud Console | Get client ID/secret |
| 3.2 | JWT utilities | `apps/api-node/src/utils/jwt.ts` | ✅ Sign/verify tokens |
| 3.3 | Auth service | `apps/api-node/src/services/auth.service.ts` | ✅ OAuth flow with PKCE |
| 3.4 | Auth routes | `apps/api-node/src/routes/auth.routes.ts` | ✅ /auth/* endpoints |
| 3.5 | Auth middleware | `apps/api-node/src/middleware/auth.middleware.ts` | ✅ JWT verification |
| 3.6 | User database queries | `apps/api-node/src/db/queries/users.ts` | ✅ Upsert user with roles |
| 3.7 | Token database queries | `apps/api-node/src/db/queries/tokens.ts` | ✅ Refresh tokens (hashed) |
| 3.8 | Redis token blacklist | `apps/api-node/src/db/redis.ts` | ✅ Added blacklist + PKCE state |
| 3.9 | Protect plan routes | `apps/api-node/src/routes/plan.routes.ts` | ✅ Added auth middleware |
| 3.10 | User-plans junction queries | `apps/api-node/src/db/queries/user-plans.ts` | ✅ Track user↔plan engagement |
| 3.11 | Database schema changes | `infra/postgres/init.sql` | ✅ Already has `roles` column + `user_plans` table |

### Exit Criteria
- [x] `GET /auth/google` returns Google OAuth URL
- [x] `POST /auth/callback` exchanges code for tokens
- [x] `POST /auth/refresh` issues new access token
- [x] `POST /auth/logout` revokes refresh token
- [x] Protected routes return 401 without valid JWT
- [x] User engagement tracked in `user_plans` table on plan access

### Verification
```bash
# Test protected route without token
curl http://localhost:3000/api/plan
# Should return 401

# Get OAuth URL
curl http://localhost:3000/auth/google
# Returns { authorization_url, state }

# After OAuth flow, test with token
curl http://localhost:3000/api/plan \
  -H "Authorization: Bearer <access_token>"
# Should return plans or 201 on POST
```

### Environment Variables Required
```env
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
JWT_SECRET=<32+ char secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

---

## Phase 4: Exercises & Grading ✅ COMPLETE

**Goal**: Generate exercises for nodes and grade user answers with mastery tracking.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented.

**Skills**: Use `/curriculum-skill` for Python tasks (4.1-4.4), `/orchestrator-skill` for Node tasks (4.5-4.10)

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 4.1 | Exercise prompt template | `apps/curriculum-python/src/prompts/exercises/v1.txt` | ✅ All 5 exercise types |
| 4.2 | POST /llm/exercises | `apps/curriculum-python/src/api/exercises.py` | ✅ With web search inspiration |
| 4.3 | Grade prompt template | `apps/curriculum-python/src/prompts/grade/v1.txt` | ✅ Low temperature (0.3) |
| 4.4 | POST /llm/grade | `apps/curriculum-python/src/api/grade.py` | ✅ Local + LLM grading |
| 4.5 | Exercise service | `apps/api-node/src/services/exercise.service.ts` | ✅ With caching support |
| 4.6 | Mastery service | `apps/api-node/src/services/mastery.service.ts` | ✅ Weighted scoring |
| 4.7 | Exercise routes | `apps/api-node/src/routes/exercise.routes.ts` | ✅ GET/POST exercises |
| 4.8 | Mastery routes | `apps/api-node/src/routes/mastery.routes.ts` | ✅ POST /api/attempts |
| 4.9 | Exercise database queries | `apps/api-node/src/db/queries/exercises.ts` | ✅ Full CRUD |
| 4.10 | Mastery database queries | `apps/api-node/src/db/queries/mastery.ts` | ✅ Attempts + mastery |
| 4.11 | Web search utility | `apps/curriculum-python/src/utils/web_search.py` | ✅ Google CSE |

### Exit Criteria
- [x] Can generate exercises via `POST /api/plan/:id/nodes/:nodeId/exercises`
- [x] All 5 exercise types supported (mcq, short_answer, fill_blank, coding, flashcard)
- [x] Can submit answer via `POST /api/attempts`
- [x] Grade includes score, is_correct, feedback, misconceptions
- [x] Mastery score updates after each attempt
- [x] MCQ and flashcard graded locally (no LLM call)
- [x] Cached exercises returned on repeat requests
- [x] `?force=true` regenerates exercises

### MCP Migration Note (Phase 7)
After completing Phase 7 MCP integration, revisit:
- `apps/curriculum-python/src/utils/web_search.py` - Replace Google CSE with MCP web search tool
- `apps/curriculum-python/src/api/exercises.py` - Use MCP tool calls for inspiration
- Look for `TODO (Phase 7 MCP Migration)` comments in the codebase

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

**Status**: ❌ **NOT STARTED**

**Skills**: Use `/orchestrator-skill` for Node tasks (5.1-5.2), `/curriculum-skill` for evaluation harness (5.3-5.6)

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

**Status**: ❌ **NOT STARTED**

**Skills**: Use `/orchestrator-skill` for Node tasks (6.1-6.5, 6.7), `/curriculum-skill` for Python tasks (6.6, 6.8)

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

**Status**: ❌ **NOT STARTED**

**Skills**: Use `/curriculum-skill` for Python tasks (7.1-7.3), `/orchestrator-skill` for Node tasks (7.4-7.7)

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
- [x] `src/prompts/plan/v1.txt` - Plan generation prompt ✅
- [x] `src/prompts/exercises/v1.txt` - Exercise generation prompt ✅
- [x] `src/prompts/grade/v1.txt` - Grading prompt ✅
- [ ] `src/prompts/queries/v1.txt` - Query suggestions prompt
- [ ] `src/prompts/normalize/v1.txt` - Topic normalization prompt
- [x] `src/api/plan.py` - Plan generation endpoint ✅
- [x] `src/api/exercises.py` - Exercise generation endpoint ✅
- [x] `src/api/grade.py` - Grading endpoint ✅
- [ ] `src/api/queries.py` - Query suggestions endpoint
- [ ] `src/api/normalize.py` - Topic normalization endpoint
- [x] `src/utils/retry.py` - Validation retry logic ✅
- [x] `src/utils/logger.py` - Logging ✅
- [x] `src/utils/web_search.py` - Google CSE integration ✅

### Node Service - What Needs Implementation
- [x] `src/db/client.ts` - Postgres connection pool ✅
- [x] `src/db/redis.ts` - Redis connection + auth (blacklist, PKCE) ✅
- [x] `src/db/queries/plans.ts` - Plan CRUD queries ✅
- [x] `src/db/queries/resources.ts` - Resource queries ✅
- [x] `src/db/queries/exercises.ts` - Exercise queries ✅
- [x] `src/db/queries/mastery.ts` - Mastery queries ✅
- [x] `src/db/queries/users.ts` - User queries (with roles) ✅
- [x] `src/db/queries/tokens.ts` - Token queries (hashed storage) ✅
- [x] `src/db/queries/user-plans.ts` - User↔Plan junction table queries ✅
- [x] `src/validation/schemas/validator.ts` - AJV setup ✅
- [x] `src/validation/semantic/dag.validator.ts` - DAG validation ✅
- [x] `src/validation/semantic/prereq.validator.ts` - Prerequisite validation ✅
- [x] `src/validation/schemas.ts` - Zod schemas (includes auth + exercise schemas) ✅
- [x] `src/services/plan.service.ts` - Plan orchestration ✅
- [x] `src/services/exercise.service.ts` - Exercise handling ✅
- [x] `src/services/mastery.service.ts` - Mastery calculation ✅
- [x] `src/services/auth.service.ts` - OAuth logic ✅
- [x] `src/routes/plan.routes.ts` - Full CRUD + resources (protected) ✅
- [x] `src/routes/auth.routes.ts` - OAuth endpoints ✅
- [x] `src/routes/exercise.routes.ts` - Exercise endpoints ✅
- [x] `src/routes/mastery.routes.ts` - Mastery endpoints ✅
- [x] `src/middleware/auth.middleware.ts` - JWT verification ✅
- [ ] `src/middleware/rate-limit.middleware.ts` - Rate limiting
- [x] `src/utils/jwt.ts` - JWT utilities ✅

### Already Complete (Do Not Reimplement)
**Python:**
- ✅ All models in `src/models/`
- ✅ `src/providers/base.py`, `gemini.py`, `claude.py`
- ✅ `src/utils/transcripts.py`, `prompts.py`, `hashing.py`, `retry.py`, `web_search.py`
- ✅ `src/api/transcript.py`, `validate_video.py`, `staleness.py`, `plan.py`, `exercises.py`, `grade.py`
- ✅ `src/prompts/validate_video/v1.txt`, `staleness/v1.txt`, `plan/v1.txt`, `exercises/v1.txt`, `grade/v1.txt`

**Node:**
- ✅ `src/services/youtube.service.ts`
- ✅ `src/services/curriculum-client.ts` (includes exercises/grade methods)
- ✅ `src/services/plan-cache.service.ts`
- ✅ `src/services/plan.service.ts`
- ✅ `src/services/auth.service.ts` (Google OAuth + PKCE)
- ✅ `src/services/exercise.service.ts` (caching + LLM generation)
- ✅ `src/services/mastery.service.ts` (weighted scoring)
- ✅ `src/utils/logger.ts`
- ✅ `src/utils/jwt.ts` (sign/verify access+refresh tokens)
- ✅ `src/db/client.ts`, `redis.ts` (includes auth blacklist + PKCE state)
- ✅ `src/db/queries/plans.ts`, `resources.ts`, `exercises.ts`, `mastery.ts`
- ✅ `src/db/queries/users.ts`, `tokens.ts`, `user-plans.ts`
- ✅ `src/validation/schemas.ts` (includes auth + exercise schemas), `schemas/validator.ts`
- ✅ `src/validation/semantic/dag.validator.ts`, `prereq.validator.ts`
- ✅ `src/routes/plan.routes.ts` (full CRUD + resources, protected)
- ✅ `src/routes/auth.routes.ts` (OAuth endpoints)
- ✅ `src/routes/exercise.routes.ts` (generate + get exercises)
- ✅ `src/routes/mastery.routes.ts` (attempts + mastery tracking)
- ✅ `src/middleware/auth.middleware.ts` (JWT verification)

---

*Last updated: January 2026 (Phase 4 Exercises & Grading complete)*
