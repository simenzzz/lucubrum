# Lucubrum

A learning orchestration platform that generates personalized, structured learning roadmaps — with curated YouTube resources, adaptive exercises, and mastery tracking.

**Live demo**: [lucubrum.vercel.app](https://lucubrum.vercel.app)

---

## What it does

- **Roadmap generation** — Converts a topic + skill level into a DAG-structured curriculum (nodes, prerequisites, objectives)
- **YouTube integration** — Attaches ranked video resources to each node via deterministic scoring (relevance, engagement, duration fit)
- **Adaptive exercises** — Generates discriminated exercise types: MCQ, short answer, fill-in-the-blank, coding, flashcard
- **Mastery tracking** — Tracks progress via timed exams and exercise completion; recommends next steps based on prerequisites
- **Spaced repetition** — Staleness detection flags nodes for review based on recency signals

---

## Architecture

Two-service design — LLMs are isolated components behind strict validation boundaries.

```
┌─────────────────────────────────────┐
│   Node/TypeScript (Orchestrator)    │
│   Public API · YouTube · Postgres   │
│   Auth · Mastery · Caching          │
└──────────────┬──────────────────────┘
               │ HTTP
               ▼
┌─────────────────────────────────────┐
│   Python/FastAPI (Curriculum)       │
│   LLM Integration · Prompt Eng.     │
│   Pydantic Validation · Providers   │
└─────────────────────────────────────┘
```

| Layer | Stack |
|-------|-------|
| Frontend | React + Vercel |
| Orchestrator | Node.js · TypeScript · Express · AJV |
| Curriculum | Python · FastAPI · Pydantic v2 |
| Database | Postgres (Supabase) · Redis (Upstash) |
| LLM Providers | Google Gemini · Anthropic Claude · Zai |
| Auth | Google OAuth 2.0 · JWT (access + refresh) |
| Deployment | Render (backend) · Vercel (frontend) |

---

## Quick start

```bash
# Infrastructure (Postgres + Redis)
make dev-infra

# Python curriculum service (port 8001)
make dev-python

# Node orchestrator (port 3000)
make dev-node
```

Requires `.env` — see `.env.example` for all variables.

---

## Project structure

```
apps/
  api-node/           Node/TypeScript orchestrator
  curriculum-python/  Python/FastAPI LLM service
  web/                Frontend
packages/contracts/   Shared JSON schemas
eval/                 Evaluation harness & golden topics
infra/                Docker Compose, Postgres init, K8s
docs/                 Specs, API reference, schema docs
```

## Docs

| Document | Purpose |
|----------|---------|
| [SPEC.md](docs/SPEC.md) | Architecture, auth flow, data models |
| [API.md](docs/API.md) | All endpoints with request/response examples |
| [SCHEMAS.md](docs/SCHEMAS.md) | JSON schema definitions |
| [PROMPTS.md](docs/PROMPTS.md) | LLM prompt versioning strategy |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide |
