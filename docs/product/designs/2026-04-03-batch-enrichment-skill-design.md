# Batch Enrichment Skill — Design

**Date:** 2026-04-03
**Status:** Draft
**Related:** `docs/product/designs/crm-event-triggers.md` (deferred — this is the YAGNI alternative for v1)

---

## Problem

Users want to enrich CRM records (companies, contacts, deals) or imported CSV leads at scale. Today, the agent can enrich one record at a time via sequential tool calls — but at 500 records, that's 1500+ tool calls across hundreds of LLM steps. Too slow, too expensive, and hits `maxSteps` limits.

This is a universal problem in agent platforms. Tasklet (our reference architecture) explicitly acknowledges that 500+ records is "wrong tool for the job" for agent-in-the-loop execution and recommends handing off to an external job runner. LangChain's GTM agent solves it with parallel subagents on dedicated infrastructure. DenchClaw runs scripts as child processes with 8-way concurrency.

## Solution

A **batch enrichment skill** — a pre-built Node script that runs in the sandbox as a single `bash` tool call. The agent plans the job, the script executes everything deterministically (search, scrape, extract, write back to CRM), then reports results to the user.

**One tool call. One script. All 500 records.**

---

## Design Principle: Two-Tier Tool Architecture

From reverse-engineering production AI agents (Fintool research, `references/Fintool/`):

> Every serious agent has structured tools for safety + an escape hatch for power.

```
┌──────────────────────────────────────────────────────────────┐
│  TIER 1: STRUCTURED CRM TOOLS (safe, validated)              │
│  search_crm, create_record, update_record, link_records      │
│  ✓ Overwrite protection (dedup detection)                    │
│  ✓ Tenant isolation (client_id scoped)                       │
│  ✓ Analytics events                                          │
│  ✓ One-at-a-time, tool-level validation                      │
│  Use for: individual record operations, user-initiated edits │
├──────────────────────────────────────────────────────────────┤
│  TIER 2: SANDBOX / BASH (escape hatch)                       │
│  bash → runs scripts in isolated Vercel Sandbox VM           │
│  ✗ No per-record validation                                  │
│  ✗ No overwrite protection                                   │
│  ✓ Concurrent execution (8-16 parallel)                      │
│  ✓ Direct API access (credential-brokered)                   │
│  ✓ Direct DB access (credential-brokered)                    │
│  Use for: batch operations, data processing, bulk I/O        │
└──────────────────────────────────────────────────────────────┘
```

Batch enrichment is a tier 2 operation. The structured CRM tools are the wrong tool for 500 records — same as how Claude Code uses `bash` instead of `Edit` when it needs to modify 100 files.

---

## Constraints

- Must fit within a single 13-minute sandbox execution
- No new infrastructure (no job queues, workflow engines, or API routes)
- No LLM calls in the per-record loop (cost control)
- API keys + DB credentials handled via credential brokering (never exist inside the sandbox VM)
- Works for both CRM records and uploaded CSV files

## Capacity

| Records | Concurrency | Estimated time | Fits in 13 min? |
|---------|-------------|----------------|-----------------|
| 100     | 8           | ~1 min         | Yes             |
| 500     | 8           | ~3-5 min       | Yes             |
| 1000    | 12          | ~5-8 min       | Yes             |
| 2000+   | —           | —              | Needs long-running process |

---

## Execution Flow

### Phase 1: Agent plans the job (~10s, 2-3 tool calls)

User says something like:

> "Enrich all my companies — get their website, industry, employee count, and a short description from web search."

The agent:

1. Reads the skill instruction file (`skills/batch-enrich/instruction.md`)
2. Queries CRM for target records via `search_crm` or `run_sql`
3. Writes `config.json` to the sandbox workspace via `bash`

```json
{
  "records": [
    { "id": "uuid-1", "name": "Acme Corp", "website": "acme.com" },
    { "id": "uuid-2", "name": "FooBar Logistics", "website": null }
  ],
  "fields": ["industry", "employee_count", "description"],
  "source": "brave+scrape",
  "concurrency": 8,
  "supabase_url": "https://xxx.supabase.co",
  "table": "companies",
  "pk": "company_id"
}
```

For CSV imports: the agent uploads the CSV to the sandbox and writes a config that points to the file path instead of CRM record IDs.

### Phase 2: Skill script runs (~3-8 min, 1 bash tool call)

The pre-built script (`skills/batch-enrich/enrich.js`) does everything:

```
bash: node enrich.js

Script internally:
  1. Read config.json
  2. For each record at 8 concurrent:
     ├── Brave search: curl api.search.brave.com (auth injected by sandbox)
     ├── Pick best result URL
     ├── Exa scrape: curl api.exa.ai (auth injected by sandbox)
     ├── Extract fields from scraped text (heuristics + patterns)
     ├── Write enriched record to Supabase REST API (auth injected by sandbox)
     └── Append to results.json (checkpoint)
  3. Print summary to stdout
```

**The script handles search, scrape, extraction, AND writeback.** The agent doesn't need to touch the results — they're already in the CRM by the time the script finishes.

**Credential brokering:** The sandbox's network policy intercepts outbound HTTPS requests and injects auth headers:
- `api.search.brave.com` → `X-Subscription-Token` header
- `api.exa.ai` → `x-api-key` header
- `xxx.supabase.co` → `apikey` + `Authorization` headers

No API keys or DB credentials exist inside the VM. The script does plain `curl`/`fetch` and the sandbox handles auth transparently.

**Field extraction:** The script uses pattern matching on scraped text:
- **Industry:** match against a known industry list
- **Employee count:** regex for "X employees" / "team of X" / LinkedIn-style ranges
- **Description:** first 2-3 sentences of the About page
- **Location:** address patterns, HQ mentions

For fields that can't be reliably extracted, the record gets flagged as `low_confidence` rather than guessed.

**Checkpointing:** Results are written incrementally to `results.json`. If the sandbox dies at record 450, the file has 450 results already written to the CRM. The agent can read the checkpoint and decide whether to re-run the remaining 50.

**Error handling per record:**
- Search returns no results → `failed`, reason: `no_results`
- Scrape fails (403, timeout) → `failed`, reason: `scrape_failed`
- DB write fails → `failed`, reason: `write_failed`
- Irrelevant results (e.g., "Delta" matches Delta Airlines) → `low_confidence`

### Phase 3: Agent reports results (~10s, 1 LLM step)

The script prints a summary to stdout. The agent reads it and reports to the user:

```
"Done. Enriched 487 of 500 companies:
 - 475 high confidence — written to CRM
 - 12 low confidence — flagged for review (see below)
 - 13 failed — no web presence found

 Low confidence records:
 - Delta Corp: matched Delta Airlines — is this correct?
 - ABC Ltd: found multiple companies with this name
 ..."
```

**That's it. Two tool calls from the agent (fetch records + run script), one LLM step for the report.**

### Optional Phase 3b: LLM cleanup pass

If the user wants higher quality extraction (or the heuristics miss too many fields), the agent can read `results.json` and run batched LLM calls to normalize the extracted data:

- Batch 25-50 records per `generateText` call
- "Extract industry, employee_count, description from these raw snippets"
- ~10-20 LLM calls for 500 records
- Write corrections back via `run_sql`

This is optional — the heuristic extraction in the script handles the common cases. The LLM cleanup pass is for when the user wants polish.

---

## CSV Import Variant

Same skill, different input source.

### How it works

**Phase 1 (adapted):** The agent reads the uploaded CSV in the sandbox via bash, infers column mapping from headers (e.g., "Company Name" → `name`, "Website" → `website`), and builds the same `config.json`. If headers are ambiguous, the agent asks the user.

**Phase 2:** Identical — the skill script doesn't know or care where the records came from. For CSV imports, it writes to CRM via Supabase REST (creating new records via POST) instead of updating existing ones (PATCH).

**Phase 3:** Same reporting.

### Additional agent responsibilities for CSV

- **Column mapping** — inferred from headers, confirmed with user if ambiguous
- **Dedup** — before running the script, agent checks for existing CRM records via `search_crm` or `run_sql` with `WHERE name IN (...)`. Duplicates flagged, not silently skipped.
- **Create vs update decision** — agent asks user what to do with duplicates

### Example flow

```
User: [uploads leads.csv] "Import these and enrich — add industry and company size"

Agent:
  1. bash: head leads.csv → ["Company", "Contact Email", "Website"]
  2. Agent maps columns: Company → name, Website → website
  3. run_sql: SELECT name FROM companies → checks for existing matches
  4. Reports: "200 companies in CSV. 12 already exist in CRM. Import the other 188?"
  5. User confirms
  6. Writes config.json (mode: "create", 188 records)
  7. bash: node enrich.js → searches, scrapes, creates records, enriches
  8. Reports: "188 companies imported and enriched."
```

---

## Skill File Structure

```
skills/batch-enrich/
  instruction.md    ← agent reads this to understand how to invoke the skill
  enrich.js         ← the sandbox script (search + scrape + extract + writeback)
```

### `instruction.md`

