# Implementation Roadmap - Lucubrum

---

## Executive Summary

**Current Status (January 2026):**
- ✅ **Phase 1: Plan Generation** - COMPLETE
- ✅ **Phase 2: YouTube Resources** - COMPLETE
- ✅ **Phase 3: Authentication** - COMPLETE
- ✅ **Phase 4: Exercises & Grading** - COMPLETE
- ✅ **Phase 5: Recommendations & Evaluation** - COMPLETE
- ✅ **Phase 6: Polish & Deployment** - COMPLETE
- ✅ **Phase 7: Caching & Staleness Detection** - COMPLETE

**Overall Progress: 100% complete** (all planned phases implemented)

**Project Status**: FULLY IMPLEMENTED - Ready for production deployment and testing

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
| Docker Compose (dev) | `infra/docker-compose.yml` | ✅ Postgres 15 + Redis 7 configured |
| Docker Compose (prod) | `infra/docker-compose.prod.yml` | ✅ Full production setup |
| Dockerfile (Node) | `apps/api-node/Dockerfile` | ✅ Multi-stage build |
| Dockerfile (Python) | `apps/curriculum-python/Dockerfile` | ✅ Poetry-based build |
| Database schema | `infra/postgres/init.sql` | ✅ All tables including staleness_policies + quality_metrics (Phase 7) |
| JSON Schemas | `packages/contracts/schemas/` | ✅ 7 schemas exported |

### Evaluation Infrastructure (`eval/`)
| Component | Location | Status |
|-----------|----------|--------|
| Golden topics | `eval/golden_topics.json` | ✅ 10 topics across CS, Math, Physics, Business, Biology |
| Evaluation harness | `eval/run.py` | ✅ ~250 lines, schema + DAG validity metrics |
| Results directory | `eval/results/` | ✅ For evaluation output |
| Makefile target | `Makefile` | ✅ `make eval [TOPICS=N]` |

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

**Services (100% Complete)**:
| Service | File | Status |
|---------|------|--------|
| StalenessPolicyService | `src/services/staleness_policies.py` | ✅ DB-backed policies with cache (Phase 7) |
| FactsService | `src/mcp/facts.py` | ✅ Context7 + Brave Search integration (Phase 7) |

**API Endpoints (100% Complete)**:
| Endpoint | File | Status |
|----------|------|--------|
| POST /llm/transcript | `src/api/transcript.py` | ✅ 63 lines |
| POST /llm/validate-video | `src/api/validate_video.py` | ✅ 150 lines |
| POST /llm/check-staleness | `src/api/staleness.py` | ✅ 197 lines |
| POST /llm/plan | `src/api/plan.py` | ✅ 179 lines, full implementation |
| POST /llm/exercises | `src/api/exercises.py` | ✅ Full implementation with web search |
| POST /llm/grade | `src/api/grade.py` | ✅ Full implementation (local + LLM grading) |
| POST /llm/queries | `src/api/queries.py` | ✅ 183 lines, full implementation with retry |
| POST /llm/normalize-topic | `src/api/normalize.py` | ✅ Topic normalization with DB policies (Phase 7) |
| POST /llm/get-facts | `src/api/facts.py` | ✅ MCP fact gathering (Phase 7) |

