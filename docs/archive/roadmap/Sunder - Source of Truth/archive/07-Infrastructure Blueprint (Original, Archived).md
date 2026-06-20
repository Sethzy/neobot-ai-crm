# Infrastructure Blueprint — Sunder v1/v2/v3

> **Version:** 1.2
> **Date:** February 23, 2026
> **Status:** Approved baseline. Supersedes all prior container references.
> **Depends on:** `../product-dev/01-V1 App Spec (Primary Baseline).md`, `../services/01-Built-In Services (Imported from RE-AI-CRM).md`
> **Changelog:** v1.2 — Reframed sandbox from edge-case (<5%) to first-class three-tier capability. Updated cost model for sandbox-enhanced outputs. v1.1 — Reframed Trigger.dev role (scheduler/runner/concurrency, not workflow engine). Added agent-created triggers as first-class feature. Added Flow E (agent-created trigger execution).

---

## Why This Document Exists

The V1 App Spec defines **what** Sunder does. The Built-In Services doc defines **which providers** power each capability. This document defines **where code runs, where data lives, and how they connect** — the concrete infrastructure that makes everything shippable.

### What this replaces

The V1 spec originally referenced "Per-Client Container" as Layer 2. That is superseded. The architecture is now:

- **No per-client containers.**
- **No always-on servers.**
- **No Fly Machines, no persistent sandboxes.**

Per-client isolation comes from Supabase RLS and storage path scoping, not container boundaries.

---

## Architecture Shape: Serverless + Managed Scheduler

```
┌──────────────────────────────────────────────────────────────┐
│                      ONE CODEBASE                            │
│              (monorepo, deploys to multiple targets)          │
│                                                              │
│  /app            → Vercel (frontend + API routes)            │
│  /trigger        → Trigger.dev (scheduler + runner)          │
│  /mcp-servers    → Co-deployed with API routes or workers    │
└──────────────────────────────────────────────────────────────┘
```

### What Trigger.dev actually does (and doesn't do)

Trigger.dev is our **scheduler, runner, and concurrency manager** — not a workflow engine. The workflow is the LLM tool loop (`streamText({ maxSteps: 20 })`). That's the same pattern whether it runs inside a Vercel function (Flow A) or inside a Trigger.dev task (Flow B/C/E).

What Trigger.dev provides:
- **Scheduling:** Cron jobs (pulse-checker every 30s, daily briefings per client schedule)
- **Runner:** Long-running TypeScript functions with no timeout (Vercel maxes at 15 min)
- **Concurrency control:** One active run per client, automatic queuing
- **Retry + observability:** Exponential backoff on failure, dashboard for debugging

What Trigger.dev does NOT provide:
- Workflow orchestration (no DAGs, no step definitions, no saga rollback)
- The agent logic (that's the LLM tool loop — same code path everywhere)
- State management (that's Supabase DB + Storage)

**The agent execution pattern is identical across all flows:**
```
Load context (SOUL.md, USER.md, MEMORY.md, CRM state, subagent instructions)
        ↓
generateText/streamText({ model, system, messages, tools, maxSteps: 20 })
        ↓
LLM calls tools → tools execute → results feed back → LLM continues
        ↓
Persist results + metadata
```

The only difference between flows is **who triggers the execution** and **where the function runs**.

---

## Provider Matrix (v1 locked)

| Concern | Provider | What It Does | Billing Model |
|---|---|---|---|
| Frontend + API | Vercel | React app, API routes, streaming chat, webhook handlers | Pro plan (~$20/mo) |
| Scheduler + runner | Trigger.dev | Scheduling, long-running execution, concurrency control, retries | Managed cloud, usage-based |
| Structured data | Supabase (DB) | CRM, conversations, triggers, approvals, run history | Pro plan ($25/mo) |
| Per-client files | Supabase (Storage) | SOUL.md, USER.md, MEMORY.md, skills, workflows, artifacts | Included in Supabase plan |
| Code execution | Vercel Sandbox | Sandbox-enhanced outputs (reports, analysis, file processing), Mini Lovable builds, FFmpeg for voice, ad-hoc scripts | Usage-based ($0.128/CPU-hr) |
| LLM gateway | OpenRouter | Named model set routed by `llm-gateway.ts` | Pay-per-token |
| Auth | Supabase Auth | User login, session management | Included in Supabase plan |
| Billing | Stripe | Subscription management | Standard Stripe fees |
| Realtime | Supabase Realtime | Live CRM updates, notification push | Included in Supabase plan |

### What we do NOT run

| Thing | Why not |
|---|---|
| Per-client containers (Fly Machines, etc.) | Per-client files in Supabase Storage. Code execution on-demand via Vercel Sandbox. No always-on containers needed. |
| Always-on server process | Trigger.dev cron replaces always-on polling loops. |
| Redis / queue table | Trigger.dev handles job queuing, retries, and concurrency natively. |
| Temporal cluster | We don't need workflow orchestration. The LLM tool loop IS the workflow engine. Trigger.dev handles scheduling + concurrency. |
| Custom trigger/scheduler platform | Agent-created triggers stored in Supabase DB, scanned by pulse-checker every 30s. No separate trigger platform needed. |
| E2B sandboxes | Vercel Sandbox is equivalent (Firecracker microVMs) and native to our deploy target. |

---

## The Five Request Flows

Every interaction with Sunder enters through one of five flows. All five ultimately invoke the same runner engine — `generateText/streamText({ maxSteps: 20 })` with the same tools, same context loading, same LLM.

### Flow A — Real-time chat (< 2 minutes)

```
User types message in web UI
        ↓
Vercel API route wakes up (~50ms cold start with Fluid Compute)
        ↓
Runner loads context:
  1. SOUL.md from Supabase Storage: /{clientId}/SOUL.md
  2. USER.md from Supabase Storage: /{clientId}/USER.md
  3. MEMORY.md + memory/*.md from Supabase Storage
  4. Conversation history from Supabase DB
  5. Latest compaction summary (if present)
        ↓
Vercel AI SDK tool loop (streamText with maxSteps: 20)
  Model calls tools → tools execute → results feed back → model continues
  Tools are async functions: HTTP calls to Supabase, Brave, Composio, etc.
        ↓
Stream response tokens back to user in real time
        ↓
Persist run metadata (model, tokens, cost, latency, status)
Vercel function terminates (~5–30s typical, up to 15min with Fluid Compute)
```

**Timeout budget:** Vercel Pro with Fluid Compute allows up to 15 minutes per function invocation. This is the outer clock. Most chat interactions complete in 5–30 seconds.

### Flow B — Long background task (> 2 minutes)

```
User says "research all 20 leads in my pipeline"
        ↓
Vercel API route receives message
  Runner (short tool loop) recognizes this is a long task
  Calls kickOffBackgroundJob tool
        ↓
Tool calls: await tasks.trigger("deep-research", { clientId, payload })
  Returns immediately with task ID
  Vercel function responds: "Starting research — I'll notify you when done."
        ↓
Trigger.dev worker picks up the job (no timeout)
  Loops through leads, calls Brave/Claude per lead
  Writes results to Supabase DB progressively
  Runs for 2–30 minutes
  On completion: inserts notification row in Supabase
        ↓
User sees notification in chat or Mission Control
```

**When to use Flow B vs Flow A:** If the runner estimates > 2 minutes of work (multiple sequential API calls, batch processing, enrichment loops), it kicks off a background task. The heuristic is encoded in the runner's system prompt, not hardcoded.

### Flow C — Autopilot pulse (Dorabot heartbeat)

```
Trigger.dev cron job fires every 30 seconds
        ↓
pulse-checker task runs:
  SELECT * FROM workspaces
  WHERE autopilot_enabled = true
  AND next_pulse_at <= now()
  AND quiet_hours not active
  AND no in-flight run for this workspace
        ↓
For each matching workspace:
  tasks.trigger("autopilot-pulse", { clientId })
        ↓
autopilot-pulse task runs per client:
  Load SOUL.md, USER.md, MEMORY.md from Supabase Storage
  Load CRM state, open tasks, recent activity from Supabase DB
  Run agent loop with pulse-specific system prompt
  Priority order:
    1. Advance in_progress CRM actions
    2. Check overdue follow-ups
    3. Handle blockers with owner answers
    4. Propose new CRM actions (approval-gated if risky)
    5. Propose new goals
  If no actionable work → respond AUTOPILOT_OK
        ↓
Post-pulse:
  If AUTOPILOT_OK → suppress, prune transcript, no user notification
  If real output → write to Supabase, push notification
  Update last_pulse_at, next_pulse_at
  Append pulse run record
```

**Concurrency:** Each client's pulse is a separate Trigger.dev task. Pulses for different clients run in parallel. A client with an active run is skipped until the run completes.

### Flow D — Channel webhook (v2: WhatsApp + Telegram)

```
Meta/Telegram sends webhook to Vercel API route
        ↓
Webhook handler:
  1. Validate signature (HMAC for WhatsApp, token for Telegram)
  2. Resolve client_id from phone/chat ID
  3. Resolve thread identity (chat_identity_key → thread lane)
  4. Check for pending pause state (waiting_user_input / waiting_approval)
  5. Classify: short task → Flow A inline | long task → Flow B background
  6. Return 200 immediately to webhook provider (< 5s)
        ↓
If voice note:
  Download media via platform API
  Transcribe via Whisper API
  Process as text message through Flow A/B
        ↓
Reply sent back via platform API
  (either streamed inline or pushed when background job completes)
```

**WhatsApp-specific:** Meta requires 200 response within 15 seconds. The webhook handler always responds immediately and processes asynchronously if needed.

### Flow E — Agent-created trigger (self-configured automation)

This is how the agent sets up and executes its own scheduled/event-driven workflows at runtime — without a developer deploying new code. This is a first-class feature, not a workaround.

**Phase 1 — Setup (during a chat session, Flow A):**

```
User says "Send me a pipeline summary every Monday at 9am"
        ↓
Runner (in Flow A chat) processes the request:
  1. Agent writes subagent instruction file:
     supabase.storage.upload("/{clientId}/subagents/weekly-pipeline.md", instructions)

  2. Agent calls create_trigger tool:
     INSERT INTO agent_triggers (
       client_id, trigger_type, cron_expression,
       subagent_path, payload, enabled
     ) VALUES (
       'client_123', 'schedule', '0 9 * * 1',
       'subagents/weekly-pipeline.md',
       '{"channel": "chat"}',
       true
     )

  3. Agent confirms: "Done — I'll send you a pipeline summary
     every Monday at 9am. Say 'stop the Monday summary' to cancel."
        ↓
Chat session ends. Two artifacts persist:
  - /{clientId}/subagents/weekly-pipeline.md (instruction file in Supabase Storage)
  - Row in agent_triggers table (schedule config in Supabase DB)
```

**Phase 2 — Execution (when trigger fires):**

```
pulse-checker (Trigger.dev cron, every 30s) runs:
  SELECT * FROM agent_triggers
  WHERE enabled = true
  AND trigger_type = 'schedule'
  AND next_fire_at <= now()
  AND no in-flight run for this client
        ↓
Match found: weekly-pipeline for client_123
  tasks.trigger("agent-trigger-run", {
    clientId,
    triggerId,
    subagentPath: "subagents/weekly-pipeline.md",
    payload
  })
        ↓
agent-trigger-run task (Trigger.dev, no timeout):
  1. Load subagent instruction file from Supabase Storage
  2. Load context: SOUL.md, USER.md, MEMORY.md, CRM state
  3. Run agent loop:
     generateText({
       model: openrouter('gemini-2.5-flash'),
       system: assembledSystemPrompt + instructionFileContents,
       messages: [{ role: 'user', content: JSON.stringify(triggerPayload) }],
       tools: toolDefinitions,
       maxSteps: 20,
     })
  4. Agent executes autonomously:
     - Reads CRM pipeline data (tool calls)
     - Formats summary
     - Sends to user (notification or chat message)
  5. Update agent_triggers: set next_fire_at based on cron
  6. Log execution to run_log table
        ↓
LLM context discarded. Trigger waits for next fire time.
```

**Phase 3 — Management (user modifies or cancels):**

```
User says "Stop the Monday summary"
        ↓
Runner (Flow A chat) calls manage_trigger tool:
  UPDATE agent_triggers SET enabled = false WHERE ...
  Agent confirms: "Monday pipeline summary stopped."

User says "Change it to daily at 8am"
        ↓
Runner calls manage_trigger tool:
  UPDATE agent_triggers SET cron_expression = '0 8 * * *' WHERE ...
  Agent confirms: "Pipeline summary now runs daily at 8am."
```

**The `agent_triggers` table:**

```sql
CREATE TABLE agent_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'event')),
  name TEXT NOT NULL,                          -- Human-readable: "Weekly pipeline summary"
  cron_expression TEXT,                        -- For schedule type: '0 9 * * 1'
  event_source TEXT,                           -- For event type: 'tally_submission', 'cal_booking'
  subagent_path TEXT NOT NULL,                 -- Path in Supabase Storage: 'subagents/weekly-pipeline.md'
  payload JSONB DEFAULT '{}',                  -- Static payload passed to subagent
  enabled BOOLEAN DEFAULT true,
  next_fire_at TIMESTAMPTZ,                    -- Computed from cron, updated after each run
  last_fired_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('success', 'partial', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for pulse-checker scan (runs every 30s)
CREATE INDEX idx_agent_triggers_due
  ON agent_triggers (next_fire_at)
  WHERE enabled = true;
```

**Agent tools for trigger management:**

| Tool | What it does |
|---|---|
| `create_trigger` | Insert row into `agent_triggers` + write subagent instruction file to Supabase Storage |
| `list_triggers` | `SELECT * FROM agent_triggers WHERE client_id = ?` |
| `update_trigger` | Update cron, payload, enabled status |
| `delete_trigger` | `DELETE FROM agent_triggers WHERE ...` + optionally delete subagent file |

**Why this is the same pattern as Tasklet:**

Tasklet agents call `setup_trigger` → platform registers the trigger → fresh LLM instance fires on schedule → reads instruction file → executes. Our agents call `create_trigger` → row in Supabase DB → `pulse-checker` scans → Trigger.dev task fires → loads instruction file from Supabase Storage → runs same `generateText` loop. The LLM execution is identical. The scheduling layer is different plumbing for the same outcome.

**Key insight:** The "workflow" is not code. It's a markdown instruction file that an LLM interprets at runtime. The agent writes the instructions during setup. A fresh LLM rediscovers them on each trigger fire. This is the Tasklet pattern, running on our infrastructure.

---

## Per-Client File Storage (Supabase Storage)

Every client gets an isolated directory tree in Supabase Storage. This replaces the per-client container filesystem.

```
supabase-storage/
└── clients/
    └── {clientId}/
        ├── SOUL.md                    # Assistant personality (manual edit only)
        ├── USER.md                    # User profile/preferences (manual edit only)
        ├── MEMORY.md                  # Shared memory (approval-required writes)
        ├── memory/
        │   └── *.md                   # Extended memory files
        ├── skills/
        │   ├── system/                # System skills (read-only)
        │   └── custom/                # User-approved custom skills
        ├── workflows/
        │   ├── {workflow-id}/
        │   │   ├── manifest.json
        │   │   ├── config.json
        │   │   ├── runbook.md
        │   │   └── subagent.md
        │   └── ...
        ├── subagents/
        │   └── *.md                   # Reusable subagent instruction files
        ├── artifacts/
        │   ├── {artifact-slug}/
        │   │   └── index.html         # Mini Lovable published artifacts
        │   └── ...
        ├── vault/                     # Knowledge base / document vault
        │   ├── properties/
        │   ├── contracts/
        │   ├── guides/
        │   └── clients/
        ├── toolcalls/
        │   └── {blockId}/
        │       ├── args.json          # For context recovery
        │       └── result.json        # For context recovery
        └── runs/
            └── {runId}/
                └── checkpoint.json    # Run checkpoint for pause/resume
```

### Access pattern

The runner does not access files via filesystem calls. It uses Supabase Storage SDK methods:

```typescript
// Read
const { data } = await supabase.storage
  .from('clients')
  .download(`${clientId}/SOUL.md`);

// Write
await supabase.storage
  .from('clients')
  .upload(`${clientId}/MEMORY.md`, content, { upsert: true });

// List
const { data: files } = await supabase.storage
  .from('clients')
  .list(`${clientId}/workflows`);
```

### Isolation

Supabase Storage policies scope access by `clientId`. The runner sets client context before any storage operation. No client can access another client's files.

### Toolcall artifact recovery

When `<context-removed>` appears in conversation, the runner recovers full artifacts from `/{clientId}/toolcalls/{blockId}/result.json` and `/{clientId}/toolcalls/{blockId}/args.json` per the V1 spec context recovery contract.

---

## Code Execution: Vercel Sandbox

Vercel Sandbox is a **first-class capability** of the agent, not an edge case. The agent decides when code execution would produce a better result than pure API calls, and uses the sandbox transparently — the user never knows or cares that a sandbox was involved.

### What it is

- Firecracker microVMs (same isolation tech as E2B)
- Ephemeral by default — destroyed on stop/timeout
- Amazon Linux 2023, Node.js 22/24, Python 3.13
- Full sudo access, `dnf` package manager, internet access
- Pro plan: up to 5 hours per sandbox, 2,000 concurrent

### Three-tier capability model

The agent's tool-routing logic determines when to use sandbox vs pure tool calls. The system prompt guides this decision — not hardcoded rules.

**Tier 1 — Pure tool calls (~60-70% of interactions)**

No sandbox needed. The agent calls pre-built tools directly.

| Use case | Infrastructure |
|---|---|
| CRM reads/writes | Supabase SDK call |
| Web search | Brave/Exa HTTP API call |
| Calendar/form actions | Composio SDK call |
| Send message / follow-up | Direct API call |
| File reads/writes | Supabase Storage SDK call |
| Simple Q&A / briefings | LLM response only |

**Tier 2 — Sandbox-enhanced outputs (~25-30% of interactions)**

The agent *chooses* to spin up a sandbox when code execution would produce a meaningfully richer, more useful result. The user experiences better output — they don't see the sandbox.

| Use case | What happens in the sandbox | Why sandbox is better |
|---|---|---|
| Property comparison reports | Generate branded PDF with comparison tables and charts | Text summary is mediocre; PDF with layout is client-ready |
| Market data analysis | Run pandas/data processing on listings, produce trend analysis | Agent can't do statistical analysis through API calls alone |
| Uploaded file processing | Parse Excel/CSV the client sent, extract contacts, bulk-import to CRM | Structured extraction from arbitrary files needs code |
| Document generation (complex) | ExcelJS report generation with AI-driven analysis | Rich formatted output requires code execution |
| Personalized HTML emails | Generate branded HTML email with embedded property images | Plain text emails are less effective than designed ones |
| Mini Lovable builds | Generate HTML/CSS/JS artifact, write to Supabase Storage | Interactive artifacts require code generation |
| Voice note FFmpeg | Convert audio formats for WhatsApp-native OGG/Opus | Audio format conversion requires FFmpeg binary |

**Tier 3 — Full sandbox tasks (~5-10% of interactions)**

User explicitly asks for something that requires code, or the task inherently needs sustained code execution.

| Use case | What happens in the sandbox |
|---|---|
| "Analyze this CSV and show me trends" | Data analysis with visualization output |
| "Scrape this listing page and extract details" | Custom extraction scripts |
| Bulk data transformation | Process and reshape large datasets |
| Custom calculations | User-requested financial or property calculations |

### Sandbox routing guidance (system prompt)

The runner's system prompt includes guidance like:

> When deciding whether to use the sandbox, ask: "Would executing code produce a meaningfully better result for the user?" If the answer is yes — richer formatting, data analysis, file processing, or generated artifacts — use the sandbox. If the task is a straightforward API call (CRM update, message send, web search), use tools directly.

### Integration pattern (AI SDK tool)

```typescript
import { Sandbox } from '@vercel/sandbox';
import { tool } from 'ai';
import { z } from 'zod';

const runCode = tool({
  description: 'Execute code in a secure sandbox',
  inputSchema: z.object({
    code: z.string(),
    runtime: z.enum(['node24', 'python3.13']).default('node24'),
  }),
  execute: async ({ code, runtime }) => {
    const sandbox = await Sandbox.create({
      runtime,
      timeout: ms('5m'),
      resources: { vcpus: 2 },
    });
    try {
      const filename = runtime === 'python3.13' ? 'script.py' : 'script.js';
      const cmd = runtime === 'python3.13' ? 'python3' : 'node';
      await sandbox.writeFiles([{
        path: `/vercel/sandbox/${filename}`,
        content: Buffer.from(code),
      }]);
      const result = await sandbox.runCommand({
        cmd, args: [`/vercel/sandbox/${filename}`],
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } finally {
      await sandbox.stop();
    }
  },
});
```

### FFmpeg for voice notes

FFmpeg is not pre-installed in Vercel Sandbox. Two options:

**Option A — Install at runtime (simple, slow first call):**
```bash
sudo dnf install -y ffmpeg
ffmpeg -i input.ogg -c:a libopus -b:a 16k -ar 16000 -ac 1 output.ogg
```

**Option B — Snapshot with FFmpeg pre-installed (fast, recommended):**
1. Create a sandbox once, install FFmpeg, snapshot it.
2. All future voice-note sandboxes start from that snapshot (sub-second restore).
3. Snapshot storage: $0.08/GB-month — negligible for a single pre-configured image.

Recommendation: Use Option B. Create one "voice-processing" snapshot during initial setup.

### Artifact publishing (Mini Lovable)

Without persistent containers, artifacts can't be served from a local container's public directory. Options:

| Approach | How | When |
|---|---|---|
| **Supabase Storage signed URLs** (v1 default) | Upload HTML to `/{clientId}/artifacts/{slug}/index.html`, generate signed URL with configurable expiry | Simple, works now, no custom domain |
| **Cloudflare R2 + Workers** (v1.5) | Upload to R2, serve via Workers with `{clientId}.sunder.app/{slug}` routing | Custom subdomains, CDN, permanent URLs |
| **Vercel static deploy** (alternative) | Deploy artifact as a Vercel project preview URL | Fast, but creates deployment sprawl |

v1 ships with Supabase Storage signed URLs. Upgrade to R2 when permanent/branded URLs are needed.

---

## Trigger.dev Configuration (Scheduler + Runner)

Trigger.dev is our scheduler, runner, and concurrency manager. Every Trigger.dev task follows the same pattern: load context → run `generateText/streamText` with tools → persist results. The LLM tool loop is the workflow engine, not Trigger.dev.

### Task types

| Task | Trigger | What it does | Concurrency | Timeout |
|---|---|---|---|---|
| `pulse-checker` | Cron (every 30s) | Scans for due autopilot clients AND due `agent_triggers` rows. Fans out work. Does NOT call LLM. | 1 (singleton) | 10s |
| `autopilot-pulse` | Triggered by pulse-checker | Loads client context → runs LLM tool loop with pulse prompt → advances CRM actions | 1 per clientId | 5 minutes |
| `agent-trigger-run` | Triggered by pulse-checker (from `agent_triggers` table) | Loads subagent instruction file + context → runs LLM tool loop → executes agent-defined workflow | 1 per clientId | 15 minutes |
| `deep-research` | Triggered from chat (Flow B) | Loads context → runs LLM tool loop for batch research | 1 per clientId | 30 minutes |
| `document-processing` | Triggered on file upload | Multi-step: Gemini classify → split → extract → CRM link | 1 per clientId | 10 minutes |
| `enrichment-batch` | Triggered from chat (Flow B) | Loads context → runs LLM tool loop for batch enrichment | 1 per clientId | 30 minutes |

**Note:** `daily-briefing` and `scheduled-automation` from v1.0 are now handled by `agent-trigger-run`. The agent creates these as rows in `agent_triggers` during onboarding or chat. No separate deploy-time task definitions needed.

### The pulse-checker scan (every 30 seconds)

```typescript
// trigger/pulse-checker.ts
export const pulseChecker = schedules.task({
  id: "pulse-checker",
  cron: "*/30 * * * * *",
  run: async () => {
    // 1. Autopilot clients due for a pulse
    const { data: dueClients } = await supabase
      .from('workspaces')
      .select('id')
      .eq('autopilot_enabled', true)
      .lte('next_pulse_at', new Date().toISOString())
      .eq('quiet_hours_active', false);

    for (const client of dueClients ?? []) {
      await tasks.trigger("autopilot-pulse", { clientId: client.id });
    }

    // 2. Agent-created triggers due to fire
    const { data: dueTriggers } = await supabase
      .from('agent_triggers')
      .select('*')
      .eq('enabled', true)
      .lte('next_fire_at', new Date().toISOString());

    for (const trigger of dueTriggers ?? []) {
      await tasks.trigger("agent-trigger-run", {
        clientId: trigger.client_id,
        triggerId: trigger.id,
        subagentPath: trigger.subagent_path,
        payload: trigger.payload,
      });
    }
  },
});
```

Both scans run in the same 30-second loop. The pulse-checker is lightweight (two DB queries + fan-out). The actual LLM work happens in the triggered tasks.

### Concurrency model

- **Per-client concurrency = 1** for most tasks. This aligns with the V1 spec's "one active run per thread" contract.
- **Cross-client parallelism is unlimited.** Different clients' pulses and triggers run concurrently.
- Trigger.dev handles queuing automatically — if a task for clientId X arrives while one is running, it waits.

### Retry policy

| Task type | Max retries | Backoff |
|---|---|---|
| autopilot-pulse | 0 (skip, catch next tick) | N/A |
| agent-trigger-run | 2 | Exponential (10s, 60s) |
| deep-research | 2 | Exponential (10s, 60s) |
| document-processing | 3 | Exponential (5s, 30s, 120s) |

### Observability

Trigger.dev's managed dashboard provides:
- Real-time task status per client
- Run duration, success/failure rates
- Error logs with full stack traces
- Task queue depth and wait times

This replaces the need for custom operational dashboards for background tasks.

---

## Tool Loop Mechanics

The runner uses Vercel AI SDK's `streamText` with `maxSteps` for the tool loop. This is how tool calling works within a single function invocation:

```
Vercel Function starts
        ↓
streamText({
  model: openrouter('gemini-2.5-flash'),
  system: assembledSystemPrompt,
  messages: conversationHistory,
  tools: toolDefinitions,
  maxSteps: 20,
})
        ↓
Step 1: Model returns tool_call (e.g., "search_contacts")
  → SDK executes tool function (HTTP call to Supabase)
  → Result appended to messages
Step 2: Model returns tool_call (e.g., "search_web")
  → SDK executes tool function (HTTP call to Brave)
  → Result appended to messages
Step 3: Model returns final text answer
  → Streamed to user
        ↓
Vercel Function terminates
```

**Key points:**
1. The entire tool loop runs inside ONE function invocation.
2. Each "step" is one model API call + tool execution. maxSteps: 20 means up to 20 round-trips.
3. Tools are just async functions — they make HTTP requests, not subprocess calls.
4. The Vercel function is mostly waiting on network I/O (model API calls, Supabase queries, search APIs). CPU usage is minimal.
5. Total wall-clock time is: sum of (model response latency + tool execution latency) per step.

### Timeout chain

```
┌─────────────────────────────────────────────────────────┐
│  Vercel Function (outer clock: up to 15 min)            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Tool Loop (maxSteps: 20)                         │  │
│  │                                                   │  │
│  │  Step 1: model call (2s) + tool exec (0.5s)       │  │
│  │  Step 2: model call (2s) + tool exec (1s)         │  │
│  │  ...                                              │  │
│  │  Step N: model returns final answer               │  │
│  │                                                   │  │
│  │  If a tool calls Vercel Sandbox:                  │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  Sandbox (inner clock: 5 min default)       │  │  │
│  │  │  Install packages, run script, return result │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │  Both clocks must fit within outer 15 min limit   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Service-to-Infrastructure Mapping

This maps every service from `Built-In Services` to its infrastructure home.

### Services that run in Vercel Functions (Flow A)

| Service | Tool pattern | Infrastructure |
|---|---|---|
| CRM (Supabase) | `supabase.from('contacts').select(...)` | Supabase SDK call |
| Web search (Brave) | `fetch('https://api.search.brave.com/...')` | HTTP API call |
| URL extraction (Exa) | `fetch('https://api.exa.ai/contents')` | HTTP API call |
| Scheduling (Cal.com) | `composio.tools.execute('CAL_*', ...)` | Composio SDK call |
| Forms (Tally) | `composio.tools.execute('TALLY_*', ...)` | Composio SDK call |
| Voice transcription (Whisper) | `fetch('https://api.openai.com/v1/audio/transcriptions')` | HTTP API call |
| Knowledge read/write | `supabase.storage.download(...)` / `.upload(...)` | Supabase Storage SDK |
| Memory read/write | `supabase.storage.download(...)` / `.upload(...)` | Supabase Storage SDK |
| Browser (Browserbase) | Browserbase SDK/API call | HTTP API call |
| Browser (Firecrawl) | Firecrawl API call | HTTP API call |

### Services that run via Trigger.dev (Flow B/C/E)

All of these run the same LLM tool loop. Trigger.dev provides scheduling, timeouts, concurrency, and retries — not the agent logic.

| Service | Why Trigger.dev (not Vercel function) | Trigger type |
|---|---|---|
| Document extraction pipeline | Multi-step, potentially slow (>2 min) | Triggered from file upload |
| Autopilot pulse | Scheduled per-client, every 30s scan | pulse-checker cron → `autopilot-pulse` task |
| Agent-created automations (daily briefing, weekly summary, booking research, etc.) | Agent-defined schedules, arbitrary duration | pulse-checker cron → `agent-trigger-run` task |
| Batch enrichment | Many sequential API calls (>2 min) | Triggered from chat (Flow B) |
| Bulk lead research | Long-running, many API calls (>2 min) | Triggered from chat (Flow B) |

### Services that use Vercel Sandbox (Tier 2 + Tier 3)

| Service | What runs in sandbox | Duration | Tier |
|---|---|---|---|
| Property comparison reports | Generate branded PDF with tables and charts | 30s–2min | Tier 2 |
| Market data analysis | Statistical analysis, trend detection, visualization | 30s–2min | Tier 2 |
| Uploaded file processing | Parse Excel/CSV, extract data, bulk-import | 15s–2min | Tier 2 |
| Mini Lovable (artifact publishing) | Generate HTML artifact, upload to Storage | 30s–2min | Tier 2 |
| Document generation (complex) | ExcelJS report generation with AI analysis | 30–60s | Tier 2 |
| Personalized HTML emails | Generate branded HTML with embedded images | 15–30s | Tier 2 |
| Voice output (Inworld → WhatsApp) | FFmpeg audio format conversion | 5–15s | Tier 2 |
| Ad-hoc code execution | User-requested calculations, data processing | Variable | Tier 3 |
| Custom data transformation | Bulk reshape, filter, enrich datasets | 30s–5min | Tier 3 |

### Services that are external SaaS (no Sunder infrastructure)

| Service | How accessed | Account ownership |
|---|---|---|
| Cal.com | Composio OAuth | User's free account |
| Tally.so | Composio API key | User's free account |
| Granola | MCP connection | User's free account |
| Inworld AI | Direct API | Sunder central account |
| OpenAI (Whisper) | Direct API | Sunder central account |
| Resend (Phase 3) | Direct API | Sunder central account |
| DocuSeal (Phase 3) | Direct API | Sunder central account |
| Short.io (Phase 3) | Composio | User's free account |
| Postiz (Phase 2) | TBD | TBD |

---

## Cost Model (Infrastructure Only)

This covers infrastructure costs, not LLM token costs (see V1 spec cost strategy) or service provider costs (see Built-In Services cost summary).

### Fixed monthly costs

| Provider | Plan | Monthly cost |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Pro | $25 |
| Trigger.dev | Managed cloud | ~$10–30 (usage-based) |
| **Total fixed** | | **~$55–75/mo** |

### Variable costs (scale with usage)

Sandbox cost estimate assumes ~30% of interactions use sandbox (Tier 2 + Tier 3), with average sandbox session ~30-60 seconds of compute.

| Resource | Unit cost | At 10 clients | At 100 clients |
|---|---|---|---|
| Vercel Sandbox CPU | $0.128/hr | ~$10/mo | ~$80/mo |
| Supabase Storage | $0.021/GB/mo | ~$0.10/mo | ~$2/mo |
| Supabase DB egress | Included in Pro | $0 | $0 |
| Trigger.dev tasks | Usage-based | ~$5/mo | ~$25/mo |
| **Total variable** | | **~$15/mo** | **~$107/mo** |

Sandbox cost breakdown at 100 clients: ~50 interactions/day/client × 30% sandbox rate × ~45 seconds avg × $0.128/CPU-hr = ~$0.80/client/mo. This is a meaningful line item but well within the $20/client budget.

### Per-client infrastructure cost

| Scale | Infrastructure/client/mo | Notes |
|---|---|---|
| 10 clients | ~$7.00–9.00 | Fixed costs dominate |
| 50 clients | ~$2.10–3.00 | Fixed costs amortize |
| 100 clients | ~$1.50–1.80 | Well under $20 target |

This is infrastructure only. Add LLM costs (~$2–5/client/mo with smart routing) and service costs (~$3/client/mo) for total unit economics. See `../services/02-Unit Economics Model ($20 Target vs Actual).md`.

---

## Deployment Model

### Single codebase, multiple deploy targets

```
sunder/
├── apps/
│   └── web/                    # React 19 + Vite 7 frontend
│       └── → deploys to Vercel (static)
├── api/
│   ├── routes/                 # API routes
│   │   ├── chat.ts            # Flow A: streaming chat
│   │   ├── webhooks/
│   │   │   ├── whatsapp.ts    # Flow D: WhatsApp webhook
│   │   │   ├── telegram.ts    # Flow D: Telegram webhook
│   │   │   ├── tally.ts       # Tally form submission webhook
│   │   │   └── calcom.ts      # Cal.com booking webhook
│   │   ├── integrations/      # Composio connection management
│   │   └── ...
│   ├── runner/                 # Runner engine (shared by all flows)
│   │   ├── engine.ts          # Core tool loop (generateText/streamText)
│   │   ├── tools/             # Tool definitions
│   │   │   ├── crm.ts         # CRM read/write tools
│   │   │   ├── search.ts      # Web search, URL extraction
│   │   │   ├── triggers.ts    # create_trigger, list_triggers, update_trigger, delete_trigger
│   │   │   ├── subagent.ts    # run_subagent (spawn fresh LLM with instruction file)
│   │   │   └── ...
│   │   ├── prompt/            # System prompt assembly
│   │   └── llm-gateway.ts     # Model routing
│   └── → deploys to Vercel (serverless functions)
├── trigger/
│   ├── pulse-checker.ts       # Cron: scans for due autopilot + agent_triggers
│   ├── autopilot-pulse.ts     # Per-client pulse execution (LLM tool loop)
│   ├── agent-trigger-run.ts   # Agent-created trigger execution (LLM tool loop)
│   ├── deep-research.ts       # Background research (LLM tool loop)
│   ├── document-processing.ts # Document extraction pipeline
│   └── → deploys to Trigger.dev (scheduler + runner)
├── mcp-servers/
│   └── docgen/                # Document generation MCP
│       └── → co-deployed with API
├── packages/
│   ├── shared/                # Shared types, utils, Supabase client
│   └── ...
└── supabase/
    ├── migrations/            # DB schema migrations
    └── seed.sql               # Seed data
```

### Environment variables

```env
# Vercel + Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# LLM
OPENROUTER_API_KEY=sk-or-...

# Trigger.dev
TRIGGER_API_KEY=tr_...
TRIGGER_API_URL=https://api.trigger.dev

# Vercel Sandbox
VERCEL_TOKEN=...
VERCEL_TEAM_ID=...
VERCEL_PROJECT_ID=...

# External services
BRAVE_SEARCH_API_KEY=...
EXA_API_KEY=...
COMPOSIO_API_KEY=composio_...
OPENAI_API_KEY=sk-...          # For Whisper
INWORLD_API_KEY=...
BROWSERBASE_API_KEY=...
FIRECRAWL_API_KEY=...

# WhatsApp (v2)
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Scaling Path

### v1 (0–50 clients): Current architecture unchanged

Everything runs on Vercel Pro + Supabase Pro + Trigger.dev managed cloud. No infrastructure changes needed.

### v1.5 (50–500 clients): Optimize hot paths

- **Artifact hosting:** Move from Supabase signed URLs to Cloudflare R2 + Workers for permanent, CDN-backed artifact URLs with custom subdomains.
- **Storage tiering:** Move large files (vault documents, generated reports) to R2 while keeping small files (SOUL.md, MEMORY.md, skills) on Supabase Storage for simplicity.
- **Sandbox snapshots:** Pre-warm snapshots for common execution environments (FFmpeg, ExcelJS, pandas, data analysis stack) to reduce cold-start overhead. At 30% sandbox usage, cold-start optimization becomes cost-meaningful.
- **Sandbox pre-warming:** Spin up sandbox when user starts typing (WebSocket keypress signal). At Tier 2 usage rates, the latency savings justify the speculative compute cost.

### v2+ (500+ clients): Evaluate only if needed

- **Trigger.dev self-hosting:** If managed cloud costs exceed value, self-host on Fly.io or Railway.
- **Supabase scaling:** Move to Supabase Team or Enterprise plan. Consider read replicas for heavy Mission Control dashboard queries.
- **Regional deployment:** Currently single-region. Add regions only if latency measurements justify it.

---

## Spec Alignment Notes

### Changes to V1 App Spec

The V1 spec has been updated (v1.2) to reflect the infrastructure blueprint. Key changes made:

| V1 Spec Section | What changed |
|---|---|
| §7 Layer 2 | Updated from "Per-Client Container" to "Per-Client Storage + On-Demand Sandbox" with three-tier model description |
| §8 Provider matrix | Replaced "Per-client runtime" with "Per-client files: Supabase Storage" + "Code execution: Vercel Sandbox" |
| §8 Provider matrix | Updated Mini Lovable to reference Vercel Sandbox + Supabase Storage signed URLs |
| §10 Step 12 | Replaced per-client workspace with "Supabase Storage + Vercel Sandbox" |
| §12 Component 2 (Tool Bridge) | Added Storage tools and Sandbox tools categories; renamed Filesystem tools |

Still pending (not yet updated in V1 spec):

| V1 Spec Section | Current text | Infrastructure reality |
|---|---|---|
| §12 Component 4 | "Trigger/Scheduler System" (implied in-process) | Trigger.dev (scheduler + runner) + `agent_triggers` table (agent-created schedules). Agent calls `create_trigger` tool → row in DB → `pulse-checker` scans every 30s → fires `agent-trigger-run` task. |
| §13 Data classes in workspace | Implied filesystem | Supabase Storage paths |

### Changes to Built-In Services

| Services Doc Section | Current text | Infrastructure reality |
|---|---|---|
| §4 Knowledge Base architecture | Was "persistent filesystem" | Supabase Storage `/clients/{clientId}/vault/` + Supabase DB metadata index |
| §9.3 FFmpeg | Was "FFmpeg runs in container" | FFmpeg runs in Vercel Sandbox (from pre-built snapshot) |
| §13 Mini Lovable hosting | Was "Static HTML files served from container" | Supabase Storage signed URLs (v1), R2 + Workers (v1.5) |
| §Edge Cases: File durability | Was "persistent filesystem survives restarts" | Not applicable — Supabase Storage is the durable store by default |
| §Edge Cases: Document Vault backup | "Background sync to Supabase Storage as backup" | Not applicable — Supabase Storage IS the primary store |

### What stays the same

Everything else in both specs is infrastructure-agnostic and works as-is:

- Runner engine design and tool loop
- System prompt structure and Tasklet alignment
- CRM data model (Supabase DB)
- Approval gates and safety rules
- Connection lifecycle (Composio, MCP, Direct API)
- Session continuity contracts (threads, queuing, replay)
- Memory and personality contracts (SOUL.md, USER.md, MEMORY.md)
- Cost ceiling and model routing strategy
- All service provider choices and integrations
- All test categories and acceptance criteria

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-02-23 | No per-client containers | Per-client files in Supabase Storage. Code execution on-demand via Vercel Sandbox (three-tier model: pure tools ~60-70%, sandbox-enhanced ~25-30%, full sandbox ~5-10%). |
| 2026-02-23 | Sandbox as first-class capability | Sandbox is not an edge case — the agent uses it whenever code execution would produce a meaningfully better result. Three-tier model lets the agent decide transparently. Inspired by Fintool/Tasklet patterns where sandbox is core to every interaction. |
| 2026-02-23 | Trigger.dev as scheduler + runner (not workflow engine) | The LLM tool loop IS the workflow engine. Trigger.dev provides scheduling, concurrency control, retry, and long timeouts. No DAGs, no sagas, no step definitions needed. |
| 2026-02-23 | Agent-created triggers as first-class feature | Agents can self-configure schedules and event triggers at runtime via `create_trigger` tool → `agent_triggers` DB table → `pulse-checker` scan. Same pattern as Tasklet's `setup_trigger`, running on our infrastructure. No new deploy needed for new automations. |
| 2026-02-23 | Workflows are markdown, not code | Agent writes instruction files (subagent .md) during setup. Fresh LLM instances interpret them at trigger fire time. The "workflow definition" is a prompt file, not a DAG or state machine. Adapts to edge cases without explicit branching logic. |
| 2026-02-23 | Vercel Sandbox over E2B | Native to Vercel deploy target. Same Firecracker isolation. Snapshot support for pre-installed binaries. Pro plan allows 5-hour sessions. |
| 2026-02-23 | Supabase Storage over S3/R2 | Already paying for Supabase Pro. Simplifies stack — one fewer provider. Upgrade to R2 for CDN when artifact hosting needs it. |
| 2026-02-23 | Shape 1 architecture | Validated by Fintool production patterns (S3-first storage, ephemeral sandbox, managed scheduling) and Tasklet patterns (stateless LLM, rediscovery from durable artifacts, subagent spawning). |