Tells the agent:
- What this skill does and when to use it
- How to assemble `config.json` (schema, required/optional fields)
- How to handle CSV imports (column mapping, dedup)
- How to read the script's stdout summary
- When to offer the optional LLM cleanup pass

### `enrich.js`

Standalone Node script. No external dependencies beyond Node 24 builtins (`fetch`, `fs`, `path`).

**Input:** `config.json` in sandbox workspace
**Output:** `results.json` in sandbox workspace + records written directly to Supabase

Key implementation details:
- Work-stealing concurrency queue (configurable, default 8)
- Per-record timeout (10s search + 15s scrape + 5s write)
- Incremental checkpoint writes to `results.json`
- Structured error capture per record
- Stdout summary for the agent to read
- Exit code 0 even on partial failure (errors are in the output, not the exit code)

---

## Credential Brokering Setup

The sandbox network policy needs these broker rules:

| Domain | Header injected | Purpose |
|--------|----------------|---------|
| `api.search.brave.com` | `X-Subscription-Token: {BRAVE_SEARCH_API_KEY}` | Web search |
| `api.exa.ai` | `x-api-key: {EXA_API_KEY}` | Web scrape |
| `xxx.supabase.co` | `apikey: {SUPABASE_ANON_KEY}` + `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` | CRM writeback |

The Brave and Exa brokering is already implemented. The Supabase brokering needs to be added to `create-lazy-bash-tool.ts`.

---

## Estimated Cost

| Component | Per 500 records |
|-----------|----------------|
| Brave Search API | ~$0.50 (free tier) or ~$0.005 (paid) |
| Exa Scrape API | ~$0.50-1.00 |
| LLM (agent planning + report) | ~$0.02 |
| LLM cleanup pass (optional) | ~$0.10-0.20 |
| **Total** | **~$0.55-1.25** |

Without the optional LLM cleanup, it's ~$0.55-1.00 for 500 records. The script does extraction via heuristics, so the LLM cost is just the agent's planning and reporting steps.

---

## Platform Comparison

| | Sunder (this design) | Tasklet | DenchClaw | LangChain GTM |
|---|---|---|---|---|
| **Execution** | Sandbox script (parallel) | Sequential subagents | Child processes (8 concurrent) | Parallel subagents (LangSmith) |
| **LLM per record** | No (heuristic extraction) | Yes (each subagent) | No (script-based) | Yes (each subagent) |
| **500 record capacity** | ~5 min | "Wrong tool for the job" | ~2 min | Depends on infra |
| **New infra needed** | None (sandbox exists) | External job runner | None (built-in) | LangSmith deployment |
| **API auth model** | Credential brokering | Tool-level (structured) | Env vars in process | Tool-level |

---

## What's NOT in scope (v1)

- **No UI** — invoked via chat only, results reported in chat
- **No progress streaming** — user waits for sandbox to finish, sees summary after
- **No enrichment providers** (Clearbit, Apollo) — web search + scrape only
- **No workflow engine** — sandbox script is the execution engine
- **No records over ~1500** — beyond that, need long-running process
- **No scheduled enrichment** — manual invocation only

---

## Migration Path

The skill is designed with clean JSON contracts so it can be promoted later:

1. **v1 (now):** Single script in sandbox. Agent orchestrates. Heuristic extraction.
2. **v2 (if needed):** Extract to Vercel Function. Add structured workflow steps (AI SDK patterns). Add progress streaming. Add LLM extraction as a default step.
3. **v3 (if needed):** Add enrichment provider integrations. Add a UI for record selection and progress tracking. Add scheduled/triggered batch runs.

The `config.json` → `results.json` contract stays the same at each level.

---

## Unresolved Questions

1. **Brave rate limits** — Free tier is 2,000 queries/month. One 500-record run uses 25% of the monthly quota. Need to confirm per-second rate limits and whether to add delays. Users on paid Brave plans won't hit this.
2. **Exa reliability** — Some sites block Exa's scraper. Should the script fall back to a raw `fetch` + HTML parsing? Or just mark those as `scrape_failed`?
3. **Supabase credential brokering** — Need to add the Supabase broker rule to the sandbox network policy. This is the one code change required beyond writing the skill files.
4. **Heuristic extraction quality** — Pattern matching for industry/employee count will miss edge cases. How bad is "good enough"? The optional LLM cleanup pass is the escape valve, but it adds cost and time.
5. **Overwrite protection** — The script writes directly to Supabase, bypassing `update_record`'s dedup and overwrite logic. The instruction file should tell the agent to only enrich records that have empty fields, but this is prompt-level safety, not structural.
