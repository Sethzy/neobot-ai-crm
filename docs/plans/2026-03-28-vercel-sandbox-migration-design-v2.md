# Vercel Sandbox Migration — Design Doc v2

**Status:** Draft v2
**Date:** 2026-03-28
**Scope:** Replace Sprites (Fly.io) + nested Claude Code agent with Vercel Sandbox + `bash-tool`
**Supersedes:** `2026-03-28-vercel-sandbox-migration-design.md` (v1 — custom `run_command` approach)

---

## 1. Problem

The current sandbox architecture has three issues:

1. **One-sandbox-per-client bottleneck.** Each client gets one persistent Sprite (Fly.io VM). If an autopilot trigger fires while the agent is already running a sandbox task, the second job queues.

2. **Nested agent complexity.** The outer agent (Gemini Flash) delegates entire coding tasks to Claude Code running inside the Sprite. This creates: two LLM billing streams, completion detection via webhooks, tmux-based detachable processes, HMAC-authenticated callbacks, progress polling, and a full async job state machine (`sprite_jobs` table).

3. **External vendor dependency.** The rest of the stack is Vercel (Functions, AI Gateway, frontend). Sprites adds Fly.io as a second compute provider.

## 2. Decision

Replace Sprites with **ephemeral Vercel Sandboxes** and replace the nested Claude Code agent with Vercel's **`bash-tool`** package. The outer agent gets a `bash` tool that runs shell commands directly. No nested agent.

### Key References

| Reference | Role |
|---|---|
| `vercel-labs/call-summary-agent-with-sandbox` | **Primary architecture reference.** Agent outside sandbox, one `bash` tool, data pre-loaded via `files` param, no `readFile`/`writeFile` exposed. |
| `vercel-labs/bash-tool` | **Implementation dependency.** `createBashTool({ sandbox, files })` handles file pre-loading + tool creation. |
| `vercel-labs/bash-tool/examples/skills-tool` | **Skill pattern reference.** Shows `createSkillTool` for progressive disclosure. We don't use this directly (our skills are in Supabase, not local filesystem) but follow the same pattern. |
| `anthropics/skills` | **Skill directory structure reference.** SKILL.md + `scripts/` + `references/` convention. |
| Tasklet `run_command` spec | **Tool behavior reference.** `command` + `timeout`, max 300s, default 60s. |
| Tasklet `11-direct-tool-access-vs-nested-agent-runtime.md` | **Architectural rationale.** Direct tools on main agent. No nested agent in sandbox. |
| Fintool lessons (Bustamante) | **Domain pattern reference.** S3-first architecture, skill-guided code generation, bash 180s timeout. |
| `bytedance/deer-flow` | **Skills-in-sandbox reference.** Skills bind-mounted into Docker containers, scripts read them from disk. 50K+ stars. |

## 3. Architecture

```
Sunder Runner (Gemini Flash via Vercel AI SDK)
│
├── Structured tools (no sandbox needed)
│   CRM, memory, triggers, connections, approvals, web, browser
│   → Vercel Functions (existing, unchanged)
│
├── bash tool ← NEW (from bash-tool package, replaces execute_in_sandbox)
│   → ephemeral Vercel Sandbox from golden snapshot (~0.4s boot)
│   → agent writes and runs shell commands (python, node, bash)
│   → files pre-loaded at sandbox creation, not per-command
│   → sandbox destroyed when runner completes
│
├── read_file / write_file tools (existing, unchanged)
│   → Supabase Storage (persistent, cross-run)
│
└── Skills (existing, unchanged)
    → discovered via frontmatter catalog in system prompt
    → loaded on demand via read_file from Supabase Storage
    → skill files also pre-loaded into sandbox for scripts to reference
```

**Key properties:**
- One LLM, one flat tool list, no nested agents
- One new tool (`bash`), one removed tool (`execute_in_sandbox`)
- Sandbox is ephemeral per-run, boots from golden snapshot
- Unlimited parallel runs per client (Vercel Pro: 2,000 concurrent)
- State persists in Supabase Storage, not sandbox filesystem
- Stable SDK (`@vercel/sandbox` + `bash-tool`), no beta persistence dependencies

