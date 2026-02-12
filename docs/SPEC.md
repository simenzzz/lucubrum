# SPEC.md — Learning Helper Technical Specification

## Overview
A learning orchestration system that generates personalized learning roadmaps, attaches YouTube resources, creates adaptive exercises, and tracks mastery. The system uses LLMs as components within a larger deterministic architecture.

**Key Principle**: This is NOT an LLM chatbot. It is a structured learning product that uses LLMs for content generation within strict validation boundaries.

## Architecture

### Two-Service Design
```
┌─────────────────────────────────────┐
│   Node/TypeScript Service           │
│   (Orchestrator)                    │
│                                     │
│   - Public API                      │
│   - YouTube Integration             │
│   - Persistence (Postgres)          │
│   - Mastery Tracking                │
│   - Semantic Validation             │
└──────────┬──────────────────────────┘
           │ HTTP
           ↓
┌─────────────────────────────────────┐
│   Python/FastAPI Service            │
│   (Curriculum)                      │
│                                     │
│   - LLM Integration                 │
│   - Prompt Engineering              │
│   - Schema Validation (Pydantic)    │
│   - Provider Abstraction            │
└─────────────────────────────────────┘
           │
           ↓
    ┌──────────────┐
    │ LLM Provider │
    │ (Gemini/Claude) │
    └──────────────┘
```

### Service Boundaries

#### Node Service Responsibilities
- Public-facing REST API
- Authentication and session management
- YouTube Data API integration
- Postgres database persistence
- Deterministic validation (DAG checks, prerequisite sanity)
- Mastery calculation and next-step recommendation
- Caching and rate limiting
- Structured logging and observability

#### Python Service Responsibilities
- LLM provider abstraction (Gemini → Claude migration path)
- Prompt engineering and versioning
- Strict Pydantic schema validation
- Retry logic with structured error feedback
- Provider-specific adapters
- Evaluation harness

### Communication Protocol
- **Protocol**: HTTP/REST
- **Format**: JSON
- **Authentication**: Internal service token (not user-facing)
- **Timeout**: 30s for plan generation, 15s for exercises/grading
- **Retry**: 3xx redirects not supported, 5xx triggers retry at Node layer

### Authentication & Authorization

#### OAuth 2.0 Flow (Google Provider)
```
User                    Node API                Google OAuth
  │                         │                        │
  ├─── GET /auth/google ───►│                        │
  │                         ├─── Redirect ──────────►│
  │◄────────────────────────┤                        │
  │                         │                        │
  │─── (User consents) ────────────────────────────►│
  │                         │◄─── Auth code ─────────┤
  │◄── Redirect + code ─────┤                        │
  │                         │                        │
  ├─── POST /auth/callback ►│                        │
  │    {code}               ├─── Exchange code ─────►│
  │                         │◄─── Access + ID token ─┤
  │                         │                        │
  │                         ├─── Verify ID token     │
  │                         ├─── Create/update user  │
  │                         ├─── Issue JWT pair      │
  │◄─── {access_jwt,        │                        │
  │      refresh_jwt} ──────┤                        │
```

#### Token Strategy
- **Access JWT**: 15-minute expiry, contains `user_id`, `email`, `roles[]`, `jti` (for blacklisting)
- **Refresh JWT**: 7-day expiry, stored hashed in Postgres with revocation capability
- **Token Blacklist**: Redis-based, TTL matches remaining token lifetime, fail-open
- **PKCE**: Required for public clients (SPA/mobile), code_verifier stored server-side in Redis

#### Auth Endpoints
- `GET /auth/google` - Initiate OAuth flow
- `POST /auth/callback` - Handle OAuth callback, issue tokens
- `POST /auth/refresh` - Exchange refresh token for new access token
- `POST /auth/logout` - Revoke refresh token

## Core Data Flows

