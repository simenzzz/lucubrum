# Prompt Registry

> Central registry for all LLM prompts used by the Curriculum service. For A/B test results and experiment history, see [`eval/prompt_experiments.md`](../eval/prompt_experiments.md).

## Active Prompts

| Prompt ID | Version | Status | Provider(s) | File | Purpose |
|-----------|---------|--------|-------------|------|---------|
| `plan` | v1 | **active** | gemini | [`prompts/plan/v1.txt`](../apps/curriculum-python/src/prompts/plan/v1.txt) | Learning plan generation |
| `exercises` | v1 | **active** | gemini | [`prompts/exercises/v1.txt`](../apps/curriculum-python/src/prompts/exercises/v1.txt) | Exercise set generation |
| `grade` | v1 | **active** | gemini | [`prompts/grade/v1.txt`](../apps/curriculum-python/src/prompts/grade/v1.txt) | Answer grading |
| `queries` | v1 | **active** | gemini | [`prompts/queries/v1.txt`](../apps/curriculum-python/src/prompts/queries/v1.txt) | YouTube search query suggestions |
| `normalize` | v1 | **active** | gemini | [`prompts/normalize/v1.txt`](../apps/curriculum-python/src/prompts/normalize/v1.txt) | Topic normalization (Phase 8) |
| `validate_video` | v1 | **active** | any | [`prompts/validate_video/v1.txt`](../apps/curriculum-python/src/prompts/validate_video/v1.txt) | Video-topic relevance validation |
| `staleness` | v1 | **active** | any | [`prompts/staleness/v1.txt`](../apps/curriculum-python/src/prompts/staleness/v1.txt) | Content staleness comparison (Phase 8) |

## Status Definitions

| Status | Meaning |
|--------|---------|
| **active** | Currently used in production |
| **testing** | In A/B test, not yet primary |
| **deprecated** | Superseded, pending removal |
| **draft** | In development, not deployed |

---

## Versioning Rules

### When to Bump Version
- Any change to prompt structure or instructions
- Adding/removing examples
- Changing output schema requirements
- Provider-specific adjustments

### Version Naming
- Format: `v{N}` (e.g., `v1`, `v2`)
- Optional suffix for provider-specific: `v2-claude`
- Files: `prompts/{operation}/v{N}.txt`

### Symlink Convention
Each prompt directory maintains a `current` symlink:
```
prompts/plan/
├── v1.txt
├── v2.txt
└── current -> v2.txt
```

---

## Prompt File Template

Each prompt file should follow this structure:

```
# {OPERATION} PROMPT v{N}
# Provider: {gemini|claude|any}
# Temperature: {0.0-1.0}
# Created: {date}
# Changes: {brief description of changes from previous version}

You are a {role description}.

## Task
{Clear task description}

## Input
{Input variables: {variable_name}}

## Output Requirements
- Return ONLY valid JSON (no markdown, no code fences)
- Follow the exact schema below
{Additional constraints}

## Schema
{JSON Schema or abbreviated schema}

## Examples
{2-3 valid examples, JSON only}

## Quality Criteria
GOOD: {positive examples}
BAD: {anti-patterns to avoid}
```

---

## Adding a New Prompt

1. Create file: `apps/curriculum-python/src/prompts/{operation}/v1.txt`
2. Follow template above
3. Add entry to this registry table
4. Update `docs/AGENT_CURRICULUM.md` if new endpoint
5. Run evaluation against golden topics
6. Record baseline metrics in [`eval/prompt_experiments.md`](../eval/prompt_experiments.md)

---

## Provider Compatibility Notes

| Provider | Notes |
|----------|-------|
| **Gemini** | Primary provider. All prompts tested here first. |
| **Claude** | Migration target. May need temperature/format adjustments. |

When migrating prompts to a new provider:
1. Create new version (e.g., `v2-claude`)
2. Run comparative eval (see `eval/prompt_experiments.md`)
3. Only activate after metrics match or exceed baseline
