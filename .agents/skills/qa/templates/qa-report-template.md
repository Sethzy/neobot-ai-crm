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
| Prompt tokens | 0 |
| Completion tokens | 0 |
| Total cost | $0.00 |
| Avg latency | 0ms |
| Budget exceeded | 0 scenarios |
| Baseline compared | yes / no |

## Per-Surface Results

<!-- One section per surface tested. Fill the table with every scenario. -->

### {SURFACE_NAME}

Thread: `{THREAD_ID}`

| Scenario | Verdict | Expected Tools | Found Tools | Steps | Tokens | Cost | Latency | Notes |
|----------|---------|----------------|-------------|-------|--------|------|---------|-------|
| {scenario} | pass | tool1, tool2 | tool1, tool2 | 2 | 5,432 | $0.0012 | 1234ms | |

---

## Efficiency Analysis

<!-- Per-scenario cost and token breakdown. Flag over-budget scenarios. -->

| Scenario | Prompt Tokens | Completion Tokens | Total | Budget | Over? | Step-1 Context | Cost |
|----------|--------------|-------------------|-------|--------|-------|----------------|------|
| {scenario} | 3,200 | 1,100 | 4,300 | 20,000 | No | 2,800 | $0.0008 |

### Context Bloat Check

<!-- Step-1 prompt tokens measure the base context sent before the agent does anything.
     High values (>8K) suggest system prompt or memory bloat. -->

| Scenario | Step-1 Prompt Tokens | Flag |
|----------|---------------------|------|
| {scenario} | 2,800 | OK |

### Step Sequences

<!-- Shows the execution flow: GEN → TOOL → GEN for each scenario.
     Unnecessary steps = unnecessary context resends. -->

| Scenario | Sequence |
|----------|----------|
| {scenario} | GEN(3200) → TOOL:calculate → GEN(4100) |

## Baseline Comparison

<!-- Only present if a baseline was loaded. Shows token/latency deltas. -->

| Scenario | Prev Tokens | Current | Delta | Prev Latency | Current | Delta |
|----------|-------------|---------|-------|--------------|---------|-------|
| {scenario} | 4,300 | 4,500 | +5% | 3200ms | 3400ms | +6% |

## Failures & Triage

<!-- One block per failure or warning. This is the most valuable section. -->
<!-- Every finding must have trace evidence — do not guess. -->

### FAIL-001: [{SURFACE}] {SCENARIO}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low / infra / cascade |
| **Category** | missing-tool / wrong-args / wrong-tool / tool-error / model-error / http-error / hallucination / cascade / slow / output-mismatch / over-budget |
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

## Output Validation

<!-- For scenarios with expectedOutput regex, show match results. -->

| Scenario | Expected Pattern | Matched | Response Excerpt |
|----------|-----------------|---------|-----------------|
| {scenario} | `/10[,.]?800/` | Yes | "...commission of $10,800..." |

## Infrastructure Issues

<!-- Rate limits, gateway errors, auth failures — not agent bugs. -->

| Issue | Count | Affected Scenarios |
|-------|-------|--------------------|
| {e.g., AI Gateway rate limit} | 0 | — |

## Notes

{Observations about overall agent behavior, patterns, cost trends, or suggestions for the next QA run.}