### 1. Plan Generation
```
User → POST /api/plan {topic, user_level, exercise_types}
  ↓
Node validates input
  ↓
Node → Python POST /llm/plan
  ↓
Python generates plan via LLM
  ↓
Python validates with Pydantic (retry on fail)
  ↓
Python ← returns Plan + metadata
  ↓
Node performs semantic validation:
  - DAG has no cycles
  - Prerequisites reference existing nodes
  - Node count in acceptable range (4-30)
  - Schedule covers all nodes
  ↓
Node persists plan to Postgres
  ↓
Node ← returns {plan_id, plan} to user
```

### 2. Resource Attachment (YouTube)
```
User → POST /api/plan/:planId/resources
  ↓
Node fetches plan from DB
  ↓
For each node:
  ↓
  Node generates search queries (may call Python for suggestions)
  ↓
  Node calls YouTube Data API
  ↓
  Node ranks results deterministically:
    - Title/description match
    - Duration fit (10-20 min preferred)
    - Channel reputation
    - Recency (for tech topics)
  ↓
  Node selects top K (default: 1 must-watch + 2 recommended)
  ↓
  Node persists resources
  ↓
  Node caches: youtube:{node_id}:{query_hash}
  ↓
Node ← returns {resources_by_node}
```

### 3. Exercise Generation
```
User → POST /api/plan/:planId/nodes/:nodeId/exercises
  ↓
Node fetches user's mastery for this node
  ↓
Node maps mastery → difficulty (1-5)
  ↓
Node → Python POST /llm/exercises {node, user_level, exercise_types, difficulty}
  ↓
Python generates exercises via LLM
  ↓
Python validates with Pydantic
  ↓
Python checks: all exercise types present, difficulty distribution matches
  ↓
Node persists exercises
  ↓
Node ← returns {exercise_set}
```

### 4. Grading & Mastery Update
```
User → POST /api/attempts {exercise_id, user_answer}
  ↓
Node fetches exercise from DB
  ↓
Node → Python POST /llm/grade {exercise, user_answer, user_level}
  ↓
Python grades via LLM (low temperature for consistency)
  ↓
Python validates Grade with Pydantic
  ↓
Node persists attempt + grade
  ↓
Node recalculates mastery for this node:
  mastery = weighted_avg([
    recent_attempts * 0.6,
    historical_accuracy * 0.3,
    difficulty_completed * 0.1
  ])
  ↓
Node updates user_mastery table
  ↓
Node ← returns {grade, updated_mastery}
```

### 5. Next-Step Recommendation
```
User → GET /api/plan/:planId/next
  ↓
Node fetches plan + user's mastery for all nodes
  ↓
Node filters: nodes where all prerequisites have mastery >= 0.6
  ↓
Node ranks unblocked nodes:
  - Prefer: partial progress (0.1-0.7 mastery)
  - Deprioritize: not started (0.0) or mastered (>= 0.8)
  - Order: schedule order as tiebreaker
  ↓
Node ← returns {next_node_id, rationale}
```

### 6. Plan Caching & Freshness
```
User → POST /api/plan {topic, user_level, ...}
  ↓
Node → Python POST /llm/normalize-topic {topic}
  ↓
Python normalizes via LLM (handles typos, synonyms, free-text)
  → Returns {topic_normalized, domain_category, staleness_policy}
  ↓
Node computes cache_key = SHA256(topic_normalized + user_level)
  ↓
Node checks Redis: GET plan_cache:{cache_key}
  ↓
  ├─ HIT → Return immediately (hot path)
  │
  └─ MISS → Node checks Postgres: SELECT * FROM cached_plans
      ↓
      ├─ HIT (valid, not stale) → Promote to Redis, return
      │
      ├─ HIT (needs staleness check) → Python staleness validation
      │     ↓
      │   Python calls MCP servers (Context7, web search tools)
      │     ↓
      │   Python fetches YouTube transcripts for cached resources
      │     → (via transcript tool: TBD - user to specify)
      │     ↓
      │   Python compares: MCP sources vs. cached content
      │     → "Stale" if ≥10% contradiction found
      │     ↓
      │     ├─ NOT STALE → Update last_staleness_check, return cached
      │     └─ STALE → Invalidate cache, regenerate plan
      │
      └─ MISS → Generate new plan via LLM
          ↓
        Python generates full curriculum (all exercise types, all levels)
          ↓
        Node validates (AJV + semantic), persists to cached_plans
          ↓
        Node promotes to Redis, returns to user
```

