# Viktor Scheduling & Triggers

Source: Direct Q&A with Viktor instance (2026-03-16)

## Two Types of Crons

Real cron expressions, not polling loops.

### Agent Crons
- Fires on schedule, spawns a **full agent thread with a prompt**
- LLM-powered — the agent rediscovers state from files each run
- Example: `create_agent_cron(path="/reports/weekly", cron="0 9 * * 1", description="Generate weekly summary...")`

### Script Crons
- Fires on schedule, **runs a Python script directly**
- No LLM involved — deterministic, cheaper
- For work that doesn't need reasoning (data syncs, checks, etc.)

## Cron State & Memory

Each cron has its own directory:

```
/work/crons/{name}/
├── task.json          # cron config
├── LEARNINGS.md       # persistent memory across runs (auto-accumulated)
├── execution.log      # run history
└── scripts/           # automation scripts
```

**LEARNINGS.md is the cron's persistent memory.** Each run can append what it learned, so future runs benefit. This is the equivalent of Tasklet's "engineer for rediscovery" pattern, but with an explicit learnings file instead of a database.

## Fresh Start on Each Fire

Same as Tasklet: when a cron fires, **it starts fresh**. The cron description (prompt) is injected, then the agent rediscovers state from files. No conversation history carried over.

## Chaining Crons

Two mechanisms:

### 1. `dependent_paths`
A cron can wait for another cron/thread to finish before running. **DAG-style dependency.**

### 2. `condition_script_path`
A Python script runs first:
- Exit code `0` → proceed with the cron
- Non-zero → skip this run

Example: "only run if new emails arrived" — the condition script checks for new emails, returns 0 if found.

## No Native Event Triggers (Yet)

No "when email arrives, do X" triggers. Workaround: frequent script cron that checks for the event and conditionally triggers the real work.

## Comparison to Tasklet Triggers

| Feature | Tasklet | Viktor |
|---|---|---|
| Trigger types | Schedule, Webhook, RSS, Text, Email Replies, Gmail | Schedule only (agent cron + script cron) |
| Event-driven | Yes (webhook, email, RSS) | No (polling via script cron) |
| State persistence | SQLite + `/agent/home/` files | `LEARNINGS.md` + `/work/crons/{name}/` files |
| Chaining | Not documented | `dependent_paths` (DAG) + `condition_script_path` |
| Non-LLM execution | Not available | Script crons (Python, no LLM) |
| Fresh start per fire | Yes | Yes |

## Comparison to Sunder Triggers

| Feature | Sunder | Viktor |
|---|---|---|
| Trigger types | Agent triggers + cron scanner + pulse | Agent cron + script cron |
| Event-driven | Yes (agent_triggers table) | No |
| Scheduling | Cron expressions via scanner | Real cron expressions |
| State persistence | Supabase (runs table, thread state) | Files (LEARNINGS.md, execution.log) |
| Chaining | Not built | DAG via `dependent_paths` |
| Non-LLM execution | Not available | Script crons |
| Condition gates | Not built | `condition_script_path` |

## Key Insights for Sunder

1. **Script crons are clever** — for deterministic recurring work (data syncs, checks), skip the LLM entirely. Run a script. Sunder could do this for pulse tasks that don't need reasoning.
2. **`condition_script_path` is a cheap gate** — run a quick check before burning LLM tokens. Sunder's pulse could benefit from a pre-check: "are there actually new items to process?"
3. **LEARNINGS.md as cron memory** — simple, elegant. Each cron accumulates knowledge run-over-run in a file. Sunder could adopt this for autopilot runs.
4. **DAG-style chaining** — `dependent_paths` lets you build pipelines. Sunder doesn't have this yet.
