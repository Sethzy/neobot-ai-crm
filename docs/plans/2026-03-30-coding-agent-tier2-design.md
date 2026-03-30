# Coding Agent (Tier 2) — Deferred Design Doc

**Status:** Deferred — build when bash-tool (tier 1) proves insufficient
**Date:** 2026-03-30
**Scope:** Add async Claude Code sandbox tool for complex multi-file coding tasks
**Depends on:** Vercel Sandbox + bash-tool migration (tier 1) being complete

---

## 1. Problem

Sunder's bash-tool (tier 1) handles bounded sandbox tasks well — spreadsheet analysis, document conversion, simple scripts. But some tasks require iterative multi-file code generation with self-correction (e.g., property page scaffolding with React components, charts, and styling). Gemini Flash writing complex code via bash heredocs hits a quality ceiling.

## 2. Decision

Add an optional tier-2 coding agent tool that delegates complex tasks to Claude Code running inside a Vercel Sandbox. The outer agent (Gemini Flash) chooses which tier to use based on task complexity.

**Key properties:**
- Async fire-and-forget — Vercel Function exits after launching, reconnects later
- Claude Code CLI with `--output-format stream-json` for structured progress
- `--resume sessionId` for follow-up interactions on the same sandbox
- One DB table (`sandbox_jobs`) tracks sandbox lifecycle
- Sandbox auto-terminates on timeout — no cleanup cron needed
- Builds on bash-tool's golden snapshot (just add `claude` CLI)

**What this is NOT:**
- Not the community provider (`ai-sdk-provider-claude-code`) — that's sync/in-process, doesn't solve the long-running problem
- Not a replacement for the runner — the outer agent still orchestrates, this is just a tool
- Not v1 — deferred until bash-tool proves insufficient

### Why not the community provider

The `ai-sdk-provider-claude-code` (by ben-vargas, v3.4.4, 322 stars) wraps the Claude Agent SDK as an AI SDK `LanguageModelV3` provider. It's well-maintained and drops into `streamText()`. However:

- It's **synchronous** — holds the Vercel Function open for the entire Claude Code execution
- On Pro plan (300s max function duration), this caps complex coding tasks at ~5 minutes
- The underlying `@anthropic-ai/claude-agent-sdk` is still 0.x and changes frequently (30+ breaking changes tracked)

The community provider is viable for tasks under 5 minutes. For long-running code generation (15+ minutes), the detached sandbox pattern is required.

### Why not Sprites (what we had)

The previous Sprites (Fly.io) implementation was 4,600 lines covering: custom Fly.io SDK wrapper, tmux-based process management, HMAC-authenticated webhook callbacks, async job state machine (`sprite_jobs` table with 6 states), progress polling, per-client persistent VMs, Claude Code CLI spawning, env var construction, superpowers/skill loading, and a cleanup cron.

The root complexity: managing the full lifecycle of a remote VM + a process inside it + async completion detection. Every one of those pieces had edge cases.

The Vercel Sandbox pattern eliminates ~90% of this. The SDK handles subprocess orchestration. `detached: true` + `Sandbox.get()` replaces webhooks + polling + state machines. Auto-timeout replaces cleanup crons.

## 3. Architecture

```
Sunder Runner (Gemini Flash via Vercel AI SDK)
│
├── Existing tools (unchanged)
│   CRM, memory, triggers, connections, approvals, web, browser
│
├── bash tool (tier 1) ← from bash-tool package
│   → ephemeral Vercel Sandbox, sync, 5-15s
│   → Gemini Flash writes and runs scripts directly
│
└── coding_agent tool (tier 2) ← NEW, deferred
    → Vercel Sandbox with Claude Code CLI
    → async fire-and-forget, 1-60 min
    → returns job ID immediately
    → outer agent polls or waits for completion
```

### Execution flow

