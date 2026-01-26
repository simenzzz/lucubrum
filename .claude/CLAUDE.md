# Learning Helper — Agent Development Guide

> This is the root context file for AI development agents working on the Learning Helper project.

## Project Overview

Learning Helper is a **learning orchestration platform** that:
- Generates personalized learning roadmaps (DAG-structured curriculum)
- Attaches curated YouTube resources via deterministic ranking
- Creates adaptive exercises with discriminated types (MCQ, short answer, coding, etc.)
- Tracks mastery via spaced repetition mechanics
- Recommends next steps based on prerequisites and progress

**Key principle**: LLMs are components, not the product. Strict validation boundaries ensure reliability.

## Architecture

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│   Node/TypeScript (Orchestrator) │◄───►│   Python/FastAPI (Curriculum)   │
│   • Public API                   │     │   • LLM Integration             │
│   • YouTube Integration          │     │   • Prompt Engineering          │
│   • Postgres Persistence         │     │   • Pydantic Validation         │
│   • Mastery Tracking             │     │   • MCP Integration             │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

## Monorepo Structure

| Directory | Purpose |
|-----------|---------|
| `apps/api-node/` | Node/TypeScript orchestrator service |
| `apps/curriculum-python/` | Python/FastAPI LLM service |
| `apps/web/` | Frontend (future) |
| `packages/contracts/` | Shared JSON schemas (generated from Pydantic) |
| `infra/` | Docker Compose, Postgres init, K8s manifests |
| `eval/` | Evaluation harness, golden topics, prompt experiments |
| `docs/` | Specifications, API docs, agent context |

## Service-Specific Context

When working in a specific service, navigate to that directory for focused context:

| Service | Context File | Key Docs |
|---------|--------------|----------|
| **Python Curriculum** | `apps/curriculum-python/.claude/CLAUDE.md` | `docs/AGENT_CURRICULUM.md` |
| **Node Orchestrator** | `apps/api-node/.claude/CLAUDE.md` | `docs/AGENT_ORCHESTRATOR.md` |

## Cross-Service Coordination Rules

### Schema Changes (Contract First)
1. **Python is source of truth** for all LLM output schemas
2. Update Pydantic models in `apps/curriculum-python/src/models/`
3. Run `make generate-schemas` to export JSON Schemas
4. Commit schemas to `packages/contracts/schemas/`
5. Update Node's AJV validators to consume new schemas

### API Changes
1. If adding a **Python endpoint**: Update `docs/AGENT_CURRICULUM.md` and `docs/API.md`
2. If adding a **Node endpoint**: Update `docs/AGENT_ORCHESTRATOR.md` and `docs/API.md`
3. Cross-service calls always include `request_id` for tracing

### Database Changes
1. Node owns Postgres schema (`infra/postgres/init.sql`)
2. All node references use composite key `(plan_id, node_id)`
3. Add indexes for new query patterns

## Key Documentation

| Doc | Read When |
|-----|-----------|
| `docs/SPEC.md` | Understanding overall architecture and data flows |
| `docs/SCHEMAS.md` | Working with data models and validation |
| `docs/API.md` | Implementing or consuming API endpoints |
| `docs/PROMPTS.md` | Managing LLM prompts and versioning |
| `implementation_roadmap.md` | Understanding project phases and tasks |

## Implementation Roadmap (Source of Truth)

**`implementation_roadmap.md` is the single source of truth for project progress.**

### Before Starting Work
1. Read the "What's Already Built" section to understand what exists
2. Check which phase you're working on
3. Find your task in the phase's task table

### After Completing Work
1. Mark the task as complete in the roadmap's task table (change `[ ]` to `[x]`)
2. Update the "What's Already Built" section if you implemented a new file
3. Check off the corresponding item in the "Appendix: File Checklist"

### Roadmap Structure
- **What's Already Built**: Inventory of completed files (check before implementing)
- **Phase N sections**: Tasks with file paths and exit criteria
- **Appendix: File Checklist**: Quick reference of all files and their status

### Example: Completing a Task
```markdown
# Before
| 1.3 | POST /llm/plan endpoint | `src/api/plan.py` | Call LLM, validate, return |

- [ ] `src/api/plan.py` - Plan generation endpoint

# After
| 1.3 | POST /llm/plan endpoint | `src/api/plan.py` | ✅ Complete |

- [x] `src/api/plan.py` - Plan generation endpoint
```

## Non-Negotiable Rules

1. **All LLM outputs validated** — Pydantic (Python) + AJV (Node)
2. **LLMs never generate URLs** — YouTube resources from API only
3. **Audit metadata required** — Every artifact has `request_id`, `prompt_version`, `provider`, `model`
4. **Plan-scoped node identity** — `node_id` is unique within plan only
5. **Schema versioning** — Breaking changes require new version

## Common Commands

```bash
# Start infrastructure
make dev-infra

# Start services (in separate terminals)
make dev-python
make dev-node

# Run tests
make test

# Generate schemas from Pydantic
make generate-schemas
```
