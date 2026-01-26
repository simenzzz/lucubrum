---
name: curriculum-skill
description: Comprehensive development guide for the curriculum-python FastAPI service. This skill should be used when working on LLM integration, Pydantic models, API endpoints, or prompt engineering within apps/curriculum-python/. Invoke manually when developing or debugging the Python curriculum service.
---

# Curriculum Python Development Guide

## Overview

The `curriculum-python` service is a **FastAPI-based LLM integration service** that generates learning plans, exercises, and grades user answers. It performs strict Pydantic validation on all LLM outputs and serves as the source of truth for all output schemas in the Learning Helper system.

## Service Responsibilities

This Python service handles:
- **LLM Provider Abstraction** — Gemini/Claude with migration path
- **Prompt Engineering** — Versioned prompts in `prompts/` directory
- **Schema Validation** — All LLM outputs validated via Pydantic v2
- **Retry Logic** — Structured error feedback on validation failures
- **Evaluation Harness** — Testing prompts against golden topics

> [!IMPORTANT]
> Python is the **source of truth** for all LLM output schemas. Changes to Pydantic models must be exported to `packages/contracts/schemas/` via `make generate-schemas`.

## Directory Structure

```
apps/curriculum-python/
├── src/
│   ├── api/           # FastAPI route handlers
│   ├── models/        # Pydantic v2 schemas (source of truth)
│   ├── prompts/       # Versioned prompt templates
│   ├── providers/     # LLM provider adapters (Gemini, Claude)
│   ├── utils/         # Logging, retry logic, helpers
│   └── main.py        # FastAPI app entry point
├── tests/             # pytest + pytest-asyncio tests
├── pyproject.toml     # Project config
└── requirements.txt   # Dependencies
```

## Coding Conventions

### Pydantic Models

All LLM output models must follow these conventions:

1. **Schema versioning** — Every top-level model includes `schema_version: Literal["type.v1"]`
2. **Metadata required** — Include `metadata: ArtifactMetadata` for auditing
3. **Discriminated unions** — Use `Annotated[... | ..., Field(discriminator="type")]` for polymorphic types
4. **Validators** — Use `@field_validator` for field-level, `@model_validator` for cross-field validation
5. **Plan-scoped IDs** — `node_id` is unique only within a plan, never globally

```python
# Example: Correct discriminated union pattern
Exercise = Annotated[
    MCQExercise | ShortAnswerExercise | FillBlankExercise,
    Field(discriminator="type"),
]
```

### FastAPI Endpoints

1. **Echo request metadata** — Always include `plan_id`, `node_id`, `request_id` in responses
2. **422 for validation failures** — Return 422 when LLM output fails schema validation
3. **Structured errors** — Return JSON with `error`, `message`, `details`, `request_id`
4. **Low temperature for grading** — Use 0.3 for grading, 0.7-0.8 for generation

### Prompt Management

1. **Versioned files** — `prompts/{operation}/v{N}.txt`
2. **Symlink for current** — `current -> v2.txt`
3. **Header metadata** — Include provider, temperature, creation date
4. **JSON-only output** — Prompts must specify "Return ONLY valid JSON"

## Common Pitfalls

### Schema Validation Errors

| Problem | Solution |
|---------|----------|
| LLM returns markdown-wrapped JSON | Add explicit "no code fences" to prompt |
| MCQ `correct_answer` not in choices | Use `@model_validator` to check membership |
| Empty `objectives` list items | Use `@field_validator` to check non-empty strings |
| `node_id` contains uppercase | Enforce pattern `^[a-z0-9_]{3,100}$` |

**Retry pattern** — On validation failure:
1. Log the raw output hash and validation errors
2. Send structured feedback to LLM with specific errors
3. Retry max 2 times before returning 422

### Contract Sync Issues

When Pydantic models change:

1. Update models in `src/models/`
2. Run `make generate-schemas` to export JSON Schemas
3. Commit schemas to `packages/contracts/schemas/`
4. Update Node's AJV validators
5. Breaking changes require new schema version

> [!CAUTION]
> Never hand-edit files in `packages/contracts/schemas/` — they are generated from Pydantic.

## Testing Approach

### Unit Tests
- Test Pydantic validation with valid/invalid inputs
- Test validators catch expected errors
- Test prompt template rendering

### Integration Tests
- Test LLM provider calls with real API (use test data)
- Test retry logic with mocked validation failures
- Test full endpoint request/response cycle

### Test File Naming
```
tests/
├── test_models/
│   ├── test_plan.py
│   └── test_exercise.py
├── test_api/
│   └── test_plan_endpoint.py
└── conftest.py
```

### Run Tests
```bash
cd apps/curriculum-python
source .venv/bin/activate
pytest -v
```

## References

For detailed patterns and architecture, see:
- [references/patterns.md](file:///home/sami/learningproj/.claude/skills/curriculum-skill/references/patterns.md) — Pydantic model examples, endpoint patterns
- [references/architecture.md](file:///home/sami/learningproj/.claude/skills/curriculum-skill/references/architecture.md) — Service design, data flows

## Key Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SPEC.md](file:///home/sami/learningproj/docs/SPEC.md) | Overall architecture and data flows |
| [docs/SCHEMAS.md](file:///home/sami/learningproj/docs/SCHEMAS.md) | Schema reference and versioning rules |
| [docs/PROMPTS.md](file:///home/sami/learningproj/docs/PROMPTS.md) | Prompt registry and versioning |
| [docs/API.md](file:///home/sami/learningproj/docs/API.md) | All endpoint specifications |