## 4. The `bash` Tool

From `bash-tool` package (`createBashTool`). Replaces the current `execute_in_sandbox` tool.

### What the agent sees

One tool: `bash({ command })`. The agent writes shell commands — Python scripts, bash one-liners, `cat`, `grep`, whatever it needs. Same as the call-summary-agent reference.

### What the tool handler does

```typescript
// Lazy setup on first bash call within a runner invocation:

// 1. Build files Record from Supabase Storage + conversation data
const files = {
  ...await downloadSkillFiles(supabase, clientId, activeSkillSlug),
  ...await downloadThreadAttachments(supabase, threadId),
  "input/context.json": JSON.stringify(gatherConversationData(messages)),
};

// 2. Create sandbox from golden snapshot
const sandbox = await Sandbox.create({
  source: { type: "snapshot", snapshotId: GOLDEN_SNAPSHOT_ID },
  timeout: 5 * 60 * 1000, // 5 minutes
});

// 3. Create bash tool — writes all files to sandbox, returns tool
const { tools } = await createBashTool({
  sandbox,
  files,
  maxOutputLength: 100_000,
  onBeforeBashCall: ({ command }) => {
    // Langfuse trace logging
  },
  onAfterBashCall: ({ result }) => {
    // Langfuse trace logging
  },
});
```

### Sandbox lifecycle

- **Created:** lazily on first `bash` call in a runner invocation
- **Reused:** across all `bash` calls within the same `streamText()` loop
- **Destroyed:** in runner's `finally` block via `sandbox.stop()`
- **Per-run, not per-command:** if the agent calls `bash` three times (write script → run → fix error), all three hit the same sandbox

### Why NOT our own `run_command`

v1 of this design proposed a custom `run_command` tool with `input_data` and `timeout` params. v2 drops this in favor of `bash-tool` because:

- `bash-tool` is maintained by Vercel, battle-tested in production repos
- `input_data` is unnecessary — data goes into the `files` Record at sandbox creation as `input/context.json`
- `timeout` is handled at the sandbox level (`Sandbox.create({ timeout })`)
- Output truncation (`maxOutputLength`) is built in
- Logging hooks (`onBeforeBashCall`/`onAfterBashCall`) are built in
- One fewer custom tool to maintain

## 5. Data Flow — Complete Example

**User:** "Analyze the rental yields in this spreadsheet" (uploads `deals.xlsx`)

### Phase 1: Gather (existing tools, no sandbox)

```
Agent → read_file("/agent/skills/re-analyst/SKILL.md")
  ← methodology, preferences, references to sg-property-taxes.md

Agent → read_file("/agent/skills/re-analyst/references/sg-property-taxes.md")
  ← ABSD rates, BSD rates, property tax tiers

Agent → search_crm({ entity: "deals" })
  ← 8 deals with property details

Agent → search_market_data({ dataset: "rentals", district: "9,10,11" })
  ← district median rents
```

### Phase 2: Sandbox setup (lazy, on first `bash` call)

Tool handler builds:

```typescript
const files = {
  // User's spreadsheet (from thread attachments in Supabase Storage)
  "input/deals.xlsx": dealsXlsxBuffer,

  // Gathered data serialized from tool results
  "input/context.json": JSON.stringify({
    crm_deals: [/* 8 deals */],
    market_benchmarks: [/* district data */],
    skill_prefs: { show_psf: true, compare_to: "URA median" },
  }),

  // Skill files (from Supabase Storage)
  "skills/re-analyst/SKILL.md": skillContent,
  "skills/re-analyst/references/sg-property-taxes.md": taxContent,
  "skills/re-analyst/references/yield-benchmarks.md": benchmarkContent,
};
```

Sandbox filesystem after setup:

```
/workspace/
├── input/
│   ├── deals.xlsx
│   └── context.json
├── skills/
│   └── re-analyst/
│       ├── SKILL.md
│       └── references/
│           ├── sg-property-taxes.md
│           └── yield-benchmarks.md
└── output/                          ← agent writes results here
```

