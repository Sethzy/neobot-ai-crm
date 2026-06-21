# QA Test Suite

Automated QA pipeline for NeoBot's agent. Sends chat prompts to the running app, verifies tool usage via Langfuse traces, and produces triaged reports with per-scenario cost and efficiency analysis.

## How It Works

```
scenarios.ts ──→ run-qa.ts ──→ manifest.json ──→ analyze.ts ──→ analysis.json
                                                                      │
                                                              Claude /qa skill
                                                                      │
                                                              docs/qa/reports/
```

### 1. Scenarios (`scenarios.ts`)

73 chat prompts across 11 surfaces, each declaring:
- **surface** — which feature area (e.g. `03-crm-tools`, `17-calculate`)
- **scenario** — test name (e.g. `commission-calc`, `demo-moment`)
- **prompt** — the exact message sent to the agent
- **expectedTools** — tool names the agent should call (e.g. `["calculate"]`)
- **sequential** — whether this depends on a prior scenario in the same surface (shares a thread)
- **tokenBudget** — optional token ceiling (defaults based on tool count: 0→10K, 1→20K, 2-3→35K, 4+→50K)
- **latencyBudgetMs** — optional latency ceiling (defaults: 0→10s, 1→15s, 2-3→25s, 4+→40s)
- **expectedOutput** — optional regex to validate the agent's text response (e.g., calculate scenarios)

Surfaces map to `docs/qa/XX-*.md` files which contain the manual QA checklists and expected behavior for each scenario.

### 2. Runner (`run-qa.ts`)

Authenticates as the QA user, groups scenarios by surface (one thread per surface), and sends each prompt sequentially via `POST /api/chat`. Consumes the full SSE stream, extracts text content from stream deltas, records HTTP status / latency / response size / response content, and writes a **manifest JSON** to `scripts/qa/output/`.

File naming: `qa-{surfaces}-{YYYYMMDD}-{hash}.json`
- `qa-17-20260313-a3f2.json` — single surface
- `qa-03-17-20260313-b1c8.json` — multi surface
- `qa-all-20260313-c9d4.json` — full run

### 3. Analyzer (`analyze.ts`)

Takes a manifest path, performs per-scenario analysis:

1. **Trace attribution** — fetches Langfuse traces ordered by timestamp, matches each trace to its scenario (filters out title-generation traces)
2. **Tool verification** — extracts tool calls from observations, compares against `expectedTools`
3. **Step sequence** — records the GENERATION → TOOL → GENERATION execution flow per scenario
4. **Token/cost tracking** — sums prompt tokens, completion tokens, and cost from GENERATION observations per scenario
5. **Budget checks** — flags scenarios exceeding their token or latency budgets
6. **Baseline regression** — if `baseline.json` exists, compares current vs previous tokens/latency (>30% token increase or >50% latency increase = warn)
7. **Output validation** — checks agent's text response against `expectedOutput` regex patterns
8. **Context bloat detection** — tracks step-1 prompt tokens to identify system prompt bloat (>8K = warning)

Produces a **pass/fail/warn/skip verdict** per scenario and writes an **analysis JSON** alongside the manifest.

### 4. Triage & Report (Claude `/qa` skill)

The `/qa` Claude Code skill orchestrates the full pipeline: run → analyze → triage failures → write report. For each failure, it pulls the actual Langfuse trace data, classifies the root cause, and writes findings into a report at `docs/qa/reports/`.

## Folder Structure

```
scripts/qa/
├── README.md              ← you are here
├── scenarios.ts           ← all 73 test scenarios
├── run-qa.ts              ← sends prompts, writes manifest
├── analyze.ts             ← fetches traces, writes analysis
├── test-single.ts         ← send a single prompt (debugging)
├── diag-stamp-duty.ts     ← one-off diagnostic script
└── output/
    ├── qa-{surfaces}-{date}-{hash}.json
    ├── qa-{surfaces}-{date}-{hash}-analysis.json
    └── baseline.json      ← saved from a known-good run

docs/qa/
├── README.md              ← surface index + execution order
├── XX-*.md                ← per-surface manual QA checklists (22 surfaces)
├── phase-1-manual-qa.md   ← legacy Phase 1 checklist
└── reports/
    └── qa-report-{surfaces}-{date}-{hash}.md

.agents/skills/qa/
├── SKILL.md               ← skill definition (phases, workflow, guidance)
├── references/
│   └── triage-guide.md    ← failure classification guide
└── templates/
    └── qa-report-template.md  ← report template
```

## Usage

### Quick: run via Claude Code skill

```
/qa              # run all 73 scenarios
/qa 17           # run only surface 17 (calculate)
/qa 03,17        # run surfaces 03 + 17
```

The skill handles everything: run → wait → analyze → triage → report.

### Manual: run scripts directly

```bash
# 1. Start the dev server
npm run neo

# 2. Run scenarios (env vars or .env.local)
QA_USER_EMAIL=x QA_USER_PASSWORD=y npx tsx scripts/qa/run-qa.ts

# 3. Wait ~8s for Langfuse traces to flush, then analyze
npx tsx scripts/qa/analyze.ts scripts/qa/output/qa-all-20260313-a3f2.json

# 4. Save as baseline for future regression detection
npx tsx scripts/qa/analyze.ts scripts/qa/output/qa-all-20260313-a3f2.json --save-baseline
```

### Env vars

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `QA_USER_EMAIL` | Yes | — | Test user email |
| `QA_USER_PASSWORD` | Yes | — | Test user password |
| `QA_BASE_URL` | No | `http://localhost:3000` | App URL |
| `QA_SURFACES` | No | all | Comma-separated prefixes (e.g. `03,17`) |
| `QA_DELAY_MS` | No | `2000` | Delay between requests (ms) |
| `QA_DRY_RUN` | No | `0` | Set to `1` to print scenarios without sending |
| `LANGFUSE_SECRET_KEY` | Yes (analyze) | — | From `.env.local` |
| `LANGFUSE_PUBLIC_KEY` | Yes (analyze) | — | From `.env.local` |

## Surfaces

| # | Surface | Scenarios | Key Tools Tested |
|---|---------|-----------|------------------|
| 02 | Chat Core | 3 | rename_chat |
| 03 | CRM Tools | 22 | create_record, search_crm, update_record, delete_records, link_records, create_interaction, create_task, update_task, configure_crm |
| 06 | File & Memory | 8 | read_file, write_file |
| 07 | Platform Intelligence | 15 | run_sql, get_agent_db_schema, manage_todo, list_todo, web_search, web_scrape, calculate_drive_time, ask_user_question |
| 08 | Triggers | 5 | setup_trigger, manage_active_triggers, search_triggers |
| 10 | Connections | 3 | list_users_connections, search_for_integrations, get_integrations_capabilities |
| 11 | Subagents | 2 | run_subagent |
| 12 | Approvals | 4 | create_record, delete_records (gate test) |
| 17 | Calculate | 5 | calculate |
| 18 | Agent Views | 5 | search_crm, run_sql |

## Verdicts

| Verdict | Meaning |
|---------|---------|
| **pass** | Expected tools called, within budget, no errors |
| **fail** | Missing expected tools, errors in trace, or output mismatch |
| **warn** | Extra tools, budget exceeded, regression detected, or slow response |
| **skip** | HTTP error prevented the scenario from running |

## Efficiency Tracking

### Token Budgets

Default budgets scale with expected tool count:

| Tool Count | Token Budget | Latency Budget |
|------------|-------------|----------------|
| 0 (no tools) | 15,000 | 10s |
| 1 tool | 40,000 | 15s |
| 2-3 tools | 80,000 | 25s |
| 4+ tools | 120,000 | 40s |

Budgets account for ~12K base context (system prompt + CRM vocabulary + memory).

Override per scenario via `tokenBudget` and `latencyBudgetMs` fields.

### Baseline Regression

Run with `--save-baseline` after a clean run to save current metrics. Future runs compare against the baseline:
- Token increase >30% → `warn`
- Latency increase >50% → `warn`

Baseline stored at `scripts/qa/output/baseline.json`.

### Context Bloat Detection

The analyzer tracks step-1 prompt tokens — the initial context size before the agent does anything. This measures system prompt + memory + CRM vocabulary overhead:
- <5K: healthy
- 5K-8K: normal for scenarios with context
- >8K: potential bloat
- >15K: critical — investigate system-reminder contents

## Output Validation

Scenarios with `expectedOutput` regex patterns (currently calculate scenarios) validate the agent's actual text response. Mismatches are flagged as failures with the `output-mismatch` category.

## Known Limitations

- **Trace attribution depends on flush timing.** Langfuse traces are written asynchronously. If the analyzer runs too soon after the runner, some traces may be missing. Default wait is 8 seconds.
- **Step-1 context size may include prior turns.** For sequential scenarios (not the first in a surface), the step-1 prompt tokens include the conversation history from earlier scenarios.
- **No response content validation for non-deterministic scenarios.** The analyzer checks which tools were called and (for some scenarios) the text output, but most scenarios lack `expectedOutput` patterns. Manual spot-checks are still needed.
- **Sequential scenario cascades.** If scenario N fails in a surface, scenarios N+1..N+k that depend on it will also fail. The triage guide handles this via cascade classification.
