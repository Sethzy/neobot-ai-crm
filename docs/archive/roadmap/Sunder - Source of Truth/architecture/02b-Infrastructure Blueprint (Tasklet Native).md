# Infrastructure Blueprint — Tasklet Native (Reference Comparison)

> **Version:** 1.9
> **Date:** February 24, 2026
> **Status:** Reference only. This documents how Tasklet's architecture works. Compare side-by-side with `02-Infrastructure Blueprint.md` (Sunder) and `03-Fintool Architecture Comparison.md` (three-way comparison).
> **Source:** `../references/tasklet/` (full platform analysis, including deep-dive traces: `tools-skills-subagents.md`, `csv-lead-cleaning-sandbox-workflow.md`, `skills-deep-dive-connection-generation-trace.md`, `gmail-sandbox-execution-trace.md`, `per-agent-data-model.md`, `task-list-system/00-task-list-live-trace.md`)
> **Changelog:** v1.9 — **CORRECTED: No sandbox gap.** Both `@vercel/sandbox` and E2B natively support per-session sandbox reuse. Sandbox is a persistent object — create once, `.exec()` many times. Vercel explicitly documents "persistent sandbox across serverless invocations" via `Sandbox.get({ sandboxId })`. AI SDK agent-skills cookbook shows the exact wiring: sandbox passed via `experimental_context`, shared across all tool calls. This eliminates the "real drift" for always-available shell. Moved shell from "real drift" to "zero drift". Likely choice: `@vercel/sandbox`. Updated comparison tables, decision framework, and cost model. v1.8 — **CORRECTED: Sandbox lifecycle is per-session, not per-command.** First `run_command` in a session boots the sandbox; subsequent `run_command` calls reuse the same container (new shell process, same container). Installed packages, `/tmp/` files, and container state persist WITHIN a session. Session ends → sandbox destroyed → all of the above is gone. Confirmed by Tasklet dev via live test (cowsay installed in call 1, still available in call 2; `/tmp/` marker file persisted; uptime continuous 1.72s → 11.46s, not reset). Updated Flow A, Code Execution section, and Provider Matrix. v1.7 — Added Task List System section: live-traced CRUD lifecycle, "not a queue" architecture (zero execution semantics), trigger+task resume pattern for amnesiac workers, Sunder implementation mapping (~20 lines), and deliberate extension (status lifecycle, approval gating, dual CRM/Agent task model). New reference: `task-list-system/`. v1.6 — **RESOLVED: Single agent per client.** Collapsed user + agent into `client_id` as sole scoping key. All Tasklet patterns map 1:1 with zero architectural drift — only the key name changes (`agent_id` → `client_id`). No `agents` table, no isolation logic, no multi-agent routing in V1. Subagents remain as computation delegation (not identity separation). Added future-proofing path for multi-agent if needed (migration, not rewrite). v1.5 — Added Agent Isolation Model section: user-to-agent relationship (1:many). **Key correction: connections are user-level (shared), not agent-level.** One OAuth token per service per user; each agent activates its own tool subset from shared connections. Storage (filesystem + SQL database) remains fully isolated per agent. Expanded SQL Database section with "database as continuity between amnesiac workers" pattern and filesystem-vs-database decision matrix. New reference: `per-agent-data-model.md`. v1.4 — Added dual integration system analysis (static vs Pipedream paths), `builtBy` taxonomy, quality scoring, tool execution routing, credential split, and Sunder/Composio mapping. New section: "Integration System: Static vs Pipedream." Updated Provider Matrix, Skills, and drift tables. New reference: `integrations-pipedream/`. v1.3 — Added system skill vs connection skill pointer mechanism distinction, tool name prefixing for OAuth routing, platform truncation → toolcalls disk-save pattern, Phase 0 context assembly details, gmail-sandbox cross-environment trace reference. v1.2 — Added system-reminder injection pattern, skill lazy-loading mechanics, connection skill auto-generation, subagent "naked context" detail, three-tier sandbox reframe. v1.1 — Audit corrections: Tasklet compute is ephemeral, not persistent. v1.0 — Initial reference mapping.

---

## Why This Document Exists

`02-Infrastructure Blueprint.md` defines our serverless architecture (Vercel + Trigger.dev + Supabase Storage). This document maps the same concerns to Tasklet's native architecture — ephemeral compute with persistent cloud-backed filesystem, SQL database, and managed orchestration — so we can see exactly what drifts and what's equivalent.

---

## Architecture Shape: Ephemeral Compute + Persistent Storage + Managed Orchestration

```
┌──────────────────────────────────────────────────────────────┐
│                    TASKLET PLATFORM                           │
│          (managed infrastructure, no user deployment)         │
│                                                              │
│  Per agent:  ephemeral sandbox (Alpine Linux 3.23)           │
│              + FUSE-mounted cloud filesystem (/agent/)       │
│              + fast ephemeral /tmp (native, lost on exit)    │
│  Scheduler:  managed trigger system (cron, webhook, RSS)     │
│  Database:   per-agent SQL database (system-managed)         │
│  Tools:      platform-provided tool surface                  │
│                                                              │
│  SANDBOX LIFECYCLE (per-session, NOT per-command):            │
│  First run_command → sandbox boots                           │
│  Subsequent run_command → new shell process, SAME container  │
│  Packages, /tmp/ files persist WITHIN the session.           │
│  Session ends → sandbox destroyed → all of above is gone.    │
│  Only /agent/ (FUSE) and SQL persist across sessions.        │
└──────────────────────────────────────────────────────────────┘
```

---

## Agent Isolation Model: Users Own Agents, Agents Own Storage

> **Full reference:** `../references/tasklet/per-agent-data-model.md`

A user is **not** an agent. A user **owns** agents. One user can have many agents. **Connections are user-level (shared); storage is agent-level (isolated):**

```
User (owner)
  |
  +-- CONNECTIONS (user-level, shared across all agents)
  |     +-- Gmail (conn_abc...) -- one OAuth token
  |     +-- HubSpot (conn_xyz...) -- one OAuth token
  |
  +-- Agent 1: "Email Briefing Bot"
  |     +-- own /agent/home/ filesystem          <- ISOLATED
  |     +-- own SQL database                     <- ISOLATED
  |     +-- own triggers (daily 9am cron)        <- ISOLATED
  |     +-- Gmail: 2 of 16 tools activated       <- picks from shared connection
  |
  +-- Agent 2: "Lead Research Assistant"
  |     +-- own /agent/home/ filesystem          <- ISOLATED
  |     +-- own SQL database                     <- ISOLATED
  |     +-- own triggers (webhook from CRM)      <- ISOLATED
  |     +-- HubSpot: 5 of 12 tools activated
  |     +-- Gmail: 8 of 16 tools activated       <- same token, different tool set
  |
  +-- Agent 3: "Content Scheduler"
        +-- own /agent/home/ filesystem          <- ISOLATED
        +-- own SQL database                     <- ISOLATED
        +-- own triggers (weekly cron)           <- ISOLATED
        +-- (no tools activated)
```

### What's shared vs what's isolated

**Shared (user-level):** Connections and their OAuth tokens. The tool `list_users_connections` (not `list_agent_connections`) confirms this. Agent 2 needing Gmail doesn't re-authenticate — it activates tools from the same connection. The Settings page shows connections because they belong to the user.

**Isolated (per-agent):** Filesystem, SQL database, triggers, subagent instructions, and which tools from each connection are activated. Each agent gets its own skill file when it activates tools.

### Isolation guarantees

- Agent 1 **cannot** read Agent 2's files or query Agent 2's database
- No inter-agent communication — the user is the only bridge
- Creating a new agent starts blank: empty filesystem, empty database, no triggers — but it can immediately activate tools from existing user-level connections

### Why this split

| Benefit | What it prevents |
|---|---|
| No cross-contamination | One buggy SQL query can't corrupt another agent's tables |
| Clean context | Each agent's system-reminder only shows its own state |
| Independent lifecycles | Delete one agent, nothing happens to others |
| Shared connections | No duplicate OAuth flows — one token per service per user |

| Trade-off | What it costs |
|---|---|
| No shared knowledge | Agent 1's research is invisible to Agent 2 |
| No collaboration | No inter-agent messaging or delegation |
| Duplicate state | Two agents tracking same leads = two copies |

### Sunder design decision (RESOLVED — single agent per client)

**Sunder collapses user + agent into one concept: `client_id`.** This is the single deliberate drift from Tasklet, and it simplifies the entire architecture:

```
TASKLET:    user → connections (shared)
                 → agent_1 (storage, DB, triggers, subagents)  <- isolated
                 → agent_2 (storage, DB, triggers, subagents)  <- isolated
                 → agent_3 (storage, DB, triggers, subagents)  <- isolated

SUNDER V1:  client → connections
                   → ONE workspace (storage, DB, triggers, subagents)
```

There is no `agents` table. No agent routing. No isolation logic. `client_id` IS the agent. Every Tasklet infrastructure pattern maps 1:1 — you just replace `agent_id` with `client_id` as the scoping key:

| Tasklet (per-agent) | Sunder (per-client) | Drift |
|---|---|---|
| `/agent/home/` | `/{client_id}/` in Supabase Storage | Path prefix only |
| Per-agent SQLite | Per-client Supabase tables (RLS on `client_id`) | Same, different key |
| Per-agent triggers | Per-client triggers | Same, different key |
| Per-agent subagents | Per-client subagents (same folder, same storage) | Zero |
| Per-agent skill activation | Per-client skill loading | Zero |
| System-reminder assembly | Query client state before each LLM call | Zero |
| User-level connections | Client-level connections | Zero |

**Why single-agent is correct for Sunder:** The real estate AI assistant is one brain that needs to know everything — the WhatsApp conversation, the deal pipeline, the client preferences, the follow-up schedule. Splitting into multiple isolated agents would force constant data duplication. The Dorabot model (one agent, all channels, one memory) is the right pattern for personal assistants. Tasklet's multi-agent model solves organizational complexity (many roles, many concerns); Sunder's problem is informational complexity (one role that needs full context).

**Subagents still exist** — they're disposable computation workers (research, drafting, analysis), not separate identities. They read from and write to the same `/{client_id}/` folder. The parent delegates, the subagent writes results back, the parent picks them up. Same desk, same filing cabinet.

**Future-proofing:** If multi-agent is ever needed, add an `agents` table with `client_id` FK and re-scope storage from `/{client_id}/` to `/{client_id}/{agent_id}/`. This is a migration, not a rewrite — the patterns don't change, only the key length.

---

## Provider Matrix (Tasklet equivalent)

| Concern | Tasklet Provider | What It Does | Billing Model |
|---|---|---|---|
| Frontend + Chat | Tasklet web UI | Chat interface, Mission Control, task list | Included in platform |
| Per-agent storage | FUSE-mounted cloud filesystem (`/agent/`) | Configs, outputs, subagent instructions — persists across sessions | Included in platform (cloud-backed) |
| Code execution | `run_command` (per-session sandbox) | Shell access, scripts — sandbox boots on first call, reused within session. Packages and `/tmp/` persist within session, lost when session ends. | Included in platform |
| Structured data | Per-agent SQL database | Agent-controlled schema, state tracking, cache, logs | Included in platform |
| LLM gateway | Platform-managed | Model selection per invocation | Usage-based tokens |
| Scheduling/Triggers | Managed trigger system | Cron, webhook, RSS, app-specific event triggers | Included in platform |
| Connections (static) | Managed OAuth/API registry | ~20-30 high-quality integrations built by Tasklet team (`static:gmail`, `static:hubspot`) or wrapped from official MCP/raw APIs. Platform owns credentials, makes direct HTTP calls. | Included in platform |
| Connections (pipedream) | Pipedream proxy | 3000+ long-tail integrations via Pipedream's component registry (`pipedream:twilio`, `pipedream:shopify`). Credentials in Pipedream's vault, two-hop execution. | Included in platform (+ Pipedream API costs) |
| Auth | Platform auth | User accounts, agent access control | Included in platform |
| Messaging | `send_message` / `reply_message` | Email/SMS to verified contacts | Included in platform |
| UI/Preview | `show_user_preview` | Document/app/image preview in panel (agent writes files manually, then calls preview) | Included in platform |

### Preinstalled in sandbox (available every session without install)

Python 3.12, sh, bash, `apk` (Alpine package manager), curl, ffmpeg, ghostscript, imagemagick, jq, pandoc, and other common tools.

### What Tasklet has that we don't

| Thing | Tasklet approach | Our approach |
|---|---|---|
| Always-available shell | `run_command` — sandbox boots on first call, reused across all calls in session. Packages and `/tmp/` persist within session, lost on session end. | Vercel/E2B Sandbox — same per-session reuse (`Sandbox.create()` once, `.exec()` many times). Cross-invocation reconnection via `Sandbox.get({ sandboxId })`. +2-5s cold start on first create, mitigated by pre-warming. **No capability gap, only latency delta.** |
| Platform-managed SQL | Opaque per-agent database, SQL tool only | Supabase DB (we own the schema, direct SDK access) |
| Platform-managed triggers | `search_triggers` + `setup_trigger` + `manage_active_triggers` tools | Trigger.dev (we own the code, deploy our own workers) |
| Platform-managed connections (dual path) | Static path: in-house OAuth, direct HTTP, custom skill files, quality=GREAT. Pipedream path: 3000+ services via proxy, auto-generated descriptions, quality=UNKNOWN. | Composio + MCP (we own the integration layer). Architecturally equivalent to Tasklet's Pipedream path. Consider building static path for top 5-10 services. |
| Preinstalled common tools | ffmpeg, pandoc, imagemagick, etc. ready in every session | Must install in Vercel Sandbox or use snapshots |

---

## The Four Request Flows (Tasklet Equivalent)

### Flow A — Real-time chat (interactive session)

```
User types message in Tasklet web UI
        ↓
PHASE 0: CONTEXT ASSEMBLY (platform server, before LLM sees anything)
  Platform assembles the full prompt in this order:
  ┌─────────────────────────────────────────────────────┐
  │ 1. SYSTEM PROMPT (~4,000 tokens)                    │ ← static template (personality,
  │    tool rules, filesystem layout, skill instructions,│    connection instructions)
  │                                                     │
  │ 2. SYSTEM-REMINDER (~200-400 tokens)                │ ← dynamically assembled per-turn:
  │    - Current time + timezone (server clock)         │
  │    - User identity (account record lookup)          │
  │    - Agent state snapshot:                          │
  │      - Active triggers count (DB query)             │
  │      - Open tasks count (DB query)                  │
  │      - DB tables list (schema query)                │
  │    - Active connections + skill file paths          │
  │    - Contact methods for the user                   │
  │                                                     │
  │ 3. TOOL DEFINITIONS (~800-3000 tokens)              │ ← based on activated tools:
  │    - Built-in tools (read_file, write_file, etc.)   │
  │    - Connection tools with prefixed names:          │
  │      "conn_abc123__gmail_search_threads"            │
  │      (prefix = which OAuth token to use)            │
  │    - Only ACTIVATED tools included                  │
  │      (deactivated tools invisible to LLM)           │
  │                                                     │
  │ 4. CONVERSATION HISTORY (variable)                  │ ← prior turns in this session
  │                                                     │
  │ 5. USER MESSAGE                                     │ ← current request
  └─────────────────────────────────────────────────────┘
        ↓
LLM inference begins. If it needs to use a connection tool:
  1. Checks system-reminder: "conn_abc123 — You MUST read skill file"
  2. Reads skill file: read_file("/agent/skills/connections/conn_abc123/SKILL.md")
  3. Follows platform-specific instructions from the skill
  4. Calls the connection tool using prefixed name:
     conn_abc123__gmail_search_threads(query="newer_than:7d", ...)
     → Platform parses prefix → looks up OAuth token → makes Google API call
        ↓
LLM tool loop:
  Model calls tools → platform executes → results feed back → model continues
  Tools: read_file, write_file, run_command, SQL queries, connection tools, etc.

  IMPORTANT: Large tool results get TRUNCATED in context to save tokens.
  Platform saves full result to disk: /agent/toolcalls/{blockId}/result
  LLM sees: "Data truncated 21kB → 5kB. Full data at /agent/toolcalls/..."
  If LLM needs full data later (e.g., for sandbox processing), it reads from disk.
        ↓
If LLM needs code execution (data processing, charts, etc.):
  Calls run_command → sandbox boots (first call) or reuses (subsequent calls)
  → new shell process in same container
  → reads full data from /agent/toolcalls/ via FUSE
  → processes → writes output via FUSE
  Sandbox stays alive for the entire session. Multiple run_command calls
  share the same container — installed packages and /tmp/ files persist
  between calls within the session.
  (See gmail-sandbox-execution-trace.md for full cross-environment trace)
        ↓
Response streamed back to user
Session continues until user stops or idle timeout
        ↓
On session end: sandbox destroyed, packages lost
  /agent/ files persist (cloud-backed)
  SQL data persists
  /tmp/ contents lost
```

**Key patterns to note:**

1. **Phase 0 context assembly:** The platform builds the full prompt server-side before the LLM sees anything. Each system-reminder line is a database query or config lookup — not LLM-generated. This is ~10 lines of server code that provides full situational awareness.

2. **Tool name prefixing:** Connection tools are named `conn_{id}__{toolName}`. The prefix tells the platform which OAuth token to use. The LLM never sees the token — it just calls the prefixed tool name, and the platform handles auth. This means an agent with 3 Gmail accounts would have 3 different prefixed tool sets, each routing to the correct credential.

3. **System-reminder injection:** Every turn, the platform regenerates a lightweight state snapshot (~200-400 tokens). This is how a stateless LLM "knows" what connections, triggers, and tasks exist. Cheap payload, high value.

4. **Skill lazy-loading:** The system-reminder tells the LLM skills *exist* (paths listed). The LLM reads them on-demand via `read_file` only when it's about to use the relevant connection. Prevents context pollution — no Gmail skill tokens when the user asks about CRM.

5. **Platform truncation + disk save:** Large tool results (e.g., 21KB of Gmail threads) are truncated in context but saved in full to `/agent/toolcalls/`. This enables the cross-environment handoff: connection tool returns data → platform saves to disk → sandbox reads from disk via FUSE. The LLM's context stays small while the sandbox gets the full dataset.