### Phase 3: Execute (bash tool)

```
Agent → bash({ command: "python3 << 'EOF'
import pandas as pd, json

df = pd.read_excel('input/deals.xlsx')
with open('input/context.json') as f:
    ctx = json.load(f)

df['annual_rent'] = df['monthly_rent'] * 12
df['gross_yield'] = (df['annual_rent'] / df['purchase_price'] * 100).round(2)

benchmarks = {b['district']: b['median_psf_rent'] for b in ctx['market_benchmarks']}
df['vs_median'] = ((df['rent_psf'] / df['district'].map(benchmarks) - 1) * 100).round(1)

df.to_excel('output/rental-analysis.xlsx', index=False)
print(df[['address','gross_yield','vs_median']].to_markdown())
EOF" })

  ← markdown table with results
```

### Phase 4: Extract and present

```
Runner cleanup (finally block):
  → sandbox.readFileToBuffer("output/rental-analysis.xlsx")
  → Upload to Supabase Storage
  → sandbox.stop()

Agent → "5 of 8 properties are above district median.
         [Download rental analysis](supabase-url)"
```

### Phase 5: Iterate (same sandbox)

```
User: "Add net yield with tax rates"

Agent → bash({ command: "python3 << 'EOF'
# ... reads same input files, adds tax calculations ...
# The agent knows tax methodology because it read sg-property-taxes.md in Phase 1
df.to_excel('output/rental-analysis-v2.xlsx', index=False)
EOF" })
```

Same sandbox, files still on disk. No re-upload.

## 6. File I/O Model

### Two filesystems, clearly separated

| Filesystem | Access tool | Persistence | Use for |
|---|---|---|---|
| **Supabase Storage** | `read_file` / `write_file` | Permanent, cross-run | Skills, SOUL.md, USER.md, MEMORY.md, output files |
| **Sandbox filesystem** | `bash` (`cat`, `grep`, etc.) | Ephemeral, per-run | Input data, scripts, intermediate work, output before extraction |

### How data moves between them

**Into sandbox (at creation):**
1. **User files** — thread attachments from Supabase Storage → `input/`
2. **Conversation data** — serialized tool results → `input/context.json`
3. **Skill files** — skill directory from Supabase Storage → `skills/{slug}/`

**Out of sandbox (at cleanup):**
1. List files in `output/`
2. Download via `sandbox.readFileToBuffer()`
3. Upload to Supabase Storage
4. Return download URLs in chat

**No bidirectional sync.** Explicit in at creation, explicit out at cleanup.

### Why no `readFile`/`writeFile` tools from bash-tool

Sunder already has `read_file` / `write_file` that operate on Supabase Storage. Exposing a second set for the sandbox would confuse the model ("which `readFile`?"). The agent reads sandbox files via `bash({ command: "cat file" })`. The call-summary-agent reference does the same — only `bash` exposed.

### Why no `input_data` param

v1 proposed a custom `input_data` parameter on `run_command`. v2 drops this. Conversation data is serialized to `input/context.json` in the `files` Record at sandbox creation time. The agent reads it with `cat input/context.json` or `json.load(open('input/context.json'))` in Python. One fewer custom parameter, same result.

## 7. Skills in the Sandbox

### What goes into the sandbox

The active skill's full directory — `SKILL.md` + all companion files (references, scripts):

```
/workspace/skills/re-analyst/
├── SKILL.md
└── references/
    ├── sg-property-taxes.md      ← tax rate tables
    └── yield-benchmarks.md       ← historical yield data
```

### What the agent reads vs what scripts read

| File type | Consumed by | When |
|---|---|---|
| `SKILL.md` body (methodology, preferences) | **The agent** via `read_file` from Supabase Storage | Phase 1 — before sandbox exists |
| Reference `.md` files (tax tables, benchmarks) | **The agent** via `read_file` for small files. **Python scripts** via filesystem for large data files. | Phase 1 (agent) or Phase 3 (scripts) |
| Companion scripts (`scripts/*.py`, `scripts/*.sh`) | **Python/bash** in the sandbox | Phase 3 — executed via `bash` |