1. Outer agent calls `coding_agent({ task, files })` tool
2. Tool handler creates Vercel Sandbox from golden snapshot
3. Writes task prompt + input files into sandbox
4. Runs `claude --prompt "..." --stream-json --dangerously-skip-permissions` with `detached: true`
5. Stores `{ sandboxId, cmdId }` in `sandbox_jobs` table
6. Returns `{ jobId, status: "running" }` to outer agent immediately
7. Outer agent tells user "working on it" and continues
8. Cron endpoint: `Sandbox.get()` → `getCommand()` → `cmd.exitCode`
9. On completion: extract files from `/workspace/output/`, upload to Supabase Storage
10. `sandbox.stop()`

### Two interaction patterns

- **Fire-and-forget:** agent tells user "I've started the coding task, I'll have results shortly" — a cron checks completion and delivers results via a new message
- **Wait-in-loop:** agent calls `coding_agent_status({ jobId })` on subsequent steps until done — works if total time fits within function timeout

## 4. DB Schema

One table: `sandbox_jobs`

```sql
create table sandbox_jobs (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id),
  thread_id     uuid not null references threads(id),
  sandbox_id    text not null,
  cmd_id        text,
  status        text not null default 'running',
  task_prompt   text not null,
  session_id    text,
  output_urls   jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- RLS: client_id isolation (standard Sunder pattern)
alter table sandbox_jobs enable row level security;
```

**Status values:** `running` | `completed` | `failed` | `timeout`

No state machine with transitions — just 4 terminal states. Status is derived from checking `cmd.exitCode` on the sandbox, then written once.

## 5. Tools & API

**Two tools exposed to the outer agent:**

| Tool | Purpose |
|---|---|
| `coding_agent({ task, input_files? })` | Launch a Claude Code sandbox job. Returns `{ jobId }`. |
| `coding_agent_status({ job_id })` | Check job status. Returns `{ status, output_urls?, error? }`. |

**One cron endpoint:**

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/cron/check-sandbox-jobs` | Every 30s | Poll running jobs, extract results on completion, update DB |

The cron checks each running job: `Sandbox.get()` → `getCommand()` → if `exitCode !== null`, extract results + update DB. If sandbox timeout expired, mark as `timeout`.

## 6. File Layout

**New files (~4):**

```
src/lib/sandbox/
├── coding-agent.ts          -- ~80 lines: create sandbox, write files,
│                                launch claude CLI detached, insert DB row
├── coding-agent-status.ts   -- ~40 lines: Sandbox.get(), check exitCode,
│                                extract output files, upload to Supabase
└── coding-agent-types.ts    -- ~20 lines: SandboxJob type, tool schemas

app/api/cron/check-sandbox-jobs/
└── route.ts                 -- ~50 lines: query running jobs, call status check,
                                  update DB, deliver results to thread