6. **Shell always available:** `run_command` works immediately in every session — zero cold-start delay for code execution within a session.

**Key difference from ours:** Our runner assembles context at invocation start (system prompt + skills + memory). Tasklet injects a lightweight system-reminder every turn and lets the agent lazy-load skills on demand. Our approach is simpler but pre-loads more context; Tasklet's is more efficient at scale with many skills/connections.

### Flow B — Long task (subagent delegation)

```
User says "research all 20 leads in my pipeline"
        ↓
LLM in chat session decides to delegate
  Reads/writes subagent instruction file: /agent/subagents/lead-researcher.md
  Calls run_subagent tool with payload
        ↓
Platform spawns NEW fresh LLM instance:
  System prompt (same as parent)
  Subagent instruction file contents (read from /agent/subagents/lead-researcher.md)
  Payload from parent (first user message)
  Same tool surface as parent
        ↓
Subagent executes autonomously:
  Loops through leads
  Uses connection tools (search, enrichment APIs)
  Writes results to SQL database
  Writes artifacts to /agent/home/
  Has NO access to parent conversation
        ↓
Only final subagent message returned to parent as string
Subagent context discarded (stateless worker pattern)
Parent synthesizes and presents to user
```

**Key difference from ours:** Subagent spawning is a platform primitive (`run_subagent` tool). In our architecture, we implement this ourselves — the runner calls Claude API with the subagent's instruction file as system prompt + payload as user message, then returns the result. Functionally identical, but we own the plumbing.

**Critical: Subagents are "naked" — no system-reminder:**

The subagent does NOT receive a `<system-reminder>`. It doesn't know:
- What time it is
- Who the user is
- What connections exist
- What triggers are active

The parent LLM must **hardcode all necessary context into the instruction file**: connection IDs, skill file paths, user email, any config the subagent needs. If the parent forgets something, the subagent is blind to it.

This is intentional — subagents are cheap, disposable workers. Giving them full situational awareness would bloat their context for information they don't need. The parent acts as the "briefing officer" that extracts only what the subagent needs from the system-reminder.

**Implication for our architecture:** When we spawn subagent LLM calls, we should similarly pass only the minimum context needed — not the entire system prompt + all skills. The parent runner should extract relevant integration details and embed them directly in the subagent's instruction payload.

### Flow C — Autonomous workflow (trigger-based execution)

```
Trigger fires (cron schedule, webhook, RSS item, app event)
        ↓
Platform spawns FRESH LLM instance with:
  System prompt + system reminder
  Trigger event payload (type, data, metadata)
  NO conversation history (clean slate — "fresh-run amnesia")
        ↓
LLM MUST rediscover intent:
  1. Read subagent instructions from /agent/subagents/*.md
  2. Read config files from /agent/home/
  3. Query SQL database for cursor position, cache state, last run metadata
  4. Without rediscoverable artifacts → probabilistic guesswork
        ↓
LLM executes workflow:
  Calls tools (connections, file I/O, SQL, run_command)
  May spawn sub-subagents for specialized tasks
  Writes results to SQL + filesystem
  Sends notifications via send_message if needed
        ↓
Post-execution:
  Log execution metrics to SQL (terminal_status, entities_processed, cache_hits)
  Update cursor position (last_processed_id, timestamp)
  Platform records run metadata
  LLM context discarded
  Sandbox destroyed (packages lost, /agent/ persists)
```

**Key difference from ours:** The trigger system is a platform primitive — agents discover triggers via `search_triggers`, create them via `setup_trigger`, and manage them via `manage_active_triggers` (list, view, delete, simulate, edit). In our architecture, Trigger.dev jobs are code we write and deploy. The agent can't self-configure new cron schedules at runtime — we'd need to build that abstraction on top of Trigger.dev (or use Supabase DB to store trigger configs that our `pulse-checker` reads).

**This is the biggest architectural gap.** Tasklet agents can create their own triggers. Ours (currently) cannot — our cron jobs are deploy-time code.

**The "nothing remembers anything" pattern (from cron trace):**

Traced across 3 weeks of a recurring Monday 9am trigger:
1. **Week 1 (setup):** User asks for weekly email digest. LLM writes subagent file to `/agent/subagents/weekly-unreplied-emails.md`, creates trigger via `setup_trigger`. Conversation context discarded.
2. **Week 2 (first fire):** Fresh LLM wakes, sees trigger event, has NO memory of setup. Reads `/agent/subagents/` to rediscover purpose. Finds the .md file. Calls `run_subagent`. Subagent executes, sends email. Both contexts discarded.
3. **Week 3 (second fire):** Exact same sequence. The subagent doesn't know it ran last week. It searches Gmail for `newer_than:7d` and gets fresh results.

**Nothing remembers anything:**
- The trigger scheduler doesn't know what the job does
- The subagent doesn't know it ran last week
- The parent doesn't know it created the subagent
- **The files are the memory. Everything else is stateless compute that boots, works, and dies.**

This is the same pattern our architecture follows — Trigger.dev fires, our runner assembles context from Supabase, spawns LLM, LLM reads instruction templates, executes, context discarded. The files/DB are the only continuity.

### Flow D — Channel webhook (messaging integrations)

```
External event arrives (email, SMS, app webhook)
        ↓
Platform routes via connection framework:
  Matches to agent based on connection config
  Trigger fires with event payload
        ↓
Same as Flow C: fresh LLM instance, rediscovery, execution
        ↓
Reply sent via reply_message tool (for email/SMS threads)
  or via connection tools (for app-specific responses)
```

**Key difference from ours:** Tasklet handles WhatsApp/email/SMS via its connection + trigger framework. We build explicit webhook handlers on Vercel for each channel (WhatsApp, Telegram). More work to build, but we control the entire integration.

---

## Per-Agent File Storage (FUSE-Mounted Cloud Filesystem)

Every agent gets an isolated persistent filesystem via FUSE-mounted cloud storage. The filesystem persists across sessions even though the sandbox is ephemeral.

```
/agent/
├── home/                              # Read-write durable storage
│   ├── (agent-organized)              # No prescribed subdirectory layout
│   ├── scripts/                       # Custom scripts (common convention)
│   ├── configs/                       # Operational config files (common convention)
│   ├── outputs/                       # Generated artifacts (common convention)
│   └── apps/
│       └── {name}/                    # Preview apps (agent writes manually)
│           ├── app.tsx                # or index.html
│           └── ...
├── subagents/                         # Read-write subagent definitions
│   ├── lead-researcher.md             # Parent-created instruction files
│   ├── company-analyzer.md
│   └── briefing-compiler.md
├── skills/                            # Read-only skill definitions
│   ├── system/
│   │   └── {name}/SKILL.md           # Platform system skills
│   └── connections/
│       └── {id}/SKILL.md             # Per-connection skills
├── uploads/                           # Read-only user uploads
└── toolcalls/
    └── {blockId}/                     # Context truncation recovery
        ├── args.json
        └── result.json

/tmp/                                  # Ephemeral per-session storage
                                       # Fast native I/O (~1ms, NOT FUSE)
                                       # Persists across run_command calls within session
                                       # Lost when session ends
                                       # Use for heavy I/O, then copy to /agent/
```

**Note on `/agent/home/`:** There is no prescribed subdirectory layout. The agent organizes as needed. The `scripts/`, `configs/`, `outputs/` paths shown above are common conventions, not platform requirements.

### Access pattern

The LLM accesses files via platform-provided tools — NOT raw filesystem calls:

```
# Read (via read_file tool)
read_file("/agent/home/configs/pipeline.json")
read_file("/agent/subagents/lead-researcher.md")

# Write (via write_file tool)
write_file("/agent/home/outputs/briefing-2026-02-23.md", content)
write_file("/agent/subagents/new-workflow.md", instructions)

# Shell (via run_command tool)
run_command("python3 /agent/home/scripts/analyze.py")
run_command("ls -la /agent/home/outputs/")

# Directory listing (via read_file tool)
read_file("/agent/home/", mode="tree")
```

### Performance characteristics

| Path | Latency | Persistence | Use for |
|---|---|---|---|
| `/agent/` (FUSE) | ~10-100ms per op (cloud-backed) | Durable across sessions | Configs, outputs, subagent instructions, anything that must survive |
| `/tmp/` (native) | ~1ms per op (local disk) | Persists within session, lost on session end | Heavy I/O, intermediate processing, large transforms — persists across `run_command` calls. Copy results to `/agent/` for cross-session persistence. |

The platform docs explicitly recommend using `/tmp/` for performance-sensitive operations, then copying to `/agent/home/`. This means FUSE latency is a known tradeoff, not negligible.

### Isolation

Each agent gets a separate FUSE mount scoped to its cloud storage path. No cross-agent access. Platform enforces isolation at the storage boundary.

### Toolcall artifact recovery + cross-environment data handoff

The `/agent/toolcalls/` directory serves two purposes:

1. **Context truncation recovery:** When `<context-removed>` occurs, the LLM reads full artifacts from `/agent/toolcalls/{blockId}/`.