### 7. Quality Signal Collection
```
Background Job (daily)
  ↓
Node aggregates user behavior per cached plan:
  - Completion rate (% completing >60% of nodes)
  - Exercise pass rate (first-attempt)
  - Time-to-mastery vs. estimated time
  - Resource engagement rate
  - Explicit feedback (thumbs up/down)
  ↓
Node inserts into plan_quality_snapshots
  ↓
If thresholds exceeded (sample_size >= 20):
  - completion_rate < 0.50
  - exercise_pass_rate < 0.40
  - negative_feedback_rate > 0.15
  - avg_time / estimated_time > 2.0
  ↓
Node sets invalidated_at + reason on cached_plans
  → Next request will regenerate
```

## Non-Negotiable Requirements

### 1. Schema Validation (Mandatory)
- **All LLM outputs must be JSON-only**
- **All JSON must be validated against Pydantic models (Python) or Zod schemas (Node)**
- **Validation failures trigger retry (max 2) with structured feedback**
- **No business logic consumes unvalidated LLM output**
- **Validation errors are logged with full context (prompt version, raw output hash)**

### 2. Tool-First Retrieval
- **LLMs NEVER generate URLs, video IDs, or external resource identifiers**
- **YouTube resources come exclusively from YouTube Data API**
- **Search queries may be LLM-suggested, but execution is deterministic (Node service)**

### 3. Auditable Decisions
Every plan/exercise/grade must be reproducible via logs:
- `request_id` (UUID)
- `prompt_version` (e.g., "plan/v2")
- `model_id` (e.g., "gemini-2.5-flash", "claude-sonnet-4.5")
- `provider` (gemini | claude)
- `raw_output_hash` (SHA256 of LLM response)
- `validation_errors` (if any, with retry count)
- `final_artifact_hash` (SHA256 of validated output)

### 4. DAG Integrity
- **Plans must be Directed Acyclic Graphs (no circular prerequisites)**
- **Node IDs must be unique within a plan**
- **Prerequisites must reference existing nodes**
- **Schedule must cover all nodes exactly once**
- **Semantic validation runs after schema validation, before persistence**
- **Failures are logged and rejected (no auto-repair)**

### 5. Staleness Detection Strategy

#### MCP Integration (Python Service)
- Uses **FastMCP Python SDK** for all MCP server communication
- Primary MCP servers:
  - **Context7**: Documentation and up-to-date technical references
  - **Web search tools**: Google/Bing for recent developments
- MCP staleness check cached for 24 hours per topic

#### YouTube Transcript Validation
- **Transcript Tool**: TBD (user to specify tool name and version)
- For each cached YouTube resource, transcripts are fetched and compared against MCP sources
- Comparison is LLM-assisted: "Does this transcript contradict current best practices?"

#### Staleness Threshold
- **≥10% contradiction** between cached content and current sources → plan is stale
- Contradiction measured per-resource (videos, exercises) and aggregated

#### Domain Categories → Staleness Policies
| Category | Staleness Check Interval | Rationale |
|----------|-------------------------|-----------|
| `math/fundamentals` | Never | Core math doesn't change |
| `cs/theory` | Annual | Algorithms are stable |
| `networking/protocols` | 90 days | Standards evolve slowly |
| `cloud/infrastructure` | 30 days | Fast-moving field |
| `web/frameworks` | 14 days | JS ecosystem volatility |
| `ai/ml` | 7 days | Extremely volatile |