```

**Modified files (~3):**

| File | Change |
|---|---|
| `src/lib/runner/tool-registry.ts` | Register `coding_agent` + `coding_agent_status` tools |
| `src/lib/ai/system-prompt.ts` | Add `<coding-agent>` block to system prompt |
| `vercel.json` | Add cron schedule for `check-sandbox-jobs` |

**Golden snapshot change:**

Add `claude` CLI to the existing bash-tool snapshot:

```bash
sandbox exec <id> "curl -fsSL https://claude.ai/install.sh | bash"
# Re-snapshot, update SANDBOX_GOLDEN_SNAPSHOT_ID env var
```

**System prompt addition:**

```
<coding-agent>
For complex multi-file coding tasks (property pages, multi-step data pipelines,
anything requiring iterative debugging), use coding_agent instead of bash.
coding_agent delegates to a dedicated coding agent that can read, write, edit,
and run code across multiple files with self-correction.
For simple scripts and one-off commands, use bash.
</coding-agent>
```

## 7. Key Patterns

**From Vercel's coding-agent-template (`vercel-labs/coding-agent-template`):**

- **`--output-format stream-json`** — Claude CLI outputs newline-delimited JSON. Each line has `type: "assistant"` (with content blocks) or `type: "result"` (with `session_id`). The cron job can parse the last lines of stdout to extract results.
- **`--resume sessionId`** — stored in `sandbox_jobs.session_id`. If the user says "actually, also add a chart to that page," the outer agent can launch a follow-up on the same sandbox with context preserved.
- **`--dangerously-skip-permissions`** — required for automated execution. Sandbox isolation is the security boundary, not Claude Code's permission model.

**Timeout layers:**

| Layer | Limit | Behavior |
|---|---|---|
| Vercel Sandbox | Configurable, up to 5 hours (Pro) | VM killed, all processes die |
| Claude Code `maxTurns` | Configurable per launch | Agent stops after N internal turns |
| Cron staleness check | `created_at` + max duration | Mark as `timeout` if sandbox expired |

## 8. Cost Model

| Cost | Driver |
|---|---|
| Anthropic tokens (Sonnet) | Dominant. Multi-turn coding = many tokens. |
| Vercel Sandbox compute | $0.128/active CPU hour. 15-min task ≈ $0.03. |
| Vercel Cron | Negligible (30s interval, ~1s execution per check). |

**Controls:** `maxTurns` on Claude CLI, sandbox timeout, per-job budget limits (Agent SDK supports `--max-budget-usd` — verify CLI flag).

## 9. Comparison: Tier 1 vs Tier 2

| | bash-tool (tier 1) | coding_agent (tier 2) |
|---|---|---|
| **Model** | Gemini Flash (outer agent) | Claude Sonnet (inner agent) |
| **Execution** | Sync, in-request | Async, fire-and-forget |
| **Duration** | 5-15 seconds | 1-60 minutes |
| **Code quality** | Good for scripts | Excellent for multi-file |
| **Self-correction** | Outer agent reads error, retries | Claude Code handles internally |
| **Cost** | Single model billing | Dual model billing |
| **Complexity** | ~0 custom code (bash-tool package) | ~200 lines + 1 DB table + 1 cron |

## 10. Unresolved Questions

1. **Result delivery.** When the cron detects completion, how does the result get back to the user? Options: (a) insert a system message into the thread and trigger a notification, (b) start a new runner invocation that picks up the results and responds naturally. Leaning toward (b) — feels more conversational.

2. **Sandbox keep-alive for follow-ups.** If the user wants to iterate ("now add charts"), do we keep the sandbox alive between cron checks? Or create a fresh one with `--resume`? The coding-agent-template uses keep-alive, but that costs compute while idle.

3. **Cost controls.** Claude Code in a sandbox burns both Anthropic tokens (Sonnet/Opus) and Vercel compute. Need per-job budget limits. The Agent SDK supports `maxBudgetUsd` — verify the CLI flag equivalent.

4. **Which Claude model.** Sonnet is the sweet spot (fast + good at code). Opus for truly complex tasks. Could be a parameter on the tool, or hardcoded to Sonnet for v1.

5. **Auth.** The sandbox needs `ANTHROPIC_API_KEY` (or AI Gateway key). The coding-agent-template injects it via env vars on `runCommand`. Verify Vercel Sandbox credentials brokering works for this, or if we just pass the key directly.

## 11. References

| Reference | What to use it for |
|---|---|
| `vercel-labs/coding-agent-template` | Production pattern: Claude CLI in sandbox, `--stream-json`, `--resume`, detached mode, stdout parsing |
| `ai-sdk-provider-claude-code` (ben-vargas) | Community provider evaluation. Viable for sync/short tasks, not for long-running. |
| `roadmap docs/.../aisdk-claudecode/com-plugin` | Claude Agent SDK reference doc with hosting architecture, cost model, decision framework |
| `2026-03-28-vercel-sandbox-migration-design-v2.md` | Tier 1 (bash-tool) design. This doc builds on top of it. |
| Vercel Sandbox SDK: `Sandbox.get()`, `getCommand()`, `detached: true` | Core API for the fire-and-forget pattern |
