# Vercel Sandbox Migration — Design Doc

**Status:** Draft v1
**Date:** 2026-03-28
**Scope:** Replace Sprites (Fly.io) + nested Claude Code agent with Vercel Sandbox + direct `run_command` tool

---

## 1. Problem

The current sandbox architecture has three issues:

1. **One-sandbox-per-client bottleneck.** Each client gets one persistent Sprite (Fly.io VM). If an autopilot trigger fires while the agent is already running a sandbox task, the second job queues. This serializes work that should be parallel.

2. **Nested agent complexity.** The outer agent (Gemini Flash) delegates entire coding tasks to Claude Code running inside the Sprite. This creates dual-agent orchestration: two LLM billing streams, completion detection via webhooks, tmux-based detachable processes, HMAC-authenticated callbacks, progress polling, and a full async job state machine (`sprite_jobs` table).

3. **External vendor dependency.** The rest of the stack is Vercel (Functions, AI Gateway, frontend). Sprites adds Fly.io as a second compute provider with its own auth, SDK, billing, and operational surface.

## 2. Decision

Replace Sprites with **ephemeral Vercel Sandboxes** and replace the nested Claude Code agent with a **direct `run_command` tool** on the outer agent.

### Why Vercel Sandbox

| Criteria | Sprites (current) | Vercel Sandbox |
|---|---|---|
| **Parallelism** | 1 per client | 2,000 concurrent (Pro) |
| **Cost model** | Pay while sleeping + storage | Pay only for active CPU |
| **Platform** | External (Fly.io) | Native (same as Functions, AI Gateway) |
| **SDK** | Custom wrapper (`sprites-client.ts`) | First-party `@vercel/sandbox` |
| **Boot time** | <1s checkpoint/restore | ~0.4s from snapshot |

### Why Direct `run_command` (No Nested Agent)

Confirmed by both reference architectures:

- **Tasklet** (`11-direct-tool-access-vs-nested-agent-runtime.md`): *"Tasklet does NOT need to run a second Agent SDK instance inside the sandbox. Avoid: agent-inside-sandbox nesting unless strict process isolation is an explicit requirement."*
- **Fintool** (Bustamante, lessons from 2 years building): Agent has direct bash access (180s timeout, 100K char output limit), `read_file`, `write_file`. No nested agent. Skills are markdown files.

The outer agent (Gemini Flash) is capable of writing Python/Node code for Sunder's bounded tasks (spreadsheet analysis, property page generation). These are not open-ended coding problems requiring an autonomous coding agent with 100 turns of self-correction.

## 3. Architecture

```
Sunder Runner (Gemini Flash via Vercel AI SDK)
│
├── Structured tools (no sandbox needed)
│   CRM, memory, triggers, connections, approvals, web, browser
│   → Vercel Functions (existing, unchanged)
│
├── run_command tool ← NEW (replaces execute_in_sandbox)
│   → spins up Vercel Sandbox from golden snapshot (~0.4s)
│   → runs shell command (python, node, bash)
│   → returns stdout/stderr to agent
│   → agent iterates if errors (another run_command call, same sandbox)
│   → sandbox destroyed when runner completes
│
├── read_file / write_file tools (existing, unchanged)
│   → Supabase Storage (persistent, cross-run)
│
└── Skills (markdown, from Supabase Storage)
    → loaded into system prompt per-run (existing, unchanged)
```

**Key properties:**
- One LLM, one flat tool list, no nested agents
- Sandbox is ephemeral per-run, boots from golden snapshot
- Unlimited parallel runs per client (Vercel Pro: 2,000 concurrent)
- State persists in Supabase Storage, not sandbox filesystem
- Stable SDK only (`@vercel/sandbox`), no beta persistence dependencies

## 4. The `run_command` Tool

Replaces the current `execute_in_sandbox` tool. Instead of delegating an entire task to a nested Claude Code agent, the outer agent directly generates and runs commands.

### Tool Definition

```typescript
{
  name: "run_command",
  description: "Execute a shell command in an isolated sandbox environment.",
  parameters: {
    command: string,     // shell command to execute
    timeout?: number,    // seconds, default 60, max 300
  }
}
```

### Execution Flow

1. Agent decides it needs to run code (e.g., "analyze this spreadsheet")
2. Agent calls `run_command({ command: "python3 analyze.py" })`
3. Tool handler checks if a sandbox is already active for this run — if not, creates one from the golden snapshot
4. Uploads any needed files from Supabase Storage into the sandbox (input files, skill files)
5. Runs the command via `sandbox.runCommand()`
6. Returns stdout/stderr (truncated to ~100K chars) to the agent
7. Agent reads output, iterates if needed (another `run_command` call reuses the same sandbox)
8. Sandbox destroyed when the runner completes the full agent loop

### Sandbox Lifecycle: Per-Run, Not Per-Command

If the agent calls `run_command` three times in one conversation turn (write script, run it, fix error, run again), all three use the same sandbox instance. The sandbox is created lazily on first `run_command` call and destroyed in the runner's cleanup phase (`finally` block after `streamText` resolves).

### Reference Patterns

- **Tasklet:** `run_command` tool with `command` + `timeout` (max 300s). Simple.
- **Fintool:** Bash tool with 180s timeout, 100K char output limit. Persistent shell access.
- **Vercel `call-summary-agent`:** `createBashTool({ sandbox })` with `onBeforeBashCall`/`onAfterBashCall` hooks.

## 5. File I/O Between Supabase and Sandbox

The agent works with two filesystems: **Supabase Storage** (persistent, cross-run) and the **sandbox filesystem** (ephemeral, per-run). Files move between them explicitly.

### Upload Into Sandbox (on first `run_command`)

When the sandbox spins up, the tool handler pre-loads:
- **Input files** — files the user uploaded in this conversation (spreadsheets, CSVs, PDFs). Tracked in thread/message context.
- **Skill files** — the client's `SKILL.md` files from Supabase Storage, if the run involves a skill.

Files written to `/vercel/sandbox/input/` via `sandbox.writeFiles()`. The system prompt tells the agent: "User files are available at `/vercel/sandbox/input/`."

### Download From Sandbox (before cleanup)

When the agent produces output files (`.xlsx`, HTML page, chart image), it writes them to `/vercel/sandbox/output/`. Before the sandbox is destroyed:
1. List files in `/vercel/sandbox/output/`
2. Download via `sandbox.readFileToBuffer()`
3. Upload to Supabase Storage under the client's directory
4. Return download URLs to the agent for inclusion in the chat response

### No Bidirectional Sync

Explicit upload-before-run, download-after-run. Not a mounted filesystem. Simple, predictable, no race conditions.

**Reference:** Fintool's S3-first architecture — files round-trip through object storage, sandbox is scratch space. Tasklet's model — persistent zones (`/agent/home/`) map to Supabase Storage, ephemeral zones (`/tmp/`) map to sandbox filesystem.

## 6. Golden Snapshot

Pre-built snapshot with common dependencies. Every client uses the same snapshot. Client-specific files come from Supabase Storage at runtime.

### Snapshot Contents

- **Python 3** + `pandas`, `openpyxl`, `matplotlib`, `numpy` (spreadsheet analysis)
- **Node 22** + `vite`, `react`, `tailwindcss` (property page generation)
- **LibreOffice** headless (xlsx to PDF conversion)
- **Common CLI tools** on base image (`git`, `curl`, `jq`)

### Snapshot Management

One snapshot, manually rebuilt when dependencies change:

```bash
sandbox create --runtime node24 --timeout 1h
sandbox exec <id> "sudo dnf install -y libreoffice-calc"
sandbox exec <id> "pip3 install pandas openpyxl matplotlib numpy"
sandbox exec <id> "npm install -g vite"
sandbox snapshot <id>
# Store snapshot ID as env var: SANDBOX_GOLDEN_SNAPSHOT_ID=snap_abc123
```

Snapshot ID stored as environment variable on Vercel deployment. Updating = one env var change + redeploy.

Set `expiration: 0` (no expiry) on the golden snapshot. Rebuild quarterly or when dependencies need updating.

## 7. Migration Path

### Dies Entirely (delete)

| File | What it was |
|---|---|
| `sprites-client.ts` | Fly.io SDK wrapper |
| `run-claude-in-sprite.ts` | Claude Code CLI launcher, tmux spawn |
| `sprite-jobs.ts` | Async job state machine, HMAC webhooks, progress polling |
| `superpowers/index.ts` | Claude Code skill files, `.installed` marker |
| `claude-env.ts` | Claude Code env var construction |
| `app/api/sandbox/callback/route.ts` | Webhook callback endpoint |
| `app/api/cron/cleanup-sprites/route.ts` | Stale Sprite cleanup cron |
| `sprite_sessions` DB table | Per-client Sprite tracking |
| `sprite_jobs` DB table | Async job state machine |
| ~8 test files | Associated tests |
| `@fly/sprites` npm dependency | Fly.io SDK |