> [!NOTE]
> Domain category is assigned by the LLM during topic normalization. The staleness policy is derived from the category.

## Migration Strategy (Gemini → Claude)

### Design Principles for Portability
1. **Provider Abstraction**: All LLM calls go through a common interface
2. **Configuration-Driven**: `LLM_PROVIDER=gemini|claude` (no code changes)
3. **Prompt Portability**: Avoid provider-specific syntax/features
4. **Metadata Logging**: Track provider, model, prompt_version for every call
5. **Parallel Evaluation**: Run eval harness on both providers before cutover

### Migration Checklist
- [ ] Provider interface stable and versioned
- [ ] GeminiProvider fully implemented and tested
- [ ] All prompts versioned and provider-agnostic
- [ ] Evaluation harness passing with Gemini (baseline metrics)
- [ ] ClaudeProvider implemented (same interface)
- [ ] Prompts tested with Claude, adjusted if needed (new versions)
- [ ] Evaluation harness passing with Claude (compare metrics)
- [ ] A/B test report: quality, speed, cost comparison
- [ ] Configuration switch tested in staging
- [ ] Rollout plan: gradual traffic shift with rollback plan

### Expected Migration Work
- **Minimal**: Prompts may need minor adjustments (temperature, example format)
- **Node service**: Zero code changes (calls Python service, not LLM directly)
- **Python service**: Provider adapter only (rest of code unchanged)
- **Evaluation**: Re-run full harness, compare metrics, tune if needed

## Technology Stack

### Node/TypeScript Service
- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express or Fastify
- **Language**: TypeScript (strict mode)
- **Database**: Postgres 15+ (via `pg` or `prisma`)
- **Validation**: Zod (for API input validation)
- **HTTP Client**: `axios` or `fetch` (for Python service + YouTube API)
- **Logging**: `winston` or `pino` (structured JSON logs)
- **Testing**: Jest + Supertest

### Python/FastAPI Service
- **Runtime**: Python 3.11+
- **Framework**: FastAPI
- **Validation**: Pydantic v2
- **LLM SDKs**: `google-generativeai`, `anthropic`
- **HTTP Client**: `httpx` (async)
- **Logging**: `structlog` (structured JSON logs)
- **Testing**: pytest + pytest-asyncio

### Infrastructure
- **Database**: Postgres 15+ (Docker for local dev)
- **Caching**: Redis 7+ (required for YouTube caching, refresh tokens, rate limiting)
- **Deployment**: Docker Compose (local), Docker + K8s (production)
- **Monitoring**: Prometheus + Grafana (future)

## Development Environment

### Recommended: WSL2 (Windows Subsystem for Linux)
- Work inside Linux filesystem: `/home/<user>/learning-helper`
- Avoid `/mnt/c/...` (Windows filesystem) for performance
- Use native Linux tools (git, docker, node, python)

### Local Setup
```bash
# Clone repo
git clone <repo> ~/learning-helper
cd ~/learning-helper

# Start infrastructure
docker-compose up -d postgres redis

# Start Python service
cd apps/llm-python
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Start Node service (separate terminal)
cd apps/api-node
npm install
npm run dev  # Runs on port 3000
```

## Repository Structure

