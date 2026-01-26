# Curriculum Python Architecture

Service architecture, data flows, and integration patterns.

---

## Two-Service Design

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
           │ HTTP (JSON)
           ↓
┌─────────────────────────────────────┐
│   Python/FastAPI Service            │
│   (Curriculum) ← YOU ARE HERE       │
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

## Python Service Boundaries

**Owns:**
- LLM provider calls (Gemini, Claude)
- Prompt templates and versioning
- Pydantic output schema definitions
- Validation retry logic

**Does NOT own:**
- Database persistence (Node service)
- YouTube API calls (Node service)
- User authentication (Node service)
- URL/video ID generation (never from LLM)

---

## Directory Structure Breakdown

### `src/api/` — FastAPI Endpoints

Each file handles one LLM operation:

| File | Endpoint | Purpose |
|------|----------|---------|
| `plan.py` | `POST /llm/plan` | Generate learning plan |
| `exercises.py` | `POST /llm/exercises` | Generate exercise set |
| `grade.py` | `POST /llm/grade` | Grade user answer |
| `queries.py` | `POST /llm/queries` | Suggest YouTube search queries |
| `validate_video.py` | `POST /llm/validate-video` | Check video relevance |
| `staleness.py` | `POST /llm/check-staleness` | Check content freshness |
| `transcript.py` | `POST /llm/transcript` | Fetch video transcript |

### `src/models/` — Pydantic Schemas

**Source of truth** for all LLM output schemas:

| File | Models |
|------|--------|
| `plan.py` | `Node`, `ScheduleItem`, `Plan` |
| `exercise.py` | `MCQExercise`, `ShortAnswerExercise`, `Exercise`, `ExerciseSet` |
| `grade.py` | `Grade` |
| `metadata.py` | `ArtifactMetadata` |
| `query_suggestions.py` | `QuerySuggestions` |
| `transcript.py` | `Transcript`, `VideoValidation`, `StalenessResult` |

### `src/prompts/` — Versioned Prompts

```
prompts/
├── plan/
│   ├── v1.txt
│   └── current -> v1.txt
├── exercises/
│   └── v1.txt
├── grade/
│   └── v1.txt
└── ...
```

### `src/providers/` — LLM Adapters

Provider abstraction for Gemini → Claude migration:

```python
class LLMProvider(Protocol):
    async def generate(self, prompt: str, temperature: float) -> str: ...

class GeminiProvider(LLMProvider): ...
class ClaudeProvider(LLMProvider): ...
```

---

## Data Flow: Plan Generation

```
1. Node → POST /llm/plan {topic, user_level, constraints}
           ↓
2. Python loads prompt template (prompts/plan/current)
           ↓
3. Python calls LLM provider (Gemini/Claude)
           ↓
4. Python validates response with Pydantic
   ├─ Valid → Continue
   └─ Invalid → Retry with feedback (max 2)
           ↓
5. Python returns Plan + ArtifactMetadata
           ↓
6. Node performs semantic validation:
   - DAG has no cycles
   - Prerequisites reference existing nodes
   - Schedule covers all nodes
           ↓
7. Node persists to Postgres, returns to user
```

---

## Contract Workflow

### Adding a New Schema

1. **Create Pydantic model** in `src/models/`
2. **Add schema_version** field: `Literal["new_type.v1"]`
3. **Include metadata**: `metadata: ArtifactMetadata`
4. **Export JSON Schema**: `make generate-schemas`
5. **Commit to contracts**: `packages/contracts/schemas/`
6. **Update Node validators**: Add AJV consumer

### Breaking Changes

1. Create new version: `new_type.v2`
2. Keep old version working during migration
3. Update Python to emit new version
4. Update Node to accept both versions
5. Deprecate old version after migration window

---

## Environment Configuration

```bash
# Service
ENVIRONMENT=development
PORT=8000
LOG_LEVEL=info

# LLM Provider
LLM_PROVIDER=gemini  # gemini | claude
LLM_MODEL=gemini-1.5-pro
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

---

## Logging Standards

All logs must be structured JSON:

```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "service": "python-llm",
  "request_id": "uuid",
  "operation": "plan_generation",
  "duration_ms": 1234,
  "status": "success|failure",
  "metadata": {
    "provider": "gemini",
    "model": "gemini-1.5-pro",
    "prompt_version": "plan/v1",
    "validation_errors": [],
    "retry_count": 0
  }
}
```