**Middleware**:
| Middleware | File | Status |
|------------|------|--------|
| Service token auth | `src/middleware/service_auth.py` | ✅ ~75 lines, protects /llm/* endpoints |

**Prompts (100% Complete)**:
| Prompt | File | Status |
|--------|------|--------|
| validate_video/v1 | `src/prompts/validate_video/v1.txt` | ✅ 80 lines |
| staleness/v1 | `src/prompts/staleness/v1.txt` | ✅ 89 lines |
| plan/v1 | `src/prompts/plan/v1.txt` | ✅ 65 lines |
| exercises/v1 | `src/prompts/exercises/v1.txt` | ✅ Full prompt with all exercise types |
| grade/v1 | `src/prompts/grade/v1.txt` | ✅ Full prompt with rubric-based grading |
| queries/v1 | `src/prompts/queries/v1.txt` | ✅ 89 lines, full prompt with examples |
| normalize/v1 | `src/prompts/normalize/v1.txt` | ✅ Dynamic template with DB policy injection (Phase 7) |

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
| Mastery service | `src/services/mastery.service.ts` | ✅ Full implementation with weighted scoring + next-node recommendation |

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
| GET /api/plan/:id/next | `src/routes/mastery.routes.ts` | ✅ Get next node recommendation |
| DELETE /admin/cache/youtube | `src/routes/admin.routes.ts` | ✅ Invalidate YouTube cache |
| DELETE /admin/cache/plans | `src/routes/admin.routes.ts` | ✅ Invalidate plan cache |
| GET /admin/llm-calls | `src/routes/admin.routes.ts` | ✅ Query LLM call logs |
| GET /admin/metrics | `src/routes/admin.routes.ts` | ✅ System metrics |
| GET /admin/cache/stats | `src/routes/admin.routes.ts` | ✅ Redis cache statistics |
| DELETE /admin/cache/plans/:cacheKey | `src/routes/admin.routes.ts` | ✅ Direct cache key deletion (Phase 7) |
| GET /admin/staleness-policies | `src/routes/admin.routes.ts` | ✅ List all policies (Phase 7) |
| POST /admin/staleness-policies | `src/routes/admin.routes.ts` | ✅ Create new policy (Phase 7) |
| GET /admin/staleness-policies/:id | `src/routes/admin.routes.ts` | ✅ Get specific policy (Phase 7) |
| PUT /admin/staleness-policies/:id | `src/routes/admin.routes.ts` | ✅ Update policy (Phase 7) |
| DELETE /admin/staleness-policies/:id | `src/routes/admin.routes.ts` | ✅ Deactivate policy (Phase 7) |
| POST /admin/staleness-policies/reload | `src/routes/admin.routes.ts` | ✅ Force reload Python cache (Phase 7) |

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
| Staleness policies queries | `src/db/queries/staleness-policies.ts` | ✅ CRUD for policy management (Phase 7) |

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
| Rate limiting | `src/middleware/rate-limit.middleware.ts` | ✅ ~320 lines, Redis-backed sliding window |

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
psql postgresql://lucubrum:lucubrum_dev@localhost:5432/lucubrum \
  -c "SELECT plan_id, topic, user_level FROM plans ORDER BY created_at DESC LIMIT 1;"

# Check nodes were created
psql postgresql://lucubrum:lucubrum_dev@localhost:5432/lucubrum \
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

## Phase 5: Recommendations & Evaluation ✅ COMPLETE

**Goal**: Smart next-step recommendations and quality measurement.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented.

**Skills**: Use `/orchestrator-skill` for Node tasks (5.1-5.2), `/curriculum-skill` for evaluation harness (5.3-5.6)

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 5.1 | Next-node algorithm | `apps/api-node/src/services/mastery.service.ts` | ✅ Added getNextNode() method |
| 5.2 | GET /api/plan/:id/next | `apps/api-node/src/routes/mastery.routes.ts` | ✅ Recommendation endpoint |
| 5.3 | Golden topics dataset | `eval/golden_topics.json` | ✅ 10 topics across 5 fields |
| 5.4 | Evaluation harness | `eval/run.py` | ✅ Full implementation |
| 5.5 | Schema validity metrics | `eval/run.py` | ✅ First try + retry tracking |
| 5.6 | DAG validity metrics | `eval/run.py` | ✅ Cycle detection |

### Exit Criteria
- [x] `GET /api/plan/:id/next` returns best next node
- [x] Nodes with unmet prerequisites are not recommended
- [x] Evaluation harness runs against golden topics
- [x] Metrics: >95% schema validity (first try)
- [x] Metrics: 100% DAG validity

### Verification
```bash
# Get next node recommendation
curl http://localhost:3000/api/plan/{plan_id}/next \
  -H "Authorization: Bearer {token}"

# Run evaluation harness
make eval              # All topics
make eval TOPICS=3     # First 3 topics
```

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

## Phase 6: Polish & Deployment ✅ COMPLETE

**Goal**: Production-ready system with proper operational tooling.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented.

**Skills**: Use `/orchestrator-skill` for Node tasks (6.1-6.5, 6.7), `/curriculum-skill` for Python tasks (6.6, 6.8)

### Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 6.0 | Set up Poetry | `apps/curriculum-python/poetry.lock` | ✅ Lock file generated |
| 6.1 | Rate limiting middleware | `apps/api-node/src/middleware/rate-limit.middleware.ts` | ✅ Redis-backed sliding window |
| 6.2 | Admin endpoints | `apps/api-node/src/routes/admin.routes.ts` | ✅ Cache invalidation + metrics |
| 6.3 | Error handling improvements | Both services | ✅ Consistent format with timestamps |
| 6.4 | Health check enhancements | Both services | ✅ DB/Redis/Python service checks |
| 6.5 | Dockerfile for Node | `apps/api-node/Dockerfile` | ✅ Multi-stage |
| 6.6 | Dockerfile for Python | `apps/curriculum-python/Dockerfile` | ✅ Poetry-based |
| 6.7 | Production docker-compose | `infra/docker-compose.prod.yml` | ✅ With networking |
| 6.8 | Python structured logging | `apps/curriculum-python/src/utils/logger.py` | ✅ structlog JSON/console |
| 6.9 | Service token auth | `apps/curriculum-python/src/middleware/service_auth.py` | ✅ Protects /llm/* endpoints |
| 6.10 | Admin queries | `apps/api-node/src/db/queries/admin.ts` | ✅ LLM logs + metrics |

### Exit Criteria
- [x] Rate limiting prevents abuse (429 responses)
- [x] Admin can invalidate YouTube/plan cache
- [x] All errors return consistent JSON format with timestamps
- [x] Health endpoints check all dependencies
- [x] Docker images build and run
- [x] Service token auth protects Python /llm/* endpoints
- [x] Admin can view LLM call logs and system metrics

### Verification
```bash
# Test rate limiting (plan creation: 10/hour)
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/plan \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"topic": "test", "user_level": "beginner"}'
done
# Should see 429 after 10 requests

# Test service token auth
curl http://localhost:8000/llm/plan -X POST -d '{}'
# Expected: 401 (when SERVICE_TOKEN is set)

# Build and run Docker
docker-compose -f infra/docker-compose.prod.yml build
docker-compose -f infra/docker-compose.prod.yml up -d
```

---

## Phase 7: Caching & Staleness Detection ✅ COMPLETE

**Goal**: Complete the caching and staleness detection system with database-backed policy configuration.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented and working end-to-end.

**Skills**: Use `/curriculum-skill` for Python tasks (7.1-7.3), `/orchestrator-skill` for Node tasks (7.5-7.8)

**What Already Exists** (from Phase 6):
- `POST /llm/check-staleness` endpoint (complete)
- `POST /llm/validate-video` endpoint (complete)
- `POST /llm/transcript` endpoint (complete)
- `plan-cache.service.ts` (staleness logic)
- Prompts for staleness and video validation

**What Was Built** (Phase 7):
- Database-backed staleness policies (extensible - no redeployment needed)
- Topic normalization with LLM
- MCP fact gathering service (Context7 + Brave Search)
- Redis cache layer with fact snapshot storage
- Plan creation flow with normalization and caching
- Admin CRUD endpoints for staleness policies
- Quality metrics table for future analytics

### Tasks

| # | Task | File | Status |
|---|------|------|--------|
| 7.0 | Environment constants | `.env.example` | ✅ Complete |
| 7.0b | Staleness policies table | `infra/postgres/init.sql` | ✅ Complete |
| 7.1a | StalenessPolicyService | `apps/curriculum-python/src/services/staleness_policies.py` | ✅ Complete |
| 7.1 | Topic normalization prompt | `apps/curriculum-python/src/prompts/normalize/v1.txt` | ✅ Complete |
| 7.2 | POST /llm/normalize-topic | `apps/curriculum-python/src/api/normalize.py` | ✅ Complete |
| 7.3a | FastMCP SDK | `apps/curriculum-python/pyproject.toml` | ✅ Complete |
| 7.3b | MCP fact generation service | `apps/curriculum-python/src/mcp/facts.py` | ✅ Complete |
| 7.4 | GET /llm/get-facts endpoint | `apps/curriculum-python/src/api/facts.py` | ✅ Complete |
| 7.6a | CachedPlan.factSnapshot | `apps/api-node/src/services/plan-cache.service.ts` | ✅ Complete |
| 7.6b | Plan routes with caching | `apps/api-node/src/routes/plan.routes.ts` | ✅ Complete |
| 7.5 | Cache invalidation triggers | `apps/api-node/src/services/plan-cache.service.ts` | ✅ Complete |
| 7.7 | Admin cache invalidation | `apps/api-node/src/routes/admin.routes.ts` | ✅ Complete |
| 7.8 | Admin staleness policies CRUD | `apps/api-node/src/routes/admin.routes.ts` + queries | ✅ Complete |
| 7.0a | Register Python routers | `apps/curriculum-python/src/main.py` | ✅ Complete |

### Exit Criteria
- [x] Topics normalized via LLM (handles typos, free-text)
- [x] Same normalized topic+level returns cached plan
- [x] MCP queries Context7 + Brave Search for freshness
- [x] Cache stores plan + fact snapshot together
- [x] Cache invalidated when contradiction_rate >= threshold
- [x] Staleness policies stored in database (extensible)
- [x] Admin can manage policies via CRUD endpoints
- [x] Quality metrics table created for future analytics

### Key Features Implemented

**1. Database-Backed Staleness Policies**
- Policies stored in `staleness_policies` table with seed data
- `StalenessPolicyService` loads from DB with 5-minute cache TTL
- Admin can add new domains (e.g., "blockchain", "devops") without redeployment
- Initial policies: math/never, cs/annual, networking/90d, cloud/30d, web/14d, ai/7d, general/30d

**2. Topic Normalization**
- `POST /llm/normalize-topic` endpoint normalizes user input
- Returns: `topic_normalized`, `domain_category`, `staleness_policy`
- Policies dynamically injected into prompt from database
- LLM validates against known domain categories

**3. MCP Fact Gathering**
- `POST /llm/get-facts` endpoint combines Context7 + Brave Search
- Fail-open: if Context7 unavailable, uses Brave Search only
- Both sources combined, deduplicated, limited to ~10 facts
- Used for staleness detection (old vs new facts comparison)

**4. Redis Cache with Fact Snapshots**
- Cache key: `plan:{normalized_topic}:{user_level}`
- Stores: plan, topic_normalized, domain_category, staleness_policy, factSnapshot
- 24-hour TTL (plan cache)
- Fact snapshot used for staleness comparison

**5. Admin CRUD for Staleness Policies**
- `GET /admin/staleness-policies` - List all active policies
- `POST /admin/staleness-policies` - Create new policy
- `PUT /admin/staleness-policies/:id` - Update policy
- `DELETE /admin/staleness-policies/:id` - Deactivate policy
- `DELETE /admin/cache/plans?topic=xxx` - Topic-specific cache invalidation
- `DELETE /admin/cache/plans/:cacheKey` - Direct cache key deletion

### Database Schema Additions

**staleness_policies table**:
```sql
CREATE TABLE staleness_policies (
  id SERIAL PRIMARY KEY,
  domain_category VARCHAR(100) UNIQUE NOT NULL,
  policy_value VARCHAR(20) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**quality_metrics table** (for future use):
```sql
CREATE TABLE quality_metrics (
  plan_id UUID NOT NULL,
  normalized_topic VARCHAR(255) NOT NULL,
  sample_size INT NOT NULL,
  completion_rate FLOAT,
  exercise_pass_rate FLOAT,
  avg_time_ratio FLOAT,
  negative_feedback_rate FLOAT,
  measured_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (plan_id, measured_at)
);
```

### Verification
```bash
# 1. Test normalization
curl -X POST http://localhost:8000/llm/normalize-topic \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: $TOKEN" \
  -d '{"topic": "machine learning basics", "request_id": "test"}'

# 2. Test MCP fact gathering
curl -X POST http://localhost:8000/llm/get-facts \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: $TOKEN" \
  -d '{"normalized_topic": "react", "request_id": "test"}'

# 3. Test plan creation with caching
curl -X POST http://localhost:3000/api/plan \
  -H "Authorization: Bearer $JWT" \
  -d '{"topic": "react", "user_level": "beginner"}'

# 4. Add new staleness policy via admin
curl -X POST http://localhost:3000/admin/staleness-policies \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"domain_category": "blockchain", "policy_value": "30d", "description": "Blockchain and Web3"}'
```

---

## Phase 8: Tier & Monetization ✅ COMPLETE

**Goal**: Implement free/pro tier enforcement with atomic quota checks and fail-closed security.

**Status**: ✅ **PHASE COMPLETE** - All tasks implemented.

### Overview
Free users have enforced limits (3 plans, 15 daily LLM attempts, 2 exams per node, no exercise regeneration). Pro users have unlimited access. Enforcement uses atomic Redis operations to prevent race conditions and fails-closed on database errors to prevent unlimited free access during outages.

**See**: `docs/TIERS.md` for complete tier system documentation.

| Task | File | Exit Criteria |
|------|------|---------------|
| 8.1 | `src/config/tier.config.ts` | ✅ Complete - Tier limits config with NaN handling |
| 8.2 | `src/services/tier.service.ts` | ✅ Complete - Atomic `reserveDailyLlmAttempt`, `rollbackDailyLlmAttempt` |
| 8.3 | `src/middleware/tier.middleware.ts` | ✅ Complete - All middleware, fail-closed on DB errors |
| 8.4 | `src/routes/mastery.routes.ts` | ✅ Complete - Uses reserve/rollback pattern |
| 8.5 | `src/routes/admin.routes.ts` | ✅ Complete - `PUT /admin/users/:userId/tier` with userId validation |
| 8.6 | `src/routes/user.routes.ts` | ✅ Complete - `GET /api/users/:userId/usage` with DB role fetch for admins |
| 8.7 | `tests/unit/services/tier.service.test.ts` | ✅ Complete - Tests for atomic reserve/rollback |
| 8.8 | `tests/unit/middleware/tier.middleware.test.ts` | ✅ Complete - Tests for fail-closed behavior |
| 8.9 | `docs/TIERS.md` | ✅ Complete - Comprehensive tier documentation |

### Key Implementation Details

#### Atomic Quota Reservation (TOCTOU Fix)
Redis INCR is atomic, preventing race conditions on daily quota:

```typescript
// Reserve: INCR first, then check
const newCount = await redis.incr(key);
if (newCount > limit) {
  await redis.decr(key);  // Rollback
  return { allowed: false, current: newCount - 1, limit };
}
return { allowed: true, current: newCount, limit };
```

#### Fail-Closed Policy
- **Redis errors**: Fail open (preserve availability, matches rate limiter pattern)
- **Postgres errors**: Fail closed (DB errors = unlimited free access if fail-open)

#### Middleware Integration
- `enforceDailyAttemptQuota()`: Atomic reserve, sets `req.tierQuotaApplies` flag
- Route handler: Calls `rollbackDailyLlmAttempt()` on grading failure
- `enforcePlanLimit()`, `enforceExamLimit()`, `enforceExerciseRegenLimit()`: Fail-closed on DB errors

### Verification
```bash
# 1. Run all tests
cd apps/api-node && npx jest --testPathPattern=tests/unit --verbose

# 2. Test atomic reserve (concurrent requests should not bypass limit)
# - Send 20 concurrent requests with limit=15
# - Exactly 5 should get 403 TIER_LIMIT_EXCEEDED

# 3. Test fail-closed
# - Mock Postgres to throw in enforcePlanLimit
# - Should return 503, not allow unlimited plan creation

# 4. Test admin tier update
curl -X PUT http://localhost:3000/admin/users/$USER_ID/tier \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"tier": "pro"}'

# 5. Check usage endpoint
curl http://localhost:3000/api/users/$USER_ID/usage \
  -H "Authorization: Bearer $JWT"
```

---

*Last updated: February 2026 (Phase 8 Tier & Monetization complete)*
