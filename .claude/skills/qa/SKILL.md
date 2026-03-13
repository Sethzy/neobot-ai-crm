---
name: qa
description: Run automated LLM QA scenarios against the Sunder chat API, analyze Langfuse traces for tool call correctness, and triage failures with trace evidence. Use when asked to "run QA", "test surfaces", "check the agent", or "/qa". Supports surface filtering (e.g., "/qa 03,17"). Produces a structured report with root-cause triage for every failure.
allowed-tools: Bash(npx tsx scripts/qa/*), Bash(langfuse api *), Bash(mkdir *), Bash(cp *), Bash(cat scripts/qa/output/*), Bash(curl -s http://localhost:*), Bash(curl -u *), Bash(npm run dev *), Bash(lsof -i *), Bash(sleep *), Bash(kill *)
---

# QA

Run predefined chat scenarios against the Sunder agent, analyze Langfuse traces, and triage every failure with trace evidence. Tracks per-scenario token usage, cost, and latency budgets. Supports baseline regression detection.

## Setup

Only the **surface filter** is optional. Everything else has defaults.

| Parameter | Default | Example override |
|-----------|---------|-----------------|
| **Surfaces** | ALL (57 scenarios, 11 surfaces) | `/qa 03,17` runs only CRM tools + calculate |
| **Base URL** | `http://localhost:3000` | Set `QA_BASE_URL` env var |
| **Delay between requests** | 2000ms | Set `QA_DELAY_MS` env var |
| **Output directory** | `scripts/qa/output/` | — |
| **Report directory** | `docs/qa/reports/` | — |
| **Save baseline** | No | Pass `--save-baseline` to analyzer |

### File naming

All output files follow: `qa-{surfaces}-{YYYYMMDD}-{hash}.json`

Examples:
- `qa-17-20260313-a3f2.json` — surface 17 only
- `qa-03-17-20260313-b1c8.json` — surfaces 03 + 17
- `qa-all-20260313-c9d4.json` — full run

Analysis files append `-analysis.json`. Reports use `qa-report-{surfaces}-{YYYYMMDD}-{hash}.md`.

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

Automatically verify and start the dev server if needed:

```bash
# 1. Check if server is already running on port 3000
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/chat 2>/dev/null)

if [ "$HTTP_CODE" = "000" ]; then
  # 2. Server not running — start it in background
  npm run dev --port 3000 &

  # 3. Wait for it to be ready (poll every 2s, max 60s)
  for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/chat 2>/dev/null)
    if [ "$CODE" != "000" ]; then
      echo "Dev server ready on port 3000"
      break
    fi
    sleep 2
  done
fi
```

If the server still isn't responding after 60 seconds, tell the user to check for build errors and start the server manually with `npm run dev` in a separate terminal.

## Workflow

```
1. Init        Parse args, create dirs, copy report template
2. Run         Execute run-qa.ts — send all prompts, save manifest
3. Analyze     Execute analyze.ts — per-scenario traces, budgets, baselines
4. Triage      For each failure: pull Langfuse trace, diagnose root cause
5. Report      Fill template with efficiency data, summarize to user
```

### 1. Init

Parse surface filter from skill args. If `/qa 03,17`, set `QA_SURFACES=03,17`. If `/qa` with no args, run all surfaces.

Determine the report file name:
- Build `{surfaceLabel}` from `QA_SURFACES` (e.g., `03-17`) or `all`
- Date: `YYYYMMDD` format
- Hash: will be derived after manifest is written

```bash
mkdir -p docs/qa/reports scripts/qa/output
```

Fill in the report header fields after the run completes (once you have the actual manifest/analysis paths).

### 2. Run

```bash
QA_USER_EMAIL={EMAIL} QA_USER_PASSWORD={PASSWORD} QA_SURFACES={SURFACES} QA_BASE_URL={BASE_URL} npx tsx scripts/qa/run-qa.ts
```

The script prints progress to stdout and saves a manifest JSON to `scripts/qa/output/qa-{surfaces}-{date}-{hash}.json`. Capture the manifest path from the output.

**New in v2:** The manifest includes:
- `meta` object with surfaceLabel, date, baseUrl, timing
- `responseContent` per scenario (extracted text from SSE stream for output matching)

This step takes 1-10 minutes depending on scenario count and server response times. Let it run to completion.

### 3. Analyze

Wait 8 seconds after the run completes for Langfuse traces to flush, then:

```bash
npx tsx scripts/qa/analyze.ts {MANIFEST_PATH}
```

To also save results as the new baseline for future regression detection:

```bash
npx tsx scripts/qa/analyze.ts {MANIFEST_PATH} --save-baseline
```

The analyzer now does:
1. **Per-scenario trace attribution** — matches each Langfuse trace to its scenario by timestamp order (not thread-level aggregation)
2. **Step sequence extraction** — records GEN → TOOL → GEN execution flow per scenario
3. **Per-scenario token/cost tracking** — prompt tokens, completion tokens, estimated cost from Langfuse
4. **Token budget checks** — compares against scenario-specific or default budgets based on tool count
5. **Latency budget checks** — flags scenarios exceeding their latency ceiling
6. **Baseline regression detection** — if `baseline.json` exists, flags >30% token increase or >50% latency increase
7. **Output validation** — for scenarios with `expectedOutput` regex, checks if the response matches
8. **Step-1 context size** — tracks initial prompt tokens to detect system prompt bloat

Read the analysis JSON and count verdicts:
- If all pass → skip triage, go to Phase 5
- If any fail or warn → proceed to Phase 4

### 4. Triage

Read [references/triage-guide.md](references/triage-guide.md) before starting triage.

For each failure or warning in the analysis JSON:

**Step 1 — Quick classification.** Check the `errors` array first:
- Contains "rate limit" or "429" or "free credits" → classify as `infra`, skip deep triage
- Contains "context length" → classify as `model-error`
- Contains "Token budget exceeded" → classify as `over-budget`, investigate context bloat
- Contains "Output mismatch" → classify as `output-mismatch`, check if the math is wrong or the regex needs updating
- Contains "Token regression" or "Latency regression" → classify as `regression`, compare against previous run
- Empty errors but `missingTools` → proceed to deep triage

**Step 2 — Fetch trace data.** The analysis JSON now includes `traceId` per scenario. Use it directly:

```bash
curl -s -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
  "https://cloud.langfuse.com/api/public/traces/{TRACE_ID}" | jq .
```

**Step 3 — Read observations.** For the specific trace:

```bash
curl -s -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
  "https://cloud.langfuse.com/api/public/observations?traceId={TRACE_ID}&limit=50" | jq '.data[] | {type, name, totalTokens, statusMessage}'
```

Look for:
- **GENERATION** observations — check `output` for tool calls, `statusMessage` for errors, `promptTokens` for context size
- **TOOL** observations — check `name` for tool name, `input` for args, `output` for result

**Step 4 — If deeper detail needed**, get a specific observation:

```bash
curl -s -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
  "https://cloud.langfuse.com/api/public/observations/{OBSERVATION_ID}" | jq .
```

**Step 5 — Classify the failure** using the triage guide categories and write the finding in the report.

**Cascade detection:** For sequential scenarios, check if the previous scenario in the same surface failed. If so, classify as `cascade` and link to the root failure. Do not deep-triage cascades.

### 5. Report

1. Copy the report template to `docs/qa/reports/qa-report-{surfaces}-{date}-{hash}.md`
2. Fill in the per-surface results table with all scenarios (including new columns: Steps, Tokens, Cost).
3. Fill in the **Efficiency Analysis** section:
   - Per-scenario token breakdown (prompt vs completion)
   - Budget exceeded flags
   - Step-1 context size check
   - Step sequences
4. Fill in the **Baseline Comparison** section if baseline was used.
5. Fill in the **Output Validation** section for scenarios with `expectedOutput`.
6. Write a triage block for each failure (use the template format).
7. Group infrastructure issues in the dedicated section.
8. Update summary counts to match actual findings.
9. Tell the user: report path, top-line pass/fail counts, cost summary, and the most critical findings.

## Efficiency Interpretation

### Token budgets

Default budgets by tool count (can be overridden per scenario). Accounts for ~12K base context:
- 0 tools: 15K tokens
- 1 tool: 40K tokens
- 2-3 tools: 80K tokens
- 4+ tools: 120K tokens

If a scenario exceeds its budget, check:
1. **Step count** — Is the model doing unnecessary intermediate steps? Each step resends the full context.
2. **Step-1 prompt tokens** — Is the initial context (system prompt + memory + CRM vocab) too large?
3. **Extra tools** — Did the model call tools it didn't need?

### Context bloat signals

- Step-1 prompt tokens >8K for a simple scenario → system prompt or injected context is too large
- Step-1 prompt tokens >15K → critical bloat, investigate system-reminder contents
- Prompt tokens growing significantly between runs → memory files or CRM vocabulary growing unchecked

### Regression thresholds

- Token increase >30% → `warn` (investigate what changed — prompt, tools, model behavior?)
- Latency increase >50% → `warn` (may indicate model routing change, context growth, or infra issue)

## Guidance

- **Triage is the valuable step.** Do not skip it even if there are many failures. A report with verdicts but no root causes is not useful.
- **Read actual trace data before diagnosing.** Do not guess from error messages alone. The `errors` array in the analysis JSON often describes symptoms, not causes.
- **Missing tools != broken tool.** The most common cause of `missingTools` is the model chose not to call the tool — it answered directly instead. Check the GENERATION output to confirm.
- **Extra tools are usually benign.** The agent may use `read_file`, `search_crm`, or other helper tools not in the expected list. Mark as `info` unless the extra tool caused a side effect.
- **Sequential failures cascade.** If scenario N fails, scenarios N+1..N+k that depend on it will also fail. Find the root failure and mark the rest as `cascade`.
- **Rate limits are infra, not bugs.** Separate them from agent behavior problems.
- **Per-scenario trace matching depends on trace flush timing.** If the analyzer reports "No matching Langfuse trace found," increase the wait time between run and analyze steps.
- **Check for "search then act" patterns.** Many CRM scenarios expect `search_X` then `update_X`. If the agent skips the search and uses a cached ID from an earlier turn, that's correct behavior for sequential scenarios — downgrade to `info`.
- **SQL alternatives are acceptable.** If the agent uses `run_sql` instead of a specific search tool and gets the right answer, mark as `warn` not `fail`.
- **Approval gate scenarios stop at the gate.** `delete_records` triggers an approval card. The trace shows the tool was initiated but the run paused. This is expected — mark as `pass` if the gate fired.
- **Output validation is only for deterministic scenarios.** Currently only the calculate scenarios have `expectedOutput`. A mismatch might mean the regex needs updating, not that the agent is wrong.
- **Save baseline after a clean run.** Use `--save-baseline` when you have a known-good run to anchor future regression detection.

## References

| Reference | When to Read |
|-----------|-------------|
| [references/triage-guide.md](references/triage-guide.md) | Phase 4 — before triaging failures. Classify each failure using this guide. |

## Templates

| Template | Purpose |
|----------|---------|
| [templates/qa-report-template.md](templates/qa-report-template.md) | Copy into `docs/qa/reports/` as the report file |