### Why NOT `createSkillTool`

`bash-tool`'s `createSkillTool` reads skills from the local Node.js filesystem. Sunder's skills live in Supabase Storage. Our existing infrastructure handles the equivalent:

| `createSkillTool` feature | Sunder equivalent |
|---|---|
| Scan directory for SKILL.md | `discover-skills.ts` — reads frontmatter from Supabase Storage |
| Parse frontmatter (name + description) | `parseFrontmatter()` in `discover-skills.ts` |
| Progressive disclosure (metadata → full content) | System prompt lists catalog. Agent calls `read_file` to load full skill. |
| Output `files` Record for `createBashTool` | ~10 lines: download skill directory from Supabase → build Record |
| `skill` tool (load instructions on demand) | Agent uses existing `read_file` tool |

We build the `files` Record ourselves. Everything else already exists.

## 8. Golden Snapshot

Pre-built snapshot with common dependencies. Every client uses the same snapshot.

### Contents

- Python 3 + pandas, openpyxl, matplotlib, numpy
- Node 22 + vite, react, tailwindcss
- LibreOffice headless (document conversions)
- sh, bash, curl, jq, tar, unzip, zip, git
- dnf (package manager)

### Management

```bash
sandbox create --runtime node24 --timeout 1h
sandbox exec <id> "sudo dnf install -y libreoffice-calc"
sandbox exec <id> "pip3 install pandas openpyxl matplotlib numpy"
sandbox exec <id> "npm install -g vite"
sandbox snapshot <id> --expiration 0
# Store: SANDBOX_GOLDEN_SNAPSHOT_ID=snap_abc123
```

Snapshot ID as env var on Vercel. Rebuild quarterly or when deps change.

## 9. System Prompt: `<sandbox>` Block

Replaces the current `SANDBOX_PROMPT` in `src/lib/ai/system-prompt.ts`.

```typescript
export const SANDBOX_PROMPT = `<sandbox>
You have access to a Linux sandbox (Amazon Linux 2023) via the bash tool for shell commands and scripts:
- The sandbox has full network access.
- Common packages are pre-installed (pandas, openpyxl, matplotlib, numpy, Node 22, LibreOffice).

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
User files are pre-loaded at /workspace/input/ when the sandbox starts.
Skill files are at /workspace/skills/{slug}/ — including SKILL.md and reference data.
Write output files to /workspace/output/ — they will be uploaded to storage and returned as download links after the run.

- /workspace/input/ contains user-uploaded files and context.json with gathered data (read-only).
- /workspace/skills/{slug}/ contains the active skill's SKILL.md and reference files (read-only). Read reference data directly from here in your scripts.
- /workspace/output/ is where you write results the user should receive.
- /tmp/ is fast local storage but ephemeral.
- Prefer /tmp/ for I/O-heavy intermediate work. Copy only final artifacts to /workspace/output/.
</using-the-filesystem>

<processing-data>
Use python scripts or jq to run data processing or analysis in the sandbox.
IMPORTANT: Never enumerate or hard-code data from tool results in code you write.
Instead, read gathered data from /workspace/input/context.json in your code:

import json
with open('/workspace/input/context.json') as f:
    data = json.load(f)

You are *not* capable of correctly enumerating more than a few items accurately,
and hard-coding data will lead to errors.
</processing-data>

</sandbox>`;
```

## 10. Migration Path

### Dies entirely (delete)

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

### Stays as-is

| File | What it does |
|---|---|
| `external-url.ts` | SSRF protection |
| `sandbox-delivery.ts` | MIME inference, file filtering |
| `discover-skills.ts` | Skill discovery from Supabase Storage |
| `skill-bootstrap.ts` | Skill seeding |
| `skill-templates.ts` | Bundled skill content |
| All existing tools | CRM, storage, web, utility, connections, triggers, browser, market |

### Adapted