2. **Cross-environment data handoff (critical pattern):** When a connection tool returns a large result (e.g., 21KB of Gmail threads), the platform:
   - **Truncates** the result in LLM context (~5KB) to save tokens
   - **Saves the full result** to `/agent/toolcalls/{blockId}/result` on disk
   - Tells the LLM: "Data truncated 21kB → 5kB. Full data at /agent/toolcalls/..."

   If the LLM then needs to process that data in a sandbox (e.g., Python analysis), the sandbox reads the full result from disk via FUSE. This is how data moves from an external API (Gmail) through the platform into a sandbox without the LLM having to hold it all in context.

   ```
   Gmail API → Platform saves full result to /agent/toolcalls/ → LLM sees truncated preview
                                                                    ↓
                                                              LLM calls run_command
                                                                    ↓
                                                              Sandbox reads full data
                                                              from /agent/toolcalls/ via FUSE
   ```

   See `../references/tasklet/gmail-sandbox-execution-trace.md` for the full traced example.

---

## Code Execution: Always Available, Per-Session Sandbox

Tasklet agents have `run_command` available in every session without spinning up a separate sandbox. The sandbox lifecycle is **per-session, NOT per-command**.

### Sandbox lifecycle (confirmed by Tasklet dev)

```
WRONG (what we previously assumed):
  run_command → sandbox boots → command runs → sandbox destroyed
  run_command → sandbox boots → command runs → sandbox destroyed
  Each command = fresh sandbox

CORRECT (verified via live test):
  First run_command in session → sandbox boots
  run_command → new shell process, same container
  run_command → new shell process, same container
  run_command → new shell process, same container
  ... session ends → sandbox destroyed

  Next session (new trigger, new conversation turn) → fresh sandbox
```

**Evidence:** Uptime 1.72s → 11.46s (continuous, not reset). Installed cowsay in call 1, still working in call 2. `/tmp/sandbox_marker.txt` written in call 1, still readable in call 2. Different PIDs (426 → 436) but same container.

**What persists within a session:** Installed packages, `/tmp/` files, container state.
**What's gone next session:** All of the above.

**Why this matters:** A heavy package download (e.g., 15-second pandas install) happens once and is available across all `run_command` calls in the same session. The sandbox is a shared workspace for the duration of the invocation.

### What it is

- Shell access inside an Alpine Linux 3.23 sandbox (per-session lifecycle)
- `apk` package manager (Alpine, NOT `dnf`/Fedora)
- Internet access
- **Packages installed via `apk install` persist within the session, lost when session ends**
- `/tmp/` for fast ephemeral I/O (native filesystem, not FUSE) — **persists within session**
- `/agent/home/` for durable outputs (FUSE-mounted cloud storage, slower)

### Preinstalled tools (available every session)

Python 3.12, sh, bash, apk, curl, ffmpeg, ghostscript, imagemagick, jq, pandoc, and other common utilities. These are baked into the base image — no install needed.

### When the agent uses it

| Use case | What happens |
|---|---|
| Data processing scripts | Write Python script to `/agent/home/scripts/`, execute via `run_command` |
| Package installation | `apk add <package>` — available across all `run_command` calls in this session, lost on session exit |
| Python packages | `uv run --with pandas script.py` — re-installs on demand each session |
| File format conversion | FFmpeg, ImageMagick — preinstalled, always available |
| Document conversion | Pandoc — preinstalled, always available |
| Custom analysis | Python + `uv run --with` for on-demand packages |
| Preview apps | Agent writes files manually to `/agent/home/apps/{name}/`, calls `show_user_preview` to display |

### What does NOT need shell access

| Use case | Why no shell needed |
|---|---|
| CRM reads/writes | SQL database tool |
| External API calls | Connection tools |
| File reads/writes | `read_file` / `write_file` tools |
| Messaging | `send_message` / `reply_message` tools |
| Trigger management | `setup_trigger` / `manage_active_triggers` tools |

### Comparison to our Sandbox (Vercel Sandbox / E2B)

Both `@vercel/sandbox` and E2B provide the same per-session sandbox reuse as Tasklet. We'll likely use Vercel Sandbox (tighter AI SDK integration), with E2B as a viable alternative.

| Dimension | Tasklet `run_command` | Our Sandbox (`@vercel/sandbox` or E2B) |
|---|---|---|
| Availability | Every session, no spin-up delay | On-demand, +2-5s cold start (first call). Pre-warming can eliminate this. |
| Per-session reuse | Same container across all `run_command` calls | **Same.** Sandbox is a persistent object — `Sandbox.create()` once, `.exec()` many times. AI SDK passes sandbox via `experimental_context` to all tools. |
| Package persistence | Persists across calls within session, lost on session end | **Same.** Sandbox stays alive, packages persist across `.exec()` calls. Lost on `.kill()`. |
| Cross-invocation reconnection | Not documented | **Both support it.** Vercel: `Sandbox.get({ sandboxId })`. E2B: `.pause()` → `.connect(sandboxId)`. Persist sandboxId in DB/session, reconnect from different serverless function. |
| Preinstalled tools | ffmpeg, pandoc, imagemagick, jq, etc. | Customizable via templates/Dockerfiles. Bake ffmpeg/pandoc into template = same result. |
| OS | Alpine Linux 3.23 (`apk`) | Customizable. Vercel: Amazon Linux. E2B: Ubuntu (default). |
| Persistent storage | `/agent/` via FUSE (~10-100ms) | Must write back to Supabase Storage (or use sandbox filesystem which persists within session) |

**Key insight (v1.9): There is no sandbox gap.** Both architectures support per-session sandbox reuse natively:

```
TASKLET:    session starts → first run_command boots sandbox → reuse → session ends → destroyed
OURS:       session starts → Sandbox.create() → .exec() .exec() .exec() → .kill() → destroyed
```

**Vercel Sandbox** — the likely choice — shows this as a first-class pattern:
```ts
// Create sandbox once, store ID for reconnection across serverless invocations
const sandbox = await Sandbox.create();
const sandboxId = sandbox.sandboxId; // persist to DB/session

// Later (same or different serverless function): reconnect
const existingSandbox = await Sandbox.get({ sandboxId });
// All previous files and state are preserved
```

**AI SDK wiring** (works with both Vercel and E2B):
```ts
// Sandbox passed to all tools via experimental_context — every tool call hits the same sandbox
const bashTool = tool({
  execute: async ({ command }, { experimental_context }) => {
    const { sandbox } = experimental_context;
    return sandbox.exec(command);  // same container, same state
  },
});
```

Both Vercel and E2B support cross-environment reconnection. Our sandbox can actually **exceed** Tasklet here — Tasklet can't reconnect to a sandbox started in a different invocation; we can (via stored `sandboxId`).

**Remaining differences (minor):**
- **Cold start:** Tasklet's sandbox is ~instant (always warm). Ours has +2-5s on first `.create()`. Mitigated by pre-warming or reconnection via `Sandbox.get()`.
- **Preinstalled tools:** Tasklet bakes ffmpeg/pandoc into the base image. We define a template with the same tools — one-time setup, then every sandbox gets them.
- Neither is an architectural gap. Both are configuration/optimization, not missing capabilities.

---

## Integration System: Static vs Pipedream (Dual Path)

> **Full trace:** `../references/tasklet/integrations-pipedream/00-pipedream-integration-architecture-trace.md`

Tasklet runs two distinct integration backends side by side. The routing key is the ID prefix on `search_for_integrations` results:

```
static:gmail       ← Built by Tasklet (or official MCP). Quality: GREAT.
static:hubspot     ← Built by Tasklet. Quality: GREAT.
static:notion      ← Wrapped from official MCP server. Quality: GREAT.
static:airtable    ← Tasklet wrapper around raw HTTP API. Quality: GREAT.

pipedream:twilio              ← Pipedream component registry. Quality: UNKNOWN.
pipedream:shopify_developer_app ← Pipedream component registry. Quality: UNKNOWN.
```

### The `builtBy` Taxonomy

| `builtBy` | What it means | Quality | Example |
|---|---|---|---|
| `tasklet` | Custom-built by Tasklet engineering team | GREAT | HubSpot, Gmail |
| `official-mcp` | Wrapped from an official MCP server | GREAT | Notion |
| `direct-api-wrapper` | Tasklet wrapper around a raw HTTP API | GREAT | Airtable |
| `pipedream` | Pulled from Pipedream's component registry | UNKNOWN | Twilio, Shopify |

### Structural Differences

| Dimension | Static (`static:*`) | Pipedream (`pipedream:*`) |
|---|---|---|
| **Tool naming** | Clean underscores (`gmail_search_threads`) | App-slug prefix with hyphens (`twilio-send-message`) |
| **Tool descriptions** | Rich, LLM-optimized with inline strategy guides (e.g., Gmail search-strategy XML blocks) | Basic, auto-generated with external doc links the LLM can't browse |
| **Skill files** | Yes — auto-generated from per-service templates with API quirks | Likely none — Tasklet hasn't written templates for 3000+ services |
| **Credential storage** | Platform's vault only (one trust boundary) | Split: platform stores reference, Pipedream stores actual credentials (two trust boundaries) |
| **Execution hops** | One: platform → API directly | Two: platform → Pipedream → API |
| **Latency** | Lower (one HTTP hop) | Higher (two HTTP hops) |
| **Coverage** | ~20-30 services | 3000+ services |
| **Maintenance** | Tasklet team maintains each one | Pipedream maintains components |

### Tool Execution Routing

```
STATIC:    LLM calls conn_abc__gmail_search_threads(...)
           → Platform parses prefix → retrieves OAuth token from OWN vault
           → Makes direct HTTP call to Gmail API
           → Returns result to LLM

PIPEDREAM: LLM calls twilio-send-message(...)
           → Platform sends tool name + args + Pipedream account ref
           → Pipedream looks up component code + user's Twilio creds from PIPEDREAM vault
           → Pipedream executes component (Node.js → Twilio API)
           → Returns result to platform → returns to LLM
```

The LLM doesn't know or care which path a tool takes. It generates JSON args and gets text back either way.

### Sunder Mapping

Our Composio/MCP integration layer is architecturally equivalent to Tasklet's Pipedream path:

```
TASKLET:  LLM → Tasklet platform → Pipedream → Twilio API
SUNDER:   LLM → Sunder backend   → Composio  → Twilio API
```

**The strategic question:** Should we also build a "static" path for top services? Tasklet's data suggests yes — for the top 5-10 services users hit most (WhatsApp, Gmail, Calendar), in-house integrations give better descriptions, custom skill files, lower latency, and single-vault credential security. For everything else, Composio/MCP as catch-all is the right call.

---

## SQL Database (Per-Agent, System-Managed)

### What it is

- Per-agent SQLite-style database
- Accessible ONLY via `run_agent_memory_sql` and `get_agent_db_schema` tools
- NOT accessible via filesystem paths or `run_command`
- Agent defines its own schema (CREATE TABLE)
- Persists across all sessions and trigger runs

### How the agent uses it

```sql
-- Schema discovery
get_agent_db_schema()

-- State tracking across trigger runs
CREATE TABLE IF NOT EXISTS cursor_state (
  key TEXT PRIMARY KEY,
  last_id TEXT,
  last_timestamp TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Cache with expiry
CREATE TABLE IF NOT EXISTS research_cache (
  person_id TEXT,
  company_id TEXT,
  data JSON,
  cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  PRIMARY KEY (person_id, company_id)
);

-- Execution logs
CREATE TABLE IF NOT EXISTS run_log (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT,
  started_at TEXT,
  completed_at TEXT,
  terminal_status TEXT CHECK(terminal_status IN ('success', 'partial', 'failed')),
  entities_processed INTEGER,
  cache_hits INTEGER,
  error_details TEXT
);
```

### What to store vs what NOT to store

| Store in SQL | Don't store in SQL |
|---|---|
| Cursor positions / last-processed timestamps | Messages sent (platform tracks these) |
| Research cache with expiry | Temporary processing data |
| Execution logs and metrics | Info already written to external systems |
| Configuration state flags | Raw tool call results |
| Deduplication keys | Large binary data (use filesystem) |

### The core insight: Database as continuity between amnesiac workers

This is why the database exists — not for "data storage" in the abstract, but as the **memory bridge** between stateless LLM invocations:

```
MONDAY 9 AM -- Trigger fires, fresh LLM wakes up

  1. LLM calls: SELECT * FROM leads WHERE status = 'new'
     -> Gets: bob@startup.io, carol@bigcorp.com

  2. LLM processes Bob, sends email

  3. LLM calls: UPDATE leads SET status = 'contacted' WHERE email = 'bob@startup.io'

TUESDAY 9 AM -- Completely new LLM instance, zero memory of Monday

  1. Same query: SELECT * FROM leads WHERE status = 'new'
     -> Gets: carol@bigcorp.com only
     -> Bob doesn't come back -- the DB remembers, the LLM doesn't
```

Monday's LLM marks Bob as `contacted`. Tuesday's LLM (completely fresh, no memory) queries for `status = 'new'` and Bob is excluded. The database is the continuity. The LLM is the amnesiac worker.

### Decision matrix: Filesystem vs Database

```
"Should I use the filesystem or the database?"

  Do I need to query it? (filter, count, sort, deduplicate)
    |
    +-- YES --> DATABASE (leads, logs, state, counters, history)
    |
    +-- NO  --> FILESYSTEM (reports, charts, scripts, configs, CSVs, subagent instructions)
```

**If you need SQL operations — database. Everything else — filesystem.**

### Comparison to our approach

In our architecture, this maps directly to **Supabase DB** — same SQL access, same persistence guarantees. The main difference:
- Tasklet: agent creates tables on the fly via `run_agent_memory_sql`
- Ours: we define schema in Supabase migrations, agent accesses via Supabase SDK

Tasklet's approach is more flexible (agent self-schemas). Ours is more controlled (we own the schema).

| Tasklet | Sunder Equivalent |
|---|---|
| `/agent/home/` (FUSE filesystem) | Supabase Storage bucket per agent |
| Per-agent SQLite database | Supabase Postgres with RLS scoped to agent |
| `run_agent_memory_sql` tool | Supabase SDK queries from runner |
| `get_agent_db_schema` tool | Supabase schema introspection |
| DB table count in system-reminder | Backend queries Postgres before each LLM call |

---

## Task List System: Notes-to-Future-Self, Not a Queue

> **Full trace:** `../references/tasklet/task-list-system/00-task-list-live-trace.md`

### What it is

A simple database table of open tasks. The platform injects a count into the system-reminder (`Open tasks: 3`). The LLM calls `list_tasks()` to see what they are, decides whether to act, and calls `manage_tasks(delete)` when done.

### What it is NOT

```
JOB QUEUE:   Job enters -> Worker picks up -> Job runs -> Job marked complete
                 ^ automatic                    ^ automatic

TASK LIST:   Task exists -> nothing happens
             Task exists -> LLM wakes up (user msg or trigger)
                         -> LLM calls list_tasks()
                         -> LLM reads titles
                         -> LLM decides whether to act
                         -> LLM might ignore them
                         -> LLM calls delete when done
```

Zero execution semantics. No workers. No retry. No timeout. No ordering guarantees. The LLM is the only scheduler.

### The killer pattern: Trigger + Task = Resumable Work

```
DAY 1: Trigger fires, LLM processing 50 leads
  -> Gets through 30, hits rate limit
  -> Creates task: "Process remaining 20 leads (starting from row 31)"
  -> Stops. Context discarded.

DAY 2: Same trigger fires. Fresh LLM. Zero memory.
  -> Sees "Open tasks: 1"
  -> Calls list_tasks() -> "Process remaining 20 leads (starting from row 31)"
  -> Finishes leads 31-50
  -> Deletes the task
  -> Starts new day's batch
```

The task is the continuity. The trigger is the wake-up call. Neither does anything alone.

### Key properties (observed)

| Property | Behavior |
|---|---|
| State | Binary: open (exists) or done (deleted) |
| System-reminder | Count only — `Open tasks: N`. No titles, no IDs. |
| Completion | `manage_tasks(action: "delete")` — no "mark complete" status |
| Execution | Zero. Tasks don't run. LLM reads and decides. |
| Persistence | Durable across sessions and trigger runs |
| Scope | Per-agent (per-client in Sunder) |

### Comparison to our approach

| Dimension | Tasklet | Sunder (V1) |
|---|---|---|
| **Core mechanic** | Binary: open or deleted | Identical — LLM reads on wake-up, acts, marks done |
| **State model** | Binary only | Extended: `planning` -> `planned` -> `in_progress` -> `review` -> `done` / `cancelled` |
| **Task types** | Single type (agent tasks) | Dual: CRM tasks (user-visible tracking) + Agent Tasks (executable work items) |
| **Approval gating** | None | `needs_approval` flag + queue signal |
| **UI** | Mission Control shows task list | Unified Tasks page merges both types with board columns |
| **Implementation** | Platform-managed | `agent_tasks` table in Supabase + 3 tool handlers + 1 count query in state block |

**Our extension is deliberate:** Tasklet's minimal binary model works for their platform. Our V1 needs richer state because users see the task board and approve actions. The core mechanic (LLM reads tasks → acts → marks done) is identical.

---

## Trigger.dev vs Tasklet Triggers: The Core Divergence

### Tasklet's trigger model

```
Agent discovers triggers:
  search_triggers("calendar") → returns available trigger types

Agent creates trigger (separate tool from management):
  setup_trigger(trigger_id: "schedule", params: {
    cron: "0 6 * * *",      // 6am UTC daily
    payload: { workflow: "daily-briefing" }
  })

Agent manages active triggers:
  manage_active_triggers(action: "list")    → all configured triggers
  manage_active_triggers(action: "view", trigger_instance_id: "...")
  manage_active_triggers(action: "delete", trigger_instance_id: "...")
  manage_active_triggers(action: "simulate", trigger_instance_id: "...", payload: {...})
  manage_active_triggers(action: "edit", trigger_instance_id: "...", params: {...})
```

**Note:** Trigger creation uses `setup_trigger` (separate tool). `manage_active_triggers` handles list/view/delete/simulate/edit — NOT creation.

**Key property:** The agent can create, modify, and delete its own triggers at runtime. This means:
- User says "check my pipeline every morning at 8am" → agent creates a cron trigger via `setup_trigger`
- User says "stop the morning check" → agent deletes via `manage_active_triggers`
- User says "also watch for new Tally form submissions" → agent creates a webhook trigger
- Trigger fires → fresh LLM instance rediscovers intent from persisted artifacts