### Stays As-Is (no change)

| File | What it does |
|---|---|
| `external-url.ts` | SSRF protection |
| `sandbox-delivery.ts` | MIME inference, file filtering |
| `skill-loader.ts` | Loads skill files from Supabase Storage |
| `tools/sandbox/index.ts` | Barrel export |

### Adapted (rename + simplify)

| File | Change |
|---|---|
| `types.ts` | Strip to `RunCommandResult`, remove `SpriteHandle` |
| `env.ts` | `SPRITES_TOKEN` → `VERCEL_TOKEN`, add `SANDBOX_GOLDEN_SNAPSHOT_ID` |
| `sandbox-paths.ts` | Base path `/workspace` → `/vercel/sandbox` |
| `execute-in-sandbox.ts` | Rewrite as `run_command` tool. ~80% simpler. |

### New (create)

| File | What |
|---|---|
| `vercel-sandbox-client.ts` | Thin wrapper: create from snapshot, run command, write/read files, stop. ~50 lines. |
| DB migration | Drop `sprite_sessions` and `sprite_jobs` tables |

### Net Effect

~14 files deleted, ~4 files adapted, ~1 new file. Codebase gets significantly smaller.

## 8. Verbatim Specifications

These are the exact tool definition and system prompt text that the implementation must use. Adapted from Tasklet's production patterns with Sunder-specific paths and runtime.

### 8.1 Tool Definition: `run_command`

```typescript
/**
 * @file run_command tool — executes shell commands in Vercel Sandbox.
 *
 * Adapted verbatim from Tasklet's run_command tool spec (v2).
 * Reference: tasklet tools/built-in/v2/03-run_command.md
 */
export const runCommandTool = tool({
  description: 'Executes shell commands in the sandbox environment.',
  inputSchema: z.object({
    command: z
      .string()
      .describe('The shell command to execute in the sandbox environment.'),
    timeout: z
      .number()
      .max(300)
      .optional()
      .describe('Timeout in seconds for the command. Defaults to 60 seconds.'),
  }),
  execute: async ({ command, timeout }) => {
    // Implementation: see Section 4 (execution flow)
  },
});
```

### 8.2 System Prompt: `<sandbox>` Block

Replaces the current `SANDBOX_PROMPT` export in `src/lib/ai/system-prompt.ts`. Use this text verbatim.

```typescript
export const SANDBOX_PROMPT = `<sandbox>
You have access to a Linux sandbox (Amazon Linux 2023) via run_command for shell commands and scripts:
- Commands have a default timeout of 1m, configurable up to 5m.
- The sandbox has full network access.

<when-to-use>
Use the sandbox for:
- Running scripts (Python, shell, etc.)
- Processing and analyzing data
- File manipulation and conversions
- Using command-line tools

Do NOT use the sandbox for tasks requiring a browser or GUI. For those, use browse_website.
Do NOT use the sandbox to call external services or APIs (e.g., via curl) unless explicitly requested by the user.
</when-to-use>

<using-the-filesystem>
User files are pre-loaded at /vercel/sandbox/input/ when the sandbox starts.
Write output files to /vercel/sandbox/output/ — they will be uploaded to storage and returned as download links after the run.

- /vercel/sandbox/input/ contains user-uploaded files and skill files (read-only).
- /vercel/sandbox/output/ is where you write results the user should receive.
- /tmp/ is fast local storage but ephemeral.
- Prefer /tmp/ for I/O-heavy intermediate work such as extracting large archives or processing many files. Do the work in /tmp/, then copy only the final artifacts to /vercel/sandbox/output/.
</using-the-filesystem>

<available-tools>
The sandbox is ephemeral — installed packages are lost after each run.
Preinstalled on the golden snapshot:
- Python 3 with pandas, openpyxl, matplotlib, numpy
- Node 22 with vite, react, tailwindcss
- LibreOffice (headless, for document conversions)
- sh, bash, curl, jq, tar, unzip, zip, git
- dnf (package manager, if you need additional system packages)
</available-tools>