| File | Change |
|---|---|
| `types.ts` | Strip to minimal types, remove `SpriteHandle` |
| `env.ts` | `SPRITES_TOKEN` → `VERCEL_TOKEN` + `SANDBOX_GOLDEN_SNAPSHOT_ID` |
| `sandbox-paths.ts` | Base path → `/workspace` (bash-tool default) |
| `execute-in-sandbox.ts` | Rewrite as `bash` tool setup using `createBashTool`. Dramatically simpler. |
| `tool-registry.ts` | Register `bash` tool instead of `execute_in_sandbox` |
| `system-prompt.ts` | Replace `SANDBOX_PROMPT` with new block |

### New

| File | What |
|---|---|
| `vercel-sandbox-client.ts` | ~30 lines: create sandbox from snapshot, stop, read output files |
| `sandbox-files.ts` | ~40 lines: build `files` Record from Supabase Storage (skills + attachments + context) |
| DB migration | Drop `sprite_sessions` and `sprite_jobs` tables |

### New dependencies

```
bash-tool          — Vercel's bash tool for AI agents
@vercel/sandbox    — Vercel Sandbox SDK
```

### Removed dependencies

```
@fly/sprites       — Fly.io Sprites SDK
```

### Net effect

~14 files deleted, ~6 files adapted, ~2 new files. Codebase gets significantly smaller.

## 11. Unresolved Questions

1. **Vercel Function timeout.** `bash` tool is synchronous — the Vercel Function awaits sandbox command execution. Chat API route needs `maxDuration` set to 300s. Verify this works on Pro plan.

2. **Sandbox reuse within multi-step agent loop.** Store sandbox + bash tool in closure scoped to runner invocation. Pass into tool factory. Clean up in `finally` block.

3. **Output file extraction timing.** Extract files from `/workspace/output/` before `sandbox.stop()`. Need to handle: what if agent doesn't write to `output/`? What if output is in stdout only?

4. **`context.json` assembly.** Which tool results get serialized into `context.json`? All results from the current run? Only results the agent explicitly gathered for analysis? Need a heuristic or let the agent control what data goes in.

5. **`bash-tool` timeout control.** Verify whether `bash-tool` passes timeout through to `sandbox.runCommand()`. If not, the sandbox-level timeout (5 min) is the only ceiling.

6. **Preview URLs for property pages.** Vercel Sandbox supports `sandbox.domain(port)` but URL dies when sandbox stops. Defer to future PR.

## 12. Deliberate Deviations

### From Tasklet

| Deviation | Reason |
|---|---|
| `bash` tool (from bash-tool) instead of verbatim `run_command` | bash-tool is maintained by Vercel, handles truncation + hooks. Same behavior, better maintained. |
| No `action_*` params | Deferred — add across all long-running tools as a separate PR. |
| Data via `context.json` instead of FUSE mount | Sunder's sandbox is isolated from Supabase Storage. Data pre-loaded at creation. |
| Amazon Linux instead of Alpine | Vercel Sandbox base OS. |

### From `bash-tool` full stack

| What we skip | Why |
|---|---|
| `createSkillTool` | Reads from local filesystem. Our skills are in Supabase Storage. We build the `files` Record ourselves (~10 lines). |
| `readFile` / `writeFile` tools | Sunder already has `read_file` / `write_file` for Supabase. Two sets of file tools would confuse the model. Agent uses `bash({ command: "cat file" })` for sandbox files. Same as call-summary-agent reference. |
| `skill` tool | Sunder's progressive disclosure already works via system prompt catalog + `read_file`. |

### From Fintool

| What we skip | Why |
|---|---|
| FUSE-mounted S3 | Vercel Sandbox doesn't support custom FUSE mounts. Pre-load at creation instead. |
| Skill shadowing (private > shared > public) | No org-level multi-tenancy yet. Single tier per client. |
| Sandbox pre-warming | Golden snapshot boots in ~0.4s. Fast enough without pre-warming. |
| Temporal durability | Sunder's runs are bounded (< 5 min). User retries on failure. |