### Our Trigger.dev model

```
Developer writes job code:
  // trigger/daily-briefing.ts
  export const dailyBriefing = schedules.task({
    id: "daily-briefing",
    cron: "0 6 * * *",
    run: async (payload) => { ... }
  });

Developer deploys:
  git push → Trigger.dev picks up new job definitions

Runtime:
  Trigger.dev fires cron → our code runs → calls Claude API with context
```

**Key property:** Job definitions are deploy-time code. The agent cannot create new triggers at runtime.

### The gap and how to bridge it

| Capability | Tasklet | Our architecture | Gap? |
|---|---|---|---|
| Fixed cron jobs (pulse, daily briefing) | Trigger config via `setup_trigger` | Trigger.dev cron | **No gap** — same outcome |
| Agent-created schedules | `setup_trigger` tool at runtime | ??? | **Gap** — agent can't self-schedule |
| Webhook triggers | Platform routes to agent | Vercel webhook handlers | **No gap** — different plumbing, same result |
| RSS/app-event triggers | Platform trigger types | Custom polling or webhook | **Minor gap** — we build what we need |

**Bridge option for agent-created schedules:**

```
Supabase DB table: agent_triggers
  - client_id, trigger_type, cron_expression, payload, enabled, created_at

pulse-checker (Trigger.dev, every 30s) already scans for work.
Extend it to also check agent_triggers table:
  SELECT * FROM agent_triggers
  WHERE enabled = true
  AND next_fire_at <= now()

When matched: run the trigger's payload through the runner engine.
This gives agents runtime trigger creation via a CRM tool:
  create_trigger({ type: "schedule", cron: "0 8 * * *", workflow: "morning-check" })
```

This adds ~20 lines to `pulse-checker.ts` and one DB table. The agent gets Tasklet-equivalent trigger self-configuration.

---

## Subagent Spawning: Side-by-Side

### Tasklet

```
1. Parent writes instruction file:
   write_file("/agent/subagents/researcher.md", instructions)
   → ~10-100ms (FUSE cloud-backed write)

2. Parent calls run_subagent:
   run_subagent("researcher", { leads: [...] })

3. Platform reads /agent/subagents/researcher.md
   → ~10-100ms (FUSE cloud-backed read)

4. Platform spawns new LLM instance with:
   - System prompt (same as parent)
   - Instruction file contents
   - Payload as first user message

5. Subagent executes with full tool access
   (filesystem, SQL, connections, run_command)

6. Only final message returned to parent
   Subagent context discarded
```

### Our architecture

```
1. Runner writes instruction file:
   await supabase.storage.upload(`${clientId}/subagents/researcher.md`, instructions)
   → ~50-100ms (network round-trip to Supabase)

2. Runner reads instruction file:
   const { data } = await supabase.storage.download(`${clientId}/subagents/researcher.md`)
   → ~50-100ms (network round-trip)

3. Runner spawns new LLM call:
   const result = await generateText({
     model: openrouter('gemini-2.5-flash'),
     system: parentSystemPrompt + instructionFileContents,
     messages: [{ role: 'user', content: JSON.stringify(payload) }],
     tools: toolDefinitions,
     maxSteps: 20,
   });

4. Subagent executes with tool access
   (Supabase SDK, HTTP APIs, Composio — but NOT run_command unless we spin up Vercel Sandbox)

5. Only final text returned to parent
   Subagent messages discarded
```

### Latency comparison

| Operation | Tasklet | Ours | Delta |
|---|---|---|---|
| Write subagent instruction | ~10-100ms (FUSE) | ~50-100ms (Supabase) | Negligible — same ballpark |
| Read subagent instruction | ~10-100ms (FUSE) | ~50-100ms (Supabase) | Negligible — same ballpark |
| Spawn LLM | Platform-managed | Our code calls Claude API | Similar — both are API calls |
| Tool execution (API calls) | Connection tools → HTTP | Our tools → HTTP | **Identical** |
| Tool execution (shell) | `run_command` → first call boots sandbox, subsequent calls reuse (same container) | Vercel/E2B Sandbox → first `.create()` +2-5s, subsequent `.exec()` reuse same sandbox | **+2-5s first call only** (both reuse after that) |
| Return result | Platform pipes back | Our code returns string | **Identical** |

**Net impact:** File I/O latency is comparable between architectures (~10-100ms vs ~50-100ms — same order of magnitude). Shell access is now equivalent: both support per-session sandbox reuse. The only delta is first-call cold start (+2-5s for `Sandbox.create()` vs ~instant for Tasklet), mitigated by pre-warming or cross-invocation reconnection via `Sandbox.get({ sandboxId })`.

---

## Skills System: Side-by-Side

### Tasklet — How Skills Actually Work

Skills are NOT pre-loaded into the system prompt. They are **lazy-loaded on demand** via `read_file()`. But the two types have **different pointer mechanisms**:

**Two types of skills — with different loading triggers:**

| Type | Location | Who Creates Them | Pointer Location | When Read |
|---|---|---|---|---|
| System skills | `/agent/skills/system/{name}/SKILL.md` | Platform engineers (shipped at build time) | **Hardcoded in base system prompt** (permanent, every turn) | When agent needs platform features (creating connections, etc.) |
| Connection skills | `/agent/skills/connections/{connId}/SKILL.md` | **Auto-generated by platform** when user connects a service | **Dynamic in `<system-reminder>`** (appears when connection exists, gone when deleted) | When agent is about to use that connection's tools |

**System skill pointer (hardcoded, permanent):**

The base system prompt — the permanent instructions that never change — contains lines like:
```
You MUST read /agent/skills/system/creating-connections/SKILL.md
for full instructions before creating connections.
```
This is always in the prompt. Every turn. Every trigger fire. Platform engineers wrote it at build time. When the user says "Connect my Notion account," the LLM sees this instruction, calls `read_file()` on that path, and follows what it reads.

**Connection skill pointer (dynamic, runtime):**

The `<system-reminder>` (regenerated every turn) lists active connections:
```
Active connections by connection Id:
- conn_abc123: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_abc123/SKILL.md
```
This pointer appears when the connection is created and disappears when it's deleted. The platform generates it at runtime by querying its connections table.

**Connection skill auto-generation (critical pattern — static integrations only):**

When a user authorizes a **static** service (e.g., `static:gmail` OAuth), the platform automatically writes a SKILL.md file containing API quirks the LLM's general training doesn't cover:
- Gmail: `readMask` parameter guidance (use minimal fields to avoid token waste), label name vs label ID rules (names in search queries, IDs in modification tools), Gmail link URL format
- Each connection gets its own file at `/agent/skills/connections/{connectionId}/SKILL.md`
- The LLM didn't write these. The platform generates them from templates specific to each service type.