```
learning-helper/
├── apps/
│   ├── api-node/              # Node/TypeScript service
│   │   ├── src/
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── services/      # Business logic (YouTube, mastery)
│   │   │   ├── db/            # Postgres queries
│   │   │   ├── validation/    # Semantic checks (DAG, etc.)
│   │   │   └── utils/         # Logging, HTTP client
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── llm-python/            # Python/FastAPI service
│   │   ├── src/
│   │   │   ├── api/           # FastAPI endpoints
│   │   │   ├── providers/     # LLM provider adapters
│   │   │   ├── models/        # Pydantic schemas
│   │   │   ├── prompts/       # Prompt loaders
│   │   │   └── utils/         # Logging, retry logic
│   │   ├── tests/
│   │   ├── requirements.txt
│   │   └── pyproject.toml
│   │
│   └── web/                   # (Optional) Frontend
│       └── ...
│
├── packages/
│   ├── schemas/               # Shared schemas
│   │   ├── plan.schema.json
│   │   ├── exercise.schema.json
│   │   ├── grade.schema.json
│   │   └── README.md
│   │
│   └── prompts/               # Versioned prompts
│       ├── plan/
│       │   ├── v1.txt
│       │   ├── v2.txt
│       │   └── current -> v2.txt
│       ├── exercises/
│       │   └── v1.txt
│       └── grading/
│           └── v1.txt
│
├── infra/
│   ├── docker-compose.yml     # Local Postgres + Redis
│   ├── postgres/
│   │   └── init.sql           # Schema initialization
│   └── k8s/                   # (Future) Kubernetes manifests
│
├── eval/
│   ├── golden_topics.json     # Test dataset
│   ├── run.py                 # Evaluation harness
│   └── results/               # Eval outputs
│
├── docs/
│   ├── API.md                 # API documentation
│   ├── SCHEMAS.md             # Schema reference
│   └── DEPLOYMENT.md          # (Future) Deployment guide
│
├── .env.example               # Environment variables template
├── README.md                  # Project overview
└── Makefile                   # Common tasks (setup, test, lint)
```

## Configuration

### Environment Variables

#### Node Service (`.env`)
```bash
# Service
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Python LLM Service
PYTHON_SERVICE_URL=http://localhost:8000
SERVICE_TOKEN=<internal-token>

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/learning_helper

# YouTube API
YOUTUBE_API_KEY=<your-key>
YOUTUBE_CACHE_TTL_SECONDS=604800  # 7 days

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

#### Python Service (`.env`)
```bash
# Service
ENVIRONMENT=development
PORT=8000
LOG_LEVEL=info

# LLM Provider
LLM_PROVIDER=gemini  # gemini | claude
LLM_MODEL=gemini-3-flash  # or claude-sonnet-4
LLM_TEMPERATURE_PLAN=0.7
LLM_TEMPERATURE_EXERCISE=0.8
LLM_TEMPERATURE_GRADE=0.3

# API Keys
GEMINI_API_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>