<executing-code>
Common packages (pandas, openpyxl, matplotlib, numpy) are pre-installed. Use them directly:
\`\`\`
python3 << 'EOF'
import pandas as pd
df = pd.read_excel('/vercel/sandbox/input/data.xlsx')
print(df.describe())
df.to_csv('/vercel/sandbox/output/summary.csv', index=False)
EOF
\`\`\`

For packages not on the golden snapshot, install with pip:
\`\`\`
pip install some-package && python3 script.py
\`\`\`
</executing-code>

<processing-data>
Use python scripts or jq to run data processing or analysis on tool results in the sandbox.
IMPORTANT: Never enumerate or hard-code data from tool results in code you write. Instead always read the tool result from the filesystem and process it in code.
You are *not* capable of correctly enumerating more than a few items accurately, and hard-coding data will lead to errors.
</processing-data>

</sandbox>`;
```

### 8.3 What Was NOT Taken from Tasklet (and why)

| Tasklet section | Why not needed in Sunder |
|---|---|
| `<filesystem>` — `/agent/` persistent FUSE mount | Sunder's persistent storage is Supabase Storage, accessed via `read_file`/`write_file` tools that run on Vercel Functions (not in the sandbox). The sandbox only sees pre-uploaded input files and writes to an output directory. There is no FUSE mount. |
| `<sql-db>` — sandbox-local SQLite | Sunder's `run_sql` tool queries Supabase Postgres directly from Vercel Functions. The agent doesn't need a sandbox to run SQL — it has a dedicated tool for that. Tasklet uses sandbox-local SQLite because their persistence model is file-based; Sunder's is database-first. |
| `<context-management>` | Already implemented in Sunder's system prompt with `toolcalls/` path convention. |
| `<blocks>` | Already implemented as Sunder's `toolcalls/{toolCallId}/` convention. |
| `<subagents>` | Already implemented in Sunder. |
| `<skills>` | Already implemented in Sunder. |
| `action_*` params | Deferred — will add across all long-running tools as a separate PR. Adding to only `run_command` while other tools lack it would be inconsistent. |

## 9. Unresolved Questions

1. **Vercel Function timeout vs sandbox timeout.** `run_command` is synchronous — the Vercel Function awaits `sandbox.runCommand()`. Pro plan max function duration is 300s (configurable). Fintool uses 180s, Tasklet uses 300s max. Likely: set chat API route `maxDuration` to 300s, accept 300s as the hard ceiling for any single command.

2. **Sandbox reuse within multi-step agent loop.** The runner calls `streamText()` with `maxSteps`. If the agent calls `run_command` on step 3 and step 7, the sandbox must survive across steps. Implementation: store sandbox instance in closure scoped to runner invocation, pass into tool factory, clean up in `finally` block.

3. **File upload timing.** Upload all thread-attached files on first `run_command` call (lazy sandbox creation). Agent can `write_file` additional content into the sandbox via `run_command("cat > /vercel/sandbox/input/script.py << 'EOF'\n...\nEOF")` or via a dedicated file-write mechanism.

4. **Preview URLs for property pages.** Vercel Sandbox supports `sandbox.domain(port)` for published ports, but the URL dies when the sandbox is destroyed. For persistent previews, deploy the built artifact to Supabase Storage or HereNow. Deferrable — not needed for spreadsheet analysis in v1.

5. **Cost at scale.** 2-vCPU sandbox for 5 minutes ≈ $0.03. At ~10 sandbox runs/client/day = $0.30/client/day ≈ $9/client/month. Acceptable, but monitor.

## 9. Reference Materials

| Reference | Key takeaway |
|---|---|
| Tasklet `11-direct-tool-access-vs-nested-agent-runtime.md` | Direct tools on main agent. No nested agent in sandbox. |
| Tasklet `01-core-runtime-model.md` | Sandbox is infrastructure for `run_command`, not a workspace. |
| Tasklet `03-run_command.md` | Tool spec: `command` + `timeout`, max 300s. |
| Fintool lessons (Bustamante) | S3-first architecture, bash tool with 180s timeout, skill shadowing. |
| Fintool `vercel-testing-bash-is-all-you-need.md` | Hybrid bash+SQL beats pure bash for structured data. |
| `vercel-labs/coding-agent-template` | `Sandbox.create()`, `runCommand({ detached: true })`, golden snapshot patterns. |
| `vercel-labs/call-summary-agent-with-sandbox` | `createBashTool({ sandbox })`, ephemeral per-run sandbox. |
| `vercel-labs/openreview` | Durable workflow steps, `finally`-block cleanup, `Sandbox.get()` per tool call. |
| Vercel Sandbox docs | Stable SDK: create, runCommand, writeFiles, readFile, snapshot, stop. |
