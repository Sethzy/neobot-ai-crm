---
name: qa
description: Run automated LLM QA scenarios against the Sunder chat API, analyze Langfuse traces for tool call correctness, and triage failures with trace evidence. Use when asked to "run QA", "test surfaces", "check the agent", or "/qa". Supports surface filtering (e.g., "/qa 03,17"). Produces a structured report with root-cause triage for every failure.
allowed-tools: Bash(npx tsx scripts/qa/*), Bash(langfuse api *), Bash(mkdir *), Bash(cp *), Bash(cat scripts/qa/output/*), Bash(curl -s http://localhost:*)
---

# QA

Run predefined chat scenarios against the Sunder agent, analyze Langfuse traces, and triage every failure with trace evidence.

## Setup

Only the **surface filter** is optional. Everything else has defaults.

| Parameter | Default | Example override |
|-----------|---------|-----------------|
| **Surfaces** | ALL (57 scenarios, 11 surfaces) | `/qa 03,17` runs only CRM tools + calculate |
| **Base URL** | `http://localhost:3001` | Set `QA_BASE_URL` env var |
| **Delay between requests** | 2000ms | Set `QA_DELAY_MS` env var |
| **Output directory** | `scripts/qa/output/` | — |
| **Report directory** | `docs/qa/reports/` | — |

### Required env vars

These must be set before running. The scripts load `.env.local` automatically for Supabase/Langfuse vars. Only the QA user credentials need to be passed explicitly or added to `.env.local`:

| Var | Source | Notes |
|-----|--------|-------|
| `QA_USER_EMAIL` | Passed on command or `.env.local` | Test user email |
| `QA_USER_PASSWORD` | Passed on command or `.env.local` | Test user password |
| `LANGFUSE_SECRET_KEY` | `.env.local` | For trace analysis |
| `LANGFUSE_PUBLIC_KEY` | `.env.local` | For trace analysis |
| `SUPABASE_URL` | `.env.local` | For auth |
| `SUPABASE_ANON_KEY` | `.env.local` | For auth |

If `QA_USER_EMAIL` or `QA_USER_PASSWORD` are not set, ask the user for credentials before proceeding.

### Pre-flight

Before starting, verify the dev server is running:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/chat
```

If the server returns 000 (connection refused), tell the user to run `npm run neo` in a separate terminal and wait for "Ready."

## Workflow

```
1. Init        Parse args, create dirs, copy report template
2. Run         Execute run-qa.ts — send all prompts, save manifest
3. Analyze     Execute analyze.ts — fetch traces, check tool calls
4. Triage      For each failure: pull Langfuse trace, diagnose root cause
5. Report      Fill template, update counts, summarize to user
```

### 1. Init

Parse surface filter from skill args. If `/qa 03,17`, set `QA_SURFACES=03,17`. If `/qa` with no args, run all surfaces.

```bash
mkdir -p docs/qa/reports scripts/qa/output
cp {SKILL_DIR}/templates/qa-report-template.md docs/qa/reports/qa-report-{TIMESTAMP}.md
```

Fill in the report header fields: date, surfaces, base URL.

### 2. Run

```bash
QA_USER_EMAIL={EMAIL} QA_USER_PASSWORD={PASSWORD} QA_SURFACES={SURFACES} QA_BASE_URL={BASE_URL} npx tsx scripts/qa/run-qa.ts
```

The script prints progress to stdout and saves a manifest JSON to `scripts/qa/output/manifest-{TIMESTAMP}.json`. Capture the manifest path from the output.

This step takes 1-10 minutes depending on scenario count and server response times. Let it run to completion.

### 3. Analyze

Wait 5 seconds after the run completes for Langfuse traces to flush, then:

```bash
npx tsx scripts/qa/analyze.ts {MANIFEST_PATH}
```

This produces `{MANIFEST_PATH}-analysis.json`. Read the analysis JSON and count verdicts:
- If all pass → skip triage, go to Phase 5
- If any fail or warn → proceed to Phase 4

### 4. Triage

Read [references/triage-guide.md](references/triage-guide.md) before starting triage.

For each failure or warning in the analysis JSON:

**Step 1 — Quick classification.** Check the `errors` array first:
- Contains "rate limit" or "429" or "free credits" → classify as `infra`, skip deep triage
- Contains "context length" → classify as `model-error`
- Empty errors but `missingTools` → proceed to deep triage

**Step 2 — Fetch trace data.** Get the traces for this thread:

```bash
langfuse api traces list --sessionId {THREAD_ID} --limit 20 --json
```

Traces are ordered chronologically. Match traces to scenarios by position: trace[0] = scenario[0] within each surface group.

**Step 3 — Read observations.** For the specific trace:

```bash
langfuse api observations-v2s list --traceId {TRACE_ID} --limit 50 --json
```

Look for:
- **GENERATION** observations (type=GENERATION) — check `output` for tool calls, `statusMessage` for errors
- **TOOL** observations (type=TOOL) — check `name` for tool name, `input` for args, `output` for result

**Step 4 — If deeper detail needed**, get a specific observation:

```bash
langfuse api observations-v2s get {OBSERVATION_ID} --json
```

**Step 5 — Classify the failure** using the triage guide categories and write the finding in the report.

**Cascade detection:** For sequential scenarios, check if the previous scenario in the same surface failed. If so, classify as `cascade` and link to the root failure. Do not deep-triage cascades.

### 5. Report

1. Fill in the per-surface results table with all scenarios.
2. Write a triage block for each failure (use the template format).
3. Group infrastructure issues in the dedicated section.
4. Update summary counts to match actual findings.
5. Tell the user: report path, top-line pass/fail counts, and the most critical findings.

## Guidance

- **Triage is the valuable step.** Do not skip it even if there are many failures. A report with verdicts but no root causes is not useful.
- **Read actual trace data before diagnosing.** Do not guess from error messages alone. The `errors` array in the analysis JSON often describes symptoms, not causes.
- **Missing tools ≠ broken tool.** The most common cause of `missingTools` is the model chose not to call the tool — it answered directly instead. Check the GENERATION output to confirm.
- **Extra tools are usually benign.** The agent may use `read_file`, `search_contacts`, or other helper tools not in the expected list. Mark as `info` unless the extra tool caused a side effect.
- **Sequential failures cascade.** If scenario N fails, scenarios N+1..N+k that depend on it will also fail. Find the root failure and mark the rest as `cascade`.
- **Rate limits are infra, not bugs.** Separate them from agent behavior problems. The report has a dedicated section for this.
- **Correlate traces to scenarios by order.** Within a surface group, traces are created chronologically. The first trace corresponds to the first scenario sent.
- **Check for "search then act" patterns.** Many CRM scenarios expect `search_X` then `update_X`. If the agent skips the search and uses a cached ID from an earlier turn, that's correct behavior for sequential scenarios — downgrade to `info`.
- **SQL alternatives are acceptable.** If the agent uses `run_agent_memory_sql` instead of a specific search tool and gets the right answer, mark as `warn` not `fail`.
- **Approval gate scenarios stop at the gate.** `delete_contact` triggers an approval card. The trace shows the tool was initiated but the run paused. This is expected — mark as `pass` if the gate fired.

## References

| Reference | When to Read |
|-----------|-------------|
| [references/triage-guide.md](references/triage-guide.md) | Phase 4 — before triaging failures. Classify each failure using this guide. |

## Templates

| Template | Purpose |
|----------|---------|
| [templates/qa-report-template.md](templates/qa-report-template.md) | Copy into `docs/qa/reports/` as the report file |