**Pipedream integrations likely do NOT get custom skill files** — Tasklet hasn't hand-written templates for 3000+ Pipedream services. These integrations rely on Pipedream's auto-generated tool descriptions, which are lower quality (basic parameter docs + external links the LLM can't browse mid-call).

**Both types lazy-load the same way:**

```
SYSTEM PROMPT (permanent, every turn):
  "read /agent/skills/system/creating-connections/SKILL.md before creating connections"
  ← hardcoded pointer, always there, costs ~20 tokens

SYSTEM-REMINDER (dynamic, every turn):
  "read /agent/skills/connections/conn_abc/SKILL.md before using Gmail tools"
  ← dynamic pointer, only when connection exists, costs ~30 tokens

ACTUAL SKILL CONTENT (~200-1500 tokens):
  Only loaded into context when the LLM calls read_file()
  ← lazy loaded, only when needed
```

**Why lazy-loading matters:** An agent with 5 connections has 5 skill files. Pre-loading all 5 into every system prompt wastes tokens when the user only asks about email. Lazy-loading means you only pay for the skill you actually use. The pointers cost ~20-30 tokens each; the actual skills cost ~200-1500 tokens each. With 5 connections, lazy-loading saves ~1,000-7,000 tokens per turn when those connections aren't used.

```
/agent/skills/
├── system/                              # Platform capabilities
│   ├── creating-connections/SKILL.md    # How to set up new integrations
│   ├── file-operations/SKILL.md         # File I/O best practices
│   └── ...
└── connections/                         # Auto-generated per connected service
    ├── conn_abc123/SKILL.md             # Gmail-specific API quirks
    ├── conn_def456/SKILL.md             # Slack-specific API quirks
    └── ...
```

### Our architecture

```
Bundled in codebase (read-only, deploy-time):
  /api/runner/skills/
  ├── system/
  │   ├── crm-operations.md
  │   ├── search-and-research.md
  │   └── ...
  └── integrations/
      └── {integration}/skill.md

Per-client custom skills (Supabase Storage):
  /clients/{clientId}/skills/custom/
  └── *.md

Loading: Runner includes relevant skills in system prompt assembly
Discovery: Runner has manifest of available skills
Authoring: We write system skills; custom skills uploaded by user
```

### Key differences

| Dimension | Tasklet | Ours |
|---|---|---|
| **When skills load** | Lazy — agent reads via `read_file()` only when needed | Pre-assembled — runner bundles into system prompt at invocation start |
| **System skill pointers** | Hardcoded in base system prompt (permanent, build-time) | Hardcoded in runner code (equivalent) |
| **Connection skill pointers** | Dynamic in `<system-reminder>` (appears/disappears with connection) | Runner checks active integrations at invocation start |
| **Connection skills** | Auto-generated by platform when service connected | We write them manually per integration |
| **Discovery** | Two mechanisms: base prompt (system skills) + system-reminder (connection skills) | Runner has a hardcoded manifest |
| **Token efficiency** | Only the used skill enters context (~20-30 token pointer vs ~200-1500 token content) | All relevant skills pre-loaded, even if unused this turn |
| **Simplicity** | More moving parts (two pointer mechanisms + read_file + skill files) | Simpler (runner assembles once, LLM just follows instructions) |

**Our pre-assembly is simpler and arguably better for V1** — fewer tool calls, fewer failure modes, predictable context size. But Tasklet's lazy-loading scales better with many connections. At 2-3 integrations (V1), pre-assembly wins. At 10+ integrations, lazy-loading wins.

---

## System-Reminder Pattern: How Stateless LLMs Maintain Awareness

This is the most important architectural pattern in Tasklet that was missing from our earlier analysis.

### The problem it solves

Every LLM invocation starts with zero memory. The LLM doesn't know what time it is, who it's talking to, what integrations exist, or what triggers are running. Without the system-reminder, the LLM would have to ask the user or blindly explore the filesystem every single turn.

### The mechanism

Every single turn — every user message, every trigger fire — the platform assembles a `<system-reminder>` block and injects it into the LLM's context between the system prompt and the conversation history.

```xml
<system-reminder>
Current time: Tue, 24 Feb 2026 11:12 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>

Agent state summary:
- Active triggers: 1
- Open tasks: 0
- DB tables: 3

Active connections by connection Id:
- conn_abc123: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_abc123/SKILL.md

User has 0 other inactive connections
Number of configured contact methods: 1
</system-reminder>
```

### What each block provides

| Block | Content | Why It Exists |
|---|---|---|
| Runtime context | Current time, user identity | LLM has no clock and no memory of who it's serving |
| Agent state snapshot | Active triggers count, open tasks, DB tables | Prevents duplicates (won't create trigger if one exists), enables resume (knows what's in-progress) |
| Active connections | Connection IDs, tool counts, skill file paths | Tells LLM what integrations it can use and where to find the manual |
| Peripheral state | Inactive connections, contact methods | Knows if it can text the user or needs to ask for a number |

### Key properties

1. **Regenerated every turn** — not cached. Platform queries its own state fresh each time.
2. **Lightweight** — typically ~200-400 tokens. The cost is negligible compared to the value.
3. **Platform-generated** — the LLM cannot edit or influence the system-reminder. It's injected by the server.
4. **Enables lazy-loading** — by listing skill file paths, the system-reminder tells the LLM skills *exist* without loading their content. The LLM reads them on-demand.
5. **Subagents do NOT receive it** — this is critical. Subagents are "naked" — they get only base system prompt + instruction file + payload. See Subagent section above.

### Comparison to our architecture

| Dimension | Tasklet | Ours (current) |
|---|---|---|
| State injection | System-reminder every turn, auto-assembled by platform | Runner assembles context once at invocation start |
| When it refreshes | Every turn (user message or trigger fire) | Once per invocation (doesn't refresh mid-conversation) |
| What it contains | Time, user, triggers, tasks, DB tables, connections, contacts | System prompt + skills + memory (pre-loaded) |
| Subagent inclusion | No — subagents are naked | TBD — subagents get whatever we assemble for them |

**Implication for Sunder:** We should build a lightweight state assembly function that runs before each LLM call — query Supabase for the client's active integrations, open tasks, recent triggers. Prepend as a state block. This is ~10 lines of code and gives the LLM the same situational awareness Tasklet has.

---

## Persistence Across Trigger Runs: Side-by-Side

The "rediscovery" pattern is identical in both architectures. The storage layer differs.

| Persistence need | Tasklet | Ours |
|---|---|---|
| Cursor position (last processed ID) | SQL: `UPDATE cursor_state SET last_id = ?` | Supabase DB: same SQL via SDK |
| Research cache | SQL: `INSERT INTO research_cache ...` | Supabase DB: same |
| Execution logs | SQL: `INSERT INTO run_log ...` | Supabase DB: same |
| Config files | FUSE filesystem: `/agent/home/configs/pipeline.json` | Supabase Storage: `/{clientId}/configs/pipeline.json` |
| Subagent instructions | FUSE filesystem: `/agent/subagents/researcher.md` | Supabase Storage: `/{clientId}/subagents/researcher.md` |
| Generated artifacts | FUSE filesystem: `/agent/home/outputs/report.pdf` | Supabase Storage: `/{clientId}/artifacts/report.pdf` |
| Installed packages | **Per-session** — persist across `run_command` calls within a session. Lost when session ends. Preinstalled tools (ffmpeg, pandoc, etc.) always available. | **Ephemeral** — Vercel Sandbox lost on stop. Use snapshots for common environments. |

---

## Cost Model Comparison

### Tasklet

| Concern | Cost model |
|---|---|
| Platform fee | Platform pricing (unknown — speculative, cannot validate) |
| LLM tokens | Usage-based (platform markup likely) |
| Triggers, SQL, connections | Included in platform fee |
| Shell/code execution | Included in ephemeral sandbox |
| FUSE storage | Included in platform (cloud-backed) |
| **Total per agent** | **Unknown** — platform pricing not public. Comparable platforms charge $5-20/agent/mo before LLM tokens. |

### Our architecture

| Concern | Cost model |
|---|---|
| Vercel Pro | $20/mo fixed (shared across all clients) |
| Supabase Pro | $25/mo fixed (shared across all clients) |
| Trigger.dev | ~$10-30/mo usage-based (shared) |
| Sandbox (Vercel or E2B) | ~$0.50-0.80/client/mo (three-tier model, ~30-40% of interactions, per-session reuse) |
| Supabase Storage | ~$0.02/client/mo |
| LLM tokens | Usage-based via OpenRouter (no platform markup) |
| **Total per client at 100 clients** | **~$1.50-1.80/mo infrastructure + ~$2-5/mo LLM** |

**Likely cost advantage is ours** — we avoid platform markup on LLM tokens and per-agent pricing. The tradeoff is we build and maintain more infrastructure code. Note: Tasklet cost model is speculative since their pricing isn't public.

---

## Summary: What Drifts, What Doesn't

### Zero drift (identical pattern, different plumbing)

| Pattern | Tasklet | Ours |
|---|---|---|
| Stateless LLM per invocation | Fresh instance, no memory between runs | Same |
| Ephemeral compute | Sandbox destroyed after session, packages lost | Same (Vercel/E2B Sandbox destroyed on `.kill()`, or auto-killed on timeout) |
| Rediscovery from durable artifacts | Read files + query DB at start of each run | Same (Supabase Storage + DB instead of FUSE + SQL) |
| Subagent pattern | Write instructions → spawn fresh LLM → get result | Same (Supabase Storage instead of FUSE for instructions) |
| SQL state persistence | Per-agent SQL database | Supabase DB (same SQL, we own schema) |
| Tool-mediated mutation | All external state changes go through tools | Same |
| Context isolation via subagents | Subagent can't see parent conversation | Same |
| Toolcall artifact recovery + cross-env handoff | `/agent/toolcalls/{blockId}/` (truncation recovery + sandbox data handoff) | `/{clientId}/toolcalls/{blockId}/` in Supabase Storage (same pattern) |
| Tool name prefixing for OAuth routing | `conn_{id}__{toolName}` → platform parses prefix, selects OAuth token | Composio connection IDs serve same routing purpose |
| User-level connections, per-agent tool activation | Connections shared at user level (one OAuth token). Each agent activates its own subset of tools. | Composio connections scoped to `user_id`. Agent config selects which tools. |
| Package lifecycle | `apk install` persists within session (across `run_command` calls), lost on session end | Same — Vercel/E2B sandbox persists packages across `.exec()` calls within session, lost on `.kill()` |
| Per-session sandbox reuse | First `run_command` boots sandbox, subsequent calls reuse same container | Same — `Sandbox.create()` once, `.exec()` many times. AI SDK passes sandbox via `experimental_context`. Cross-invocation reconnection via `Sandbox.get({ sandboxId })`. |
| State injection per turn | System-reminder with time, user, connections, triggers, tasks | Runner assembles equivalent state block from Supabase before each LLM call |

### Low drift (minor adaptation needed)

| Pattern | Tasklet | Ours | Adaptation |
|---|---|---|---|
| File I/O latency | ~10-100ms (FUSE, cloud-backed) | ~50-100ms (Supabase Storage network) | Same order of magnitude. Negligible for our workload. |
| Skills loading | Lazy-loaded via two pointer mechanisms (base prompt for system skills, system-reminder for connection skills) + `read_file()` on demand | Runner pre-assembles into system prompt at invocation start | Pre-assembly is simpler and better for V1 (fewer tool calls). Lazy-loading scales better at 10+ integrations. |
| Connections/integrations | Dual path: static (in-house, GREAT quality, direct HTTP, custom skill files) + Pipedream (3000+ services, UNKNOWN quality, two-hop proxy, no skill files) | Composio + MCP (equivalent to Pipedream path). Consider static path for top 5-10 services. | Same strategy. Our Composio = their Pipedream. Decision: do we build static equivalents for WhatsApp/Gmail/Calendar? |
| Preview/artifacts | Agent writes files manually + `show_user_preview` | Mini Lovable via Vercel Sandbox + Supabase Storage URLs | Same outcome, more plumbing on our side |

### Real drift (requires deliberate bridging)

| Pattern | Tasklet | Ours | Bridge needed |
|---|---|---|---|
| **Agent-created triggers** | `search_triggers` + `setup_trigger` — agent configures its own schedules at runtime | Trigger.dev jobs are deploy-time code | Build `agent_triggers` table + extend pulse-checker to scan it. ~20 lines of code. |
| **Agent self-modification** | Agent can rewrite its own subagent instructions, configs, even workflow logic at runtime via FUSE | Agent can write to Supabase Storage (subagent instructions, configs, memory). Cannot modify deployed Trigger.dev job code. | Agent can modify its own prompts/configs/subagent-instructions (in Supabase Storage). It cannot modify deployed job code. This is intentional — prevents uncontrolled drift. |

**Previously listed as drift but resolved after docs verification:**
- ~~Always-available shell~~ — **No capability gap.** Both `@vercel/sandbox` and E2B support the same per-session reuse as Tasklet: `Sandbox.create()` once, `.exec()` many times, packages persist within session. AI SDK's `experimental_context` passes the sandbox to all tools in the agent loop. Templates let us bake ffmpeg/pandoc/imagemagick into the base image, matching Tasklet's preinstalled tools. The only remaining delta is cold-start latency (+2-5s on first `.create()`, mitigated by pre-warming). Both actually exceed Tasklet: `Sandbox.get({ sandboxId })` enables cross-invocation sandbox reconnection (e.g., start in webhook handler, reconnect in cron job — Vercel docs call this "persistent sandbox across serverless invocations").
- ~~Persistent package installs~~ — Both architectures persist packages within a session and lose them across sessions. Zero drift.

---

## Decision Framework: When Would You Choose Tasklet Native?

| If you need... | Tasklet wins | Our arch wins |
|---|---|---|
| Shell available in every interaction (no cold start) | `run_command` always there, ~instant | Vercel/E2B Sandbox — same per-session reuse + cross-invocation reconnection. +2-5s first call only, mitigated by pre-warming. **Near parity.** |
| Agent self-configuring complex triggers | Platform primitive (`setup_trigger`), zero code | ✗ (must build DB bridge, ~20 lines) |
| Rapid prototyping, no infrastructure code | Platform handles everything | ✗ (we write Vercel routes, Trigger.dev jobs, storage logic) |
| Preinstalled common tools (ffmpeg, pandoc) | Baked into base image, always available | Vercel/E2B templates — bake tools into template once, every sandbox gets them. **Parity.** |
| Cost control at scale | ✗ (platform pricing, likely LLM markup) | Serverless scales to ~$1/client/mo infra |
| Full control over infrastructure | ✗ (platform black box) | We own every layer |
| Custom channel integrations (WhatsApp, Telegram) | ✗ (limited to platform's connection types) | We build exactly what we need |
| Custom LLM routing | ✗ (platform picks model) | OpenRouter + our `llm-gateway.ts` |
| Schema control and data portability | ✗ (platform-managed opaque DB) | Supabase — we own the schema, can export anytime |

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-02-23 | Use Tasklet patterns, not Tasklet platform | We want the architecture patterns (stateless LLM, rediscovery, subagents, SQL state) without platform lock-in, per-agent pricing, or LLM markup. |
| 2026-02-23 | Bridge agent-created triggers via DB table | Small code investment (~20 lines) closes the biggest capability gap. Agent gets runtime trigger self-configuration. |
| 2026-02-23 | ~~Accept shell cold-start trade-off~~ **SUPERSEDED by v1.9** | Originally accepted +2-5s cold start as a trade-off. v1.9 shows E2B natively supports per-session sandbox reuse (same as Tasklet). E2B templates handle preinstalled tools. Cold start is first-call only, mitigated by pre-warming. No capability gap remains. |
| 2026-02-23 | Agent can modify prompts/configs, not deployed code | Agent writes to Supabase Storage (subagent instructions, configs, memory). Cannot modify Trigger.dev job code. This is intentional — prevents uncontrolled drift. |
| 2026-02-23 | v1.1 audit corrections | Tasklet compute is ephemeral (not persistent containers). Package manager is `apk` (Alpine), not `dnf`. FUSE latency is ~10-100ms (cloud-backed), not ~1ms. `create_tasklet_app` tool doesn't exist — agent writes files + calls `show_user_preview`. Trigger creation uses `setup_trigger` (separate from `manage_active_triggers`). |
| 2026-02-24 | v1.2 deep-dive corrections | Skills are lazy-loaded via system-reminder + `read_file()`, NOT pre-loaded into system prompt. Connection skills are auto-generated by platform when service is connected. System-reminder injected every turn with lightweight state snapshot. Subagents are "naked" — no system-reminder, must be self-contained. Three-tier sandbox model reframe (30-40% sandbox usage, not 5%). |
| 2026-02-24 | v1.3 cross-environment traces | System skills use hardcoded pointers in base system prompt (build-time); connection skills use dynamic pointers in system-reminder (runtime). Both lazy-load via `read_file()`. Tool names prefixed with `conn_{id}__` for OAuth routing. Platform truncates large tool results in context but saves full data to `/agent/toolcalls/` for sandbox access — this is how data crosses from external APIs into sandbox processing without bloating LLM context. Added `gmail-sandbox-execution-trace.md` reference. |
| 2026-02-24 | v1.4 dual integration system | Tasklet uses two integration backends: `static:*` (in-house, ~20-30 services, GREAT quality, direct HTTP, custom skill files) and `pipedream:*` (3000+ services, UNKNOWN quality, two-hop proxy, no skill files). Four `builtBy` types: tasklet, official-mcp, direct-api-wrapper, pipedream. Our Composio/MCP layer is architecturally equivalent to Tasklet's Pipedream path. Strategic question opened: should we build static equivalents for top 5-10 services (WhatsApp, Gmail, Calendar)? Added `integrations-pipedream/` reference. |
| 2026-02-24 | v1.5 per-agent data model and isolation | Documented user → agent (1:many) relationship. **Correction: connections are user-level (shared), not agent-level.** `list_users_connections` confirms one OAuth token per service per user, shared across all agents. Each agent activates its own subset of tools from shared connections. Storage (filesystem + SQL) remains fully isolated per agent. Database exists primarily as "continuity between amnesiac workers" — the memory bridge between stateless LLM invocations. Decision matrix: queryable data → database, everything else → filesystem. Added `per-agent-data-model.md` reference. |
| 2026-02-24 | v1.7 task list system trace | Live-traced full CRUD lifecycle. Task list is NOT a queue — zero execution semantics, LLM is the only scheduler. Killer pattern: trigger + task = resumable work across amnesiac invocations. Binary state in Tasklet (open/deleted); Sunder extends with status lifecycle, approval flags, and dual CRM/Agent task model. Implementation is ~20 lines (one DB table, three tools, one count query). Added `task-list-system/` reference. |
| 2026-02-24 | v1.9 no sandbox gap | **Verified via `@vercel/sandbox`, E2B, and AI SDK docs (Context7).** Both Vercel and E2B sandboxes are persistent objects — `Sandbox.create()` once, `.exec()` many times, packages persist within session. Vercel explicitly documents "persistent sandbox across serverless invocations" via `Sandbox.get({ sandboxId })`. AI SDK agent-skills cookbook shows exact wiring: sandbox passed via `experimental_context` to all tools. Both support cross-invocation reconnection (exceeds Tasklet). Templates bake preinstalled tools. Moved "always-available shell" from real drift to zero drift. Likely choice: `@vercel/sandbox` (tighter AI SDK integration). Only remaining delta: +2-5s first-call cold start (mitigated by pre-warming). |
| 2026-02-24 | v1.8 sandbox lifecycle correction | **Confirmed by Tasklet dev via live test:** sandbox is per-session, not per-command. First `run_command` boots container; subsequent calls spawn new shell processes in the same container. Installed packages, `/tmp/` files, and container state persist across calls within a session. Evidence: cowsay survived across calls, `/tmp/` marker file persisted, uptime continuous (1.72s → 11.46s). This means heavy installs (pandas, etc.) happen once per session, not per command. |
| 2026-02-24 | v1.6 single agent per client (resolved) | **Deliberate drift from Tasklet:** collapse user + agent into `client_id`. No `agents` table, no isolation logic, no multi-agent routing. Every Tasklet infrastructure pattern maps 1:1 — only the scoping key changes. Sunder's use case (one AI assistant that needs full context across all channels and data) is a Dorabot-pattern problem, not a Tasklet multi-agent problem. Subagents remain for computation delegation. Future multi-agent possible via migration (add `agents` table, re-scope storage key) without rewriting patterns. |
