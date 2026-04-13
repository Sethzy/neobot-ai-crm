# Cabinet Cron Job Patterns — Reference & Sunder Drift Analysis

**Reference repo:** `/Users/sethlim/Documents/cabinet`  
**Purpose:** Document Cabinet's cron job implementation patterns and compare against Sunder's scheduler. Identify where we align, where we legitimately must drift, and where we have accidental drift to close.

---

## 1. What Cabinet Is

Cabinet is an open-source, AI-first "startup OS" — a file-based knowledge base with AI agents that have memory, goals, and scheduled jobs. It is a **local, single-tenant, self-hosted** application running a persistent Node.js daemon alongside a Next.js frontend. No cloud backend, no Postgres, no multi-tenancy.

This context is critical: Cabinet's scheduler is a single-process, local daemon. Sunder is a distributed, multi-tenant, serverless SaaS. Every architectural difference flows from this root difference.

---

## 2. Cabinet's Cron Architecture — The Canonical Patterns

### 2.1 Data Model

**Job config stored as YAML files on disk:**

```
/data/.agents/{agentSlug}/jobs/{jobId}.yaml
```

```yaml
id: daily-priority-check
name: Daily priority check
enabled: true
schedule: "0 9 * * 1-5"    # 5-field cron, UTC
provider: claude-code
agentSlug: cto
prompt: |
  Review the latest roadmap and write daily priorities...
timeout: 600                 # seconds; default 600
createdAt: 2025-04-13T...
updatedAt: 2025-04-13T...
on_complete:
  - action: git_commit
    message: "Daily priorities updated {{date}}"
on_failure:
  - action: notify
    channel: alerts
```

**SQLite tables for execution history:**

```sql
-- sessions table
id, agent_slug, status (running|completed|failed|cancelled),
trigger (manual|job|mission|mention|heartbeat),
started_at, completed_at, exit_code, output_summary, job_id

-- job_runs table
id, job_id, agent_slug, status, started_at, completed_at,
duration_ms, output, error, session_id (FK → sessions)
```

**Key insight:** Config and execution history are separated. Config is human-readable YAML. History is queryable SQL.

### 2.2 Scheduler Daemon

Cabinet runs a **persistent Node.js daemon** (`server/cabinet-daemon.ts`) that:

1. Loads all YAML job files from disk on startup (`reloadSchedules()`)
2. Validates each cron expression via `node-cron.validate(schedule)`
3. Registers valid, enabled jobs as `cron.schedule(schedule, callback)`
4. Watches `/data/.agents/*/jobs/*.yaml` for changes via `chokidar`; debounces at 200ms
5. On file change: destroys old cron tasks, re-registers all jobs

```typescript
// In cabinet-daemon.ts
const scheduledJobs = new Map<string, cron.Task>();

function scheduleJob(job: Job) {
  if (!cron.validate(job.schedule)) {
    console.warn(`Invalid cron: ${job.schedule} for ${job.id}`);
    return;
  }
  if (!job.enabled) return;
  
  const task = cron.schedule(job.schedule, async () => {
    await fetch(`/api/agents/${job.agentSlug}/jobs/${job.id}`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'run' })
    });
  });
  
  scheduledJobs.set(job.id, task);
}
```

### 2.3 Execution Flow

```
Daemon (node-cron tick)
  → POST /api/agents/{slug}/jobs/{jobId} {action: "run"}
  → API: executeJob(job) → startJobConversation(job)
  → Creates detached PTY session with timeout
  → AI provider executes job.prompt
  → Exit: on_complete or on_failure post-actions run
```

**Heartbeat variant:** Separate from jobs. Each agent has a `heartbeat: "0 10 * * 1-5"` cron in its `persona.md` YAML frontmatter. Daemon registers these identically. Heartbeat execution builds richer context (memory files, inbox, goals) and parses structured `memory` blocks from output.

### 2.4 Anti-Duplicate / Locking

Cabinet has **no distributed lock**. It assumes a single daemon instance.

Safety comes from:
- **PTY session timeout** — kills the process after `job.timeout` seconds
- **Heartbeat running flag** — `markHeartbeatRunning(slug)` prevents overlapping heartbeat runs
- **15-minute job conversation timeout** — waits up to 15 min via 3-second polling

### 2.5 Retry / Error Handling

| Scenario | Cabinet Behavior |
|---|---|
| Invalid cron expression | Log warning, skip job (no auto-disable) |
| Job timeout | PTY killed, `on_failure` post-actions run |
| Heartbeat failure | Logged; auto-pause after 3 consecutive failures |
| Heartbeat budget exceeded | Agent paused (`heartbeatsUsed >= budget`) |
| No retry logic | Each cron tick is an independent fire; no re-queue on failure |

### 2.6 Cron Expression Handling

- **Storage:** Raw 5-field cron string (`"0 9 * * 1-5"`)
- **Validation:** `cron.validate(expr)` from `node-cron`
- **Display:** `cronToHuman(expr)` converts to readable labels (preset map + pattern fallback)
- **Short label:** `cronToShortLabel(expr)` → `"Daily 9am"`, `"15m"`, `"4h"`
- **Next runs:** `getNextRuns(expr, count)` for UI preview

### 2.7 API Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/agents/{slug}/jobs` | GET | List jobs for agent |
| `/api/agents/{slug}/jobs` | POST | Create job |
| `/api/agents/{slug}/jobs/{jobId}` | GET | Get job details |
| `/api/agents/{slug}/jobs/{jobId}` | PUT | Update job or `{action: "run"|"toggle"}` |
| `/api/agents/{slug}/jobs/{jobId}` | DELETE | Delete job |
| `/api/agents/library` | GET | 30+ pre-built job templates |
| `/api/agents/scheduler` | GET | Daemon status (active jobs, heartbeats) |
| `/api/agents/scheduler` | POST | Control: `start-all`, `stop-all`, `activate`, `pause` |

**Daemon HTTP (separate process):**
- `POST /sessions` — Create PTY session
- `POST /reload-schedules` — Force reload all jobs
- `GET /health` — Job/heartbeat counts

### 2.8 UI Components

| Component | Purpose |
|---|---|
| `JobsManager` | Left sidebar (agent list) + main panel (job list, detail form, run history) |
| `SchedulePicker` | Preset buttons + raw cron editor + next 3 run times preview |
| Library templates | 30+ pre-built jobs by department (leadership, product, marketing, sales, eng) |

### 2.9 Post-Job Actions

```typescript
on_complete: [
  { action: "git_commit", message: "Daily update {{date}}" },
  { action: "update_page", path: "/reports/daily", message: "..." },
  { action: "notify", channel: "alerts" }
]
```

Template vars available in prompts and actions: `{{date}}`, `{{datetime}}`, `{{job.name}}`, `{{job.id}}`, `{{job.workdir}}`

---

## 3. Sunder's Current Implementation

### 3.1 Files to Touch

**Core library:**
- `src/lib/triggers/schemas.ts` — Zod schemas
- `src/lib/triggers/scanner.ts` — Scan/claim business logic
- `src/lib/triggers/executor.ts` — Trigger execution
- `src/lib/triggers/cron-utils.ts` — Cron parsing, next-fire computation
- `src/lib/triggers/cron-builder.ts` — UI → cron expression builder
- `src/lib/triggers/cron-display.ts` — Human-readable cron display
- `src/lib/triggers/trigger-event.ts` — Kickoff message formatting
- `src/lib/triggers/webhook-auth.ts` — HMAC validation
- `src/lib/triggers/webhook-claim.ts` — Atomic webhook claim
- `src/lib/triggers/route-auth.ts` — CRON_SECRET auth helpers
- `src/lib/triggers/rss.ts` — RSS feed parsing
- `src/lib/triggers/rss-schedule.ts` — RSS polling schedule

**API routes:**
- `app/api/cron/scan/route.ts` — Entry point for scanner tick
- `app/api/trigger/run/route.ts` — Internal dispatch target (requires CRON_SECRET)
- `app/api/trigger/webhook/[triggerId]/route.ts` — Public webhook ingress
- `app/api/automations/[triggerId]/run/route.ts` — Manual trigger execution

**Trigger.dev tasks:**
- `src/trigger/scan-triggers.ts` — Scheduled scan task (fires every minute)
- `src/trigger/run-trigger-agent.ts` — Per-trigger agent run task

**Managed Agents integration:**
- `src/lib/managed-agents/spawn-trigger-run.ts` — Create session + run record
- `src/lib/managed-agents/finalize-trigger-run.ts` — Terminal state cleanup

**Agent tools:**
- `src/lib/managed-agents/tools/triggers/setup-trigger.ts`
- `src/lib/managed-agents/tools/triggers/manage-active-triggers.ts`
- `src/lib/managed-agents/tools/triggers/search-triggers.ts`

**UI:**
- `src/components/automations/automation-detail.tsx`
- `src/components/automations/automation-schedule-sidebar.tsx`
- `src/components/automations/automations-table.tsx`
- `src/components/automations/automations-list.tsx`
- `src/components/automations/automation-header.tsx`
- `src/components/automations/automation-runs.tsx`
- `src/components/automations/automation-instructions.tsx`

**Hooks:**
- `src/hooks/use-triggers.ts`
- `src/hooks/use-trigger-runs.ts`
- `src/hooks/use-trigger-instructions.ts`

**DB migrations:**
- `supabase/migrations/20260306010000_create_agent_triggers.sql`
- `supabase/migrations/20260306010001_create_trigger_rpc_functions.sql`
- `supabase/migrations/20260306010002_harden_trigger_rpc_functions.sql`
- `supabase/migrations/20260306040000_add_trigger_retry_and_webhook_columns.sql`
- `supabase/migrations/20260306040002_update_release_trigger_claim_for_retry.sql`
- `supabase/migrations/20260306030001_add_pulse_trigger_type.sql`
- `supabase/migrations/20260306040001_add_active_trigger_count_to_system_reminder.sql`
- `supabase/migrations/20260306040003_enable_realtime_for_agent_triggers.sql`
- `supabase/migrations/20260412130100_runs_trigger_linkage.sql`

### 3.2 Data Model

**`agent_triggers` table:**
```sql
id UUID PRIMARY KEY
client_id UUID NOT NULL                         -- Multi-tenant isolation
thread_id UUID NOT NULL                         -- Parent thread for this automation
trigger_type TEXT CHECK ('schedule','webhook','rss','pulse')
name TEXT NOT NULL
cron_expression TEXT                            -- NULL for webhook
instruction_path TEXT NOT NULL                  -- File path to SOP instructions
payload JSONB DEFAULT '{}'                      -- Type-specific config (timezone, feed_url, etc.)
enabled BOOLEAN DEFAULT true
current_run_id UUID                             -- Distributed lock token (NULL = idle)
next_fire_at TIMESTAMPTZ                        -- Next scheduled execution
last_fired_at TIMESTAMPTZ
last_status TEXT
retry_count INTEGER DEFAULT 0
webhook_secret TEXT
invocation_message TEXT                         -- Max 200 chars, shown to agent
created_at, updated_at TIMESTAMPTZ
```

**`runs` table (relevant columns):**
```sql
run_id UUID PRIMARY KEY
trigger_id UUID REFERENCES agent_triggers(id)  -- Links run to parent trigger
run_thread_id UUID                             -- Dedicated thread for this run
status run_status
tokens_in, tokens_out INTEGER
created_at, completed_at TIMESTAMPTZ
```

### 3.3 Execution Flow

```
Trigger.dev scanTriggers task (every minute)
  → GET /api/cron/scan (CRON_SECRET auth)
  → claim_due_triggers() RPC — atomic UPDATE WHERE current_run_id IS NULL AND next_fire_at <= now()
  → For each claimed trigger:
      - Compute next_fire_at via cron-parser (timezone-aware)
      - Pulse: check quiet hours, skip if in window
      - RSS: fetch feed, diff against seen state
      - POST /api/trigger/run (CRON_SECRET auth)
  → executeTrigger():
      - Validate current_run_id ownership
      - Build trigger-event XML message
      - spawnTriggerRun() → create session + run record + dedicated thread
      - Trigger runTriggerAgent task (background)
  → consumeAnthropicSession() processes SSE stream
  → finalizeTriggerRun() on terminal state
  → release_trigger_claim() RPC — reset current_run_id, update next_fire_at, manage retry_count
```

### 3.4 RPC Functions (Atomic, Service-Role Only)

- `claim_due_triggers()` — Atomically claims all due triggers in a single UPDATE
- `release_trigger_claim(trigger_id, run_id, status, next_fire_at, advance_next_fire_at)` — Releases claim, updates counters
- `release_stale_trigger_claims()` — Reaps claims held >15 minutes

### 3.5 Retry / Error Handling

| Scenario | Sunder Behavior |
|---|---|
| Invalid cron expression | `InvalidCronExpressionError` → disable trigger, set `last_status="invalid_cron"` |
| Invalid RSS config | `InvalidRssConfigError` → disable trigger, set `last_status="invalid_rss_config"` |
| Dispatch failed (schedule/rss) | Increment `retry_count`; after `MAX_USER_CREATED_RETRIES` (2) → `enabled=false`, `last_status="failed_permanent"` |
| Dispatch failed (pulse) | No retry; advance `next_fire_at` immediately |
| Stale claim (>15 min) | `release_stale_trigger_claims()` → `last_status="stale_released"` |
| Quiet hours (pulse) | Skip execution, advance `next_fire_at` past window; `last_status="skipped_quiet_hours"` |

### 3.6 Trigger Types

Sunder ships **four** trigger types vs Cabinet's one:

| Type | Sunder | Cabinet Equivalent |
|---|---|---|
| `schedule` | Cron-based repeating automation | ✅ Core feature (jobs) |
| `pulse` | Built-in autopilot (single per client, quiet hours) | Closest: heartbeat |
| `webhook` | Inbound HTTP with HMAC auth | ❌ Not present |
| `rss` | Feed polling with seen-item state | ❌ Not present |

---

## 4. Where We Align With Cabinet

These patterns are identical or functionally equivalent to Cabinet's approach. No drift.

### 4.1 5-Field Cron Expressions

Both store raw 5-field cron strings. Neither transforms them at write time.

### 4.2 Human-Readable Display

Cabinet: `cronToHuman(expr)` with preset map + pattern fallback  
Sunder: `cron-display.ts` with similar preset → human logic via `cronstrue`

Same pattern, different library. Acceptable.

### 4.3 Validate Before Storing

Cabinet validates with `cron.validate()` before registering.  
Sunder validates at insert time and also at scan time (`InvalidCronExpressionError` path).

### 4.4 Config/History Separation

Cabinet: YAML for config, SQLite for run history.  
Sunder: `agent_triggers` table for config, `runs` table for history.

Same conceptual separation, different storage medium.

### 4.5 Separate Config and Execution State

Cabinet: `enabled` field on job YAML.  
Sunder: `enabled` column + `current_run_id` claim token + `last_status`.

Same pattern, Sunder adds distributed lock fields needed for serverless.

### 4.6 Idempotent Scan / No Persistent Daemon State

Cabinet daemon reloads from files on change — no in-memory "run schedule" persisted.  
Sunder scanner is stateless per tick — `next_fire_at` in the DB is the only state.

Both designs are idempotent and recoverable from restart.

### 4.7 Instruction-as-Prompt Pattern

Cabinet: `job.prompt` field — the instruction sent to the agent.  
Sunder: `instruction_path` — a file path in Supabase Storage that the agent reads.

Same idea (separate instruction authoring from scheduling config), just storage differs (inline vs file-per-trigger).

### 4.8 Manual Run Endpoint

Cabinet: `PUT /api/agents/{slug}/jobs/{jobId}` with `{action: "run"}`.  
Sunder: `POST /api/automations/{triggerId}/run` (skips claim cycle, direct spawn).

Both support out-of-band manual execution.

### 4.9 Next-Run Preview in UI

Cabinet: `getNextRuns(cron, count)` shown in SchedulePicker.  
Sunder: `automation-schedule-sidebar.tsx` shows next runs via cron-parser.

### 4.10 Enable/Disable Toggle

Cabinet: `toggle` action on job PUT endpoint; `enabled` field in YAML.  
Sunder: `enabled` column updated via `manage-active-triggers` tool or UI mutation.

---

## 5. Where We Legitimately Drift (Justified)

These differences are **required** by Sunder's infrastructure constraints. Default to Cabinet's approach where infrastructure allows. Accept drift only where justified below.

### 5.1 No Daemon Process — Vercel Serverless

**Cabinet:** Persistent `cabinet-daemon.ts` process with `node-cron`.  
**Sunder:** Trigger.dev scheduled task fires every minute → stateless HTTP handler.

**Why:** Vercel Functions are ephemeral. There is no persistent process to hold a `cron.schedule()` registration. A cloud-native cron tick is the only viable approach.

**Consequence:** No in-memory job registry. `next_fire_at` in the DB is the authoritative source of truth for when a job should next fire.

### 5.2 Distributed Claim Lock vs. Single-Process Flag

**Cabinet:** `markHeartbeatRunning(slug)` — an in-memory flag.  
**Sunder:** `current_run_id UUID` in Postgres — an atomic DB-level distributed lock.

**Why:** Multiple Vercel Function instances can run concurrently. Only a DB-level atomic `UPDATE ... WHERE current_run_id IS NULL` guarantees exactly-once dispatch. `claim_due_triggers()` RPC does this in a single round-trip.

**This is the correct approach and should not be changed.**

### 5.3 YAML Files → Postgres Table

**Cabinet:** Job configs as YAML files, loaded via `fs` + `chokidar`.  
**Sunder:** `agent_triggers` table with RLS per `client_id`.

**Why:** Sunder is multi-tenant. File-per-job on disk is not viable for a multi-tenant SaaS. Postgres + RLS enforces tenant isolation automatically.

### 5.4 File Watcher → Scanner Tick

**Cabinet:** `chokidar` detects YAML file changes → immediate daemon reload.  
**Sunder:** Trigger.dev fires `scanTriggers` every minute; `next_fire_at` is the trigger.

**Why:** No persistent process to attach a file watcher to.

**Side effect:** Up to 60 seconds of latency between a trigger being enabled and its first fire. This is acceptable and documented.

### 5.5 No PTY Sessions — Managed Agents Sessions

**Cabinet:** PTY session (`node-pty`) for each job run, with timeout kill.  
**Sunder:** Anthropic Managed Agents session via `consumeAnthropicSession()`.

**Why:** Sunder's agent is an Anthropic Managed Agent, not a CLI tool. The execution substrate is fundamentally different.

**Retained from Cabinet's pattern:** Timeout handling. Cabinet uses PTY kill after `job.timeout` seconds; Sunder uses `release_stale_trigger_claims()` after 15 minutes of inactivity.

### 5.6 Post-Job Actions → Agent Tools

**Cabinet:** Declarative `on_complete` / `on_failure` YAML lists with predefined action types (`git_commit`, `update_page`, `notify`).  
**Sunder:** No `on_complete` list — the agent itself decides what tools to call after completing its task.

**Why:** Sunder's agent has full tool access (CRM, files, memory, web, browser). It doesn't need a fixed action vocabulary — it can accomplish any post-run action via its tools. Cabinet needed `on_complete` because the PTY session exits; in Sunder, the agent can act before ending its run.

**This is intentionally simpler. No action vocabulary to maintain.**

### 5.7 Multi-Tenant Isolation

**Cabinet:** Single tenant, no RLS.  
**Sunder:** `client_id` on every row, RLS on `agent_triggers`, `client_id` injected into tool closures.

### 5.8 Retry Logic

**Cabinet:** No retry — each cron tick fires independently.  
**Sunder:** Retry counter + `failed_permanent` auto-disable after 2 dispatch failures.

**Why:** Sunder runs in a distributed environment where transient dispatch failures are possible (function cold starts, network blips). Cabinet's local daemon dispatch is effectively always available. The retry policy is strictly more robust.

### 5.9 RSS and Webhook Trigger Types

**Cabinet:** No RSS, no webhook triggers.  
**Sunder:** `rss` and `webhook` types are first-class.

**Why:** Sunder's use case (advisory sales autopilot) requires event-driven triggers — inbound webhook from CRM, RSS for news monitoring. Cabinet is a general desktop OS assistant that doesn't need these.

### 5.10 Quiet Hours / Pulse

**Cabinet:** No equivalent (heartbeat runs unconditionally; manual budget cap).  
**Sunder:** `pulse` trigger type with autopilot quiet hours from `autopilot_config` table.

**Why:** Sunder's autopilot runs in the background and should not disturb users at night. Quiet hours are a user-facing safety feature.

---

## 6. Where We Have Accidental Drift (Worth Closing)

These are gaps where Sunder diverges from Cabinet **without a good reason**, and should be considered for fixing.

### 6.1 No Job Library / Templates

**Cabinet:** 30+ pre-built job templates by department (leadership, product, marketing, sales, engineering). One click to instantiate.  
**Sunder:** No equivalent. Triggers are created blank via the agent's `setup_trigger` tool.

**Gap:** A template library would dramatically reduce time-to-first-automation for new users. This is a product feature gap, not an infrastructure constraint.

**Recommendation:** Add a `trigger_templates` concept — either a static JSON/TS map, or a library page in the UI. Priority: medium.

### 6.2 Cron Display Coverage

**Cabinet:** `cronToHuman()` has a thorough preset map + pattern fallback for non-standard expressions.  
**Sunder:** `cron-display.ts` uses `cronstrue` library. Library coverage is comprehensive, but custom short labels (`cronToShortLabel`) may be less rich.

**Recommendation:** Verify `cron-display.ts` handles the full preset range Cabinet supports. No code change needed if `cronstrue` covers it — just confirm.

### 6.3 Schedule Picker UI

**Cabinet:** `SchedulePicker` component shows preset buttons (5m, 15m, 30m, 1h, 4h, Daily 9am, Weekdays, Weekly), raw cron editor, and **next 3 run times preview**.  
**Sunder:** `automation-schedule-sidebar.tsx` has preset presets and raw cron input. Verify next-runs preview is present.

**Recommendation:** Make sure the schedule sidebar surfaces the next N scheduled fire times. Users should see exactly when the automation will run before saving.

### 6.4 Scanner Does Not Reload on Trigger Change

**Cabinet:** File watcher detects job YAML changes → daemon immediately reloads (`200ms debounce`).  
**Sunder:** Scanner runs every minute regardless of trigger changes. A newly created trigger with `next_fire_at = now()` will not fire until the next scanner tick (up to 60 seconds).

**Recommendation:** On trigger creation/update that sets `next_fire_at` to a past-or-now time, immediately call the scanner (or fire the trigger directly). This is a minor UX issue — the first fire will be delayed by up to 60 seconds. Document this explicitly; if acceptable, no fix needed.

### 6.5 No Heartbeat-Style Context Accumulation

**Cabinet:** Heartbeat runs include rich context: agent memory files, inbox messages from other agents, goal progress, focus areas. Output is parsed for structured `memory` blocks (`CONTEXT_UPDATE`, `DECISION`, `LEARNING`).  
**Sunder `pulse`:** Runs the agent with `AUTOPILOT_INSTRUCTION_PROMPT` and no structured output parsing.

**Gap:** Cabinet's heartbeat is far more context-aware and produces richer per-run memory updates. Sunder's pulse is a simpler "run the agent on a schedule."

**Recommendation:** This is a capability gap to close over time as the pulse system matures. For now, document it as a known limitation. The agent does write memory files via `storage_write` tool, but there is no structured output parsing hook.

---

## 7. Files-to-Touch Quick Reference

When working on the cron/trigger system in Sunder:

| Task | Files |
|---|---|
| Add a new trigger type | `schemas.ts`, `scanner.ts`, `executor.ts`, DB migration |
| Change scan interval | `src/trigger/scan-triggers.ts` |
| Change stale claim timeout | `scanner.ts` (STALE_CLAIM_MINUTES), DB RPC migration |
| Change retry policy | `scanner.ts` (MAX_USER_CREATED_RETRIES, MAX_PULSE_RETRIES) |
| Add cron display format | `cron-display.ts`, `cron-utils.ts` |
| Add schedule picker preset | `cron-builder.ts`, `automation-schedule-sidebar.tsx` |
| Add job library/templates | New file (e.g., `trigger-library.ts`), new API route, new UI component |
| Webhook ingress changes | `webhook-auth.ts`, `webhook-claim.ts`, `app/api/trigger/webhook/[triggerId]/route.ts` |
| RSS feed behavior | `rss.ts`, `rss-schedule.ts`, `executor.ts` |
| Manual trigger run | `app/api/automations/[triggerId]/run/route.ts`, `spawn-trigger-run.ts` |
| Agent-created triggers | `setup-trigger.ts`, `manage-active-triggers.ts` |
| Quiet hours for pulse | `scanner.ts` (pulse dispatch path), `autopilot_config` table |

---

## 8. Summary Judgment

Cabinet and Sunder are **architecturally aligned** on the core scheduler concepts:
- Cron stored as raw 5-field expressions
- Separation of config and run history
- Idempotent scan/dispatch cycle
- Enable/disable flag
- Validate on write
- Human-readable display
- Manual run endpoint

Sunder's divergences are **almost entirely justified** by the move from a local daemon to multi-tenant serverless infrastructure:
- DB-level atomic claim lock (required for distributed safety)
- Postgres over YAML files (required for multi-tenancy)
- Trigger.dev tick over node-cron (required for serverless)
- Managed Agents sessions over PTY (required by Sunder's execution model)

**Accidental drift to close, in priority order:**
1. **Schedule picker**: Confirm next-runs preview is present in `automation-schedule-sidebar.tsx`
2. **Job template library**: Build a trigger template gallery (30+ templates like Cabinet's is a strong benchmark)
3. **Heartbeat context accumulation**: Document pulse limitations; roadmap richer context injection for pulse runs
4. **First-fire latency**: Document the 60-second delay on trigger creation; evaluate if an immediate dispatch is worth adding
