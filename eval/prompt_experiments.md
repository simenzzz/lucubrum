# Prompt Experiments & A/B Test Results

> This file tracks prompt experiment history, A/B test results, and comparative metrics. For the prompt registry and versioning rules, see [`docs/PROMPTS.md`](../docs/PROMPTS.md).

---

## Experiment Log

### Template

```markdown
## EXP-{NNN}: {Brief Title}

**Date**: YYYY-MM-DD
**Prompt**: {operation/version}
**Hypothesis**: {What we expected to improve}
**Provider**: {gemini|claude}

### Variants
| Variant | Description |
|---------|-------------|
| Control | {current active version} |
| Test | {new version being tested} |

### Metrics
| Metric | Control | Test | Δ |
|--------|---------|------|---|
| Schema validity (first try) | X% | Y% | +/-Z% |
| Schema validity (after retry) | X% | Y% | +/-Z% |
| DAG validity | X% | Y% | +/-Z% |
| {operation-specific metric} | X | Y | +/-Z |

### Conclusion
{Winner and rationale. Did we promote to active?}
```

---

## Experiments

*(No experiments recorded yet. First experiment will be EXP-001.)*

---

## Baseline Metrics (Golden Topics)

These baselines were established using the **golden topics dataset** (`eval/golden_topics.json`).

| Prompt | Version | Provider | Schema Valid (1st) | Schema Valid (retry) | Operation-Specific |
|--------|---------|----------|-------------------|---------------------|-------------------|
| `plan` | v1 | gemini | TBD | TBD | DAG valid: TBD |
| `exercises` | v1 | gemini | TBD | TBD | Type coverage: TBD |
| `grade` | v1 | gemini | TBD | TBD | Score variance: TBD |
| `queries` | v1 | gemini | TBD | TBD | Relevance: TBD |
| `normalize` | v1 | gemini | TBD | TBD | Typo correction: TBD |
| `staleness` | v1 | gemini | TBD | TBD | Contradiction detect: TBD |

> [!NOTE]
> Baselines will be populated after Phase 6 (Evaluation Harness) is complete.

---

## Archived Experiments

*(Move completed experiments here after 90 days)*