# Retry Configuration
LLM_MAX_RETRIES=2
LLM_TIMEOUT_SECONDS=30
```

## Observability

### Logging Standards
All logs must be structured JSON with these fields:

```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "service": "node-api|python-llm",
  "request_id": "uuid",
  "operation": "plan_generation|resource_attachment|exercise_generation|grading",
  "user_id": "string?",
  "plan_id": "string?",
  "node_id": "string?",
  "duration_ms": "number",
  "status": "success|failure|partial",
  "metadata": {
    "provider": "gemini|claude",
    "model": "string",
    "prompt_version": "string",
    "validation_errors": [],
    "retry_count": "number"
  }
}
```

### Metrics to Track
- **Latency**: p50, p95, p99 for each endpoint
- **Error Rates**: By operation type, provider, validation failure reason
- **LLM Call Success**: First-try vs. after-retry validation success
- **YouTube Quota**: Daily usage, cache hit rate
- **Mastery Progression**: Average time to mastery per node difficulty
- **User Engagement**: Exercise completion rate, next-step acceptance rate

### Database Tables

#### Core Tables
```sql
-- Plans
CREATE TABLE plans (
  plan_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  topic VARCHAR(500) NOT NULL,
  user_level VARCHAR(50) NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_plans_user ON plans(user_id);
CREATE INDEX idx_plans_created ON plans(created_at);

-- Nodes (composite primary key: plan_id + node_id)
CREATE TABLE nodes (
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  objectives JSONB NOT NULL,
  prerequisites JSONB NOT NULL,
  estimated_minutes INT NOT NULL,
  tags JSONB,
  order_index INT NOT NULL,
  PRIMARY KEY (plan_id, node_id)
);
CREATE INDEX idx_nodes_plan ON nodes(plan_id);

-- Resources (YouTube videos) - references composite key
CREATE TABLE resources (
  resource_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  channel_title VARCHAR(255),
  url VARCHAR(500) NOT NULL,
  duration_seconds INT,
  rank_score FLOAT NOT NULL,
  type VARCHAR(50) NOT NULL,  -- 'must_watch' | 'recommended'
  rationale VARCHAR(240),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_resources_node ON resources(plan_id, node_id);

-- Exercises - references composite key
CREATE TABLE exercises (
  exercise_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  choices JSONB,
  correct_answer JSONB NOT NULL,
  rubric TEXT NOT NULL,
  difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_exercises_node ON exercises(plan_id, node_id);
CREATE INDEX idx_exercises_difficulty ON exercises(difficulty);

-- Attempts (user answers)
CREATE TABLE attempts (
  attempt_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
  user_answer JSONB NOT NULL,
  score FLOAT NOT NULL CHECK (score BETWEEN 0 AND 1),
  is_correct BOOLEAN NOT NULL,
  feedback TEXT NOT NULL,
  misconceptions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_attempts_user_exercise ON attempts(user_id, exercise_id);
CREATE INDEX idx_attempts_created ON attempts(created_at);

-- User Mastery - references composite key
CREATE TABLE user_mastery (
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  mastery_score FLOAT NOT NULL CHECK (mastery_score BETWEEN 0 AND 1),
  last_updated TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id, node_id),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_mastery_user ON user_mastery(user_id);

-- Refresh Tokens (for OAuth)
CREATE TABLE refresh_tokens (
  token_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash, never plaintext
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Users (OAuth profiles)
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,  -- Google sub claim
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture_url VARCHAR(500),
  roles JSONB NOT NULL DEFAULT '["user"]',  -- ["user"] or ["user", "admin"]
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);

-- User-Plan Junction (many-to-many: tracks which users engage with which plans)
-- Plans are shared content; this enables "my plans" without ownership restrictions
CREATE TABLE user_plans (
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id)
);
CREATE INDEX idx_user_plans_user ON user_plans(user_id);
CREATE INDEX idx_user_plans_plan ON user_plans(plan_id);

-- LLM Call Logs
CREATE TABLE llm_calls (
  call_id UUID PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_hash VARCHAR(64),
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(50) NOT NULL,
  duration_ms INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  validation_errors JSONB,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_llm_calls_operation ON llm_calls(operation);
CREATE INDEX idx_llm_calls_provider ON llm_calls(provider);
CREATE INDEX idx_llm_calls_created ON llm_calls(created_at);
```

## Testing Strategy

### Unit Tests
- **Node Service**: Semantic validation functions (DAG detection, prerequisite checks), YouTube ranking algorithm, mastery calculation
- **Python Service**: Pydantic model validation, prompt template rendering, provider adapter logic

### Integration Tests
- **Node Service**: Full plan generation flow (mock Python service), YouTube API integration (use test quota), database persistence
- **Python Service**: LLM provider calls (use real APIs with test data), retry logic, validation error handling

### Contract Tests
- **Between Services**: Verify Node service can consume all Python service responses, verify Python service conforms to documented schemas

### End-to-End Tests
- **Full User Flows**: Plan → Resources → Exercises → Grading → Next-Step (across both services)

### Evaluation Harness
- **Golden Topics**: 10-30 representative topics (varied difficulty, domains)
- **Regression Tests**: Run before every deployment, compare against baseline metrics
- **Metrics**: Schema validity rate, DAG validity rate, concept coverage, grading consistency

## MVP Scope

### In Scope
- Plan generation with DAG validation
- YouTube resource attachment (2-3 videos per node)
- Exercise generation (user-selectable types: MCQ, Short Answer, Coding, Fill Blank)
- Grading with mastery update
- Next-node recommendation
- Evaluation harness with golden topics
- Gemini provider integration
- Full observability (structured logs, metrics)

### Out of Scope (Post-MVP)
- Fine-tuning LLMs on custom datasets
- RAG over proprietary learning corpora
- Multi-language support (English only for MVP)
- Social features (sharing plans, leaderboards)
- Payments and subscriptions
- Mobile apps (web-first)
- Claude provider (migration path designed, but Gemini only for MVP)

## Implementation Phases

### Phase 1: Foundation
- Scaffold repo structure (monorepo with apps/)
- Docker Compose for Postgres + Redis
- Define schemas (Pydantic in Python, export JSON Schema)
- Build Python service skeleton (FastAPI + provider interface)
- Build Node service skeleton (Express/Fastify + HTTP client)
- Implement OAuth authentication flow
- Implement `/llm/plan` and `/api/plan` endpoints end-to-end

### Phase 2: Resources & Exercises
- YouTube API integration + ranking algorithm
- Implement `/api/plan/:planId/resources` endpoint
- Implement `/llm/exercises` and `/api/plan/:planId/nodes/:nodeId/exercises` endpoints
- Persist all data to Postgres
- Implement Redis caching for YouTube results

### Phase 3: Grading & Mastery
- Implement `/llm/grade` endpoint
- Build mastery calculation logic
- Implement `/api/attempts` endpoint
- Implement next-node selection logic
- Build `/api/plan/:planId/next` endpoint

### Phase 4: Quality & Observability
- Build evaluation harness with golden topics
- Ensure all operations are logged with full metadata
- Add health check endpoints
- Document all APIs (API.md)
- Run regression tests and fix issues

### Phase 5: Polish & Deploy
- Performance optimization (caching, indexing)
- Error handling improvements
- Admin endpoints (cache invalidation, plan inspection)
- Deployment scripts (Docker + K8s manifests)
- Staging environment deployment
- Load testing

## Open Questions (Not Blocking MVP)

1. **Default Exercise Types**: Which exercise types should be selected by default in UI? (Suggest: MCQ + Short Answer for broad applicability)

2. **Coding Exercises**: Should "coding" type be generated for all topics, or only programming topics? (Suggest: Only for programming/technical topics, detected via topic keywords)

3. **Bilingual Output**: Support multiple languages from day 1, or English-only MVP? (Suggest: English-only, add i18n post-MVP)

4. **Mastery Decay**: Should mastery scores decay over time (forgotten concepts)? (Suggest: No for MVP, evaluate post-launch)

5. **Prerequisite Depth**: Max prerequisite chain depth (to avoid overly complex DAGs)? (Suggest: 5 levels, warn if exceeded)

6. **Exercise Pool Size**: How many exercises per node per difficulty level? (Suggest: 10-20 per node, randomize selection)

7. **Grading Appeals**: Should users be able to contest grades (trigger re-grading)? (Suggest: Post-MVP feature)

8. **Plan Versioning**: Can users edit/fork plans, or are they immutable? (Suggest: Immutable for MVP, fork feature post-MVP)

## Success Criteria

### Technical
- 95%+ schema validation success rate (first try)
- 100% DAG validity after semantic checks
- <2s p95 latency for plan generation
- <500ms p95 latency for grading
- YouTube cache hit rate >80% after warm-up
- Zero unvalidated LLM outputs in production

### Product
- Users complete 70%+ of generated exercises per node
- 80%+ user acceptance of next-node recommendations
- Mastery progression: 60%+ nodes reach "competent" level within 2 weeks
- Exercise quality: <10% user-reported issues with exercises/grading

### Migration (Gemini → Claude)
- Config-only switch (zero code changes in Node service)
- Comparable or better quality metrics vs. Gemini baseline
- Migration completed within 1 week (including eval + rollout)