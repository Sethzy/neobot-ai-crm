# Sunder QA Report

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **Surfaces** | {SURFACES} |
| **Base URL** | {BASE_URL} |
| **Manifest** | {MANIFEST_PATH} |
| **Analysis** | {ANALYSIS_PATH} |

## Summary

| Verdict | Count |
|---------|-------|
| Pass | 0 |
| Fail | 0 |
| Warn | 0 |
| Skip | 0 |
| **Total** | **0** |

| Metric | Value |
|--------|-------|
| Total tokens | 0 |
| Total cost | $0.00 |
| Avg latency | 0ms |

## Per-Surface Results

<!-- One section per surface tested. Fill the table with every scenario. -->

### {SURFACE_NAME}

Thread: `{THREAD_ID}`

| Scenario | Verdict | Expected Tools | Found Tools | Latency | Notes |
|----------|---------|----------------|-------------|---------|-------|
| {scenario} | pass | tool1, tool2 | tool1, tool2 | 1234ms | |

---

## Failures & Triage

<!-- One block per failure or warning. This is the most valuable section. -->
<!-- Every finding must have trace evidence — do not guess. -->

### FAIL-001: [{SURFACE}] {SCENARIO}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low / infra / cascade |
| **Category** | missing-tool / wrong-args / wrong-tool / tool-error / model-error / http-error / hallucination / cascade / slow |
| **Thread ID** | `{THREAD_ID}` |
| **Trace ID** | `{TRACE_ID}` |

**Prompt**

> {THE_PROMPT}

**Expected**

{What tools should have been called and what the agent should have done.}

**Actual**

{What actually happened — from trace evidence, not guessing.}

**Trace Evidence**

```
{Key observation data — model output snippet, tool args, error messages.
Paste the relevant JSON fragment. Keep it concise — only the diagnostic parts.}
```

**Root Cause**

{WHY this failed. One or two sentences.}

**Suggested Fix**

{What to do — e.g., "Strengthen system prompt guidance for calculate tool" or "Add credits to Vercel AI Gateway."}

---

## Infrastructure Issues

<!-- Rate limits, gateway errors, auth failures — not agent bugs. -->

| Issue | Count | Affected Scenarios |
|-------|-------|--------------------|
| {e.g., AI Gateway rate limit} | 0 | — |

## Notes

{Observations about overall agent behavior, patterns, or suggestions for the next QA run.}
