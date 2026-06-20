# Dorabot Cron / Automations Reference Analysis

> Reference repo: `/Users/sethlim/Documents/dorabot` (local clone)
>
> Focus: cron, scheduling, automations, triggers, and autonomous pulse patterns.
>
> Generated: 2026-03-07

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Reference File Map](#2-reference-file-map)
3. [Pattern Catalogue](#3-pattern-catalogue)
4. [Sunder vs Dorabot: Where We Align](#4-sunder-vs-dorabot-where-we-align)
5. [Sunder vs Dorabot: Where We Drift](#5-sunder-vs-dorabot-where-we-drift)
6. [Drift Justification Matrix](#6-drift-justification-matrix)
7. [Code to Copy / Reference per Task Area](#7-code-to-copy--reference-per-task-area)
8. [Appendix: Dorabot Key Types](#appendix-dorabot-key-types)

---

## 1. Architecture Overview

### Dorabot (Desktop app, local-first)

```
User (Desktop UI / Chat / WhatsApp / Telegram)
    │
    ▼
Gateway RPC (WebSocket) ←── Desktop Electron frontend
    │
    ▼
SchedulerRunner (in-memory, setInterval every 30s)
    │  — reads/writes calendar_items (SQLite, JSON blobs)
    │  — computes nextRunAt via RRule library + Luxon for timezone
    │
    ├─► onItemStart → broadcast pulse:started / macOS notification
    │
    ├─► runItem() → handleAgentRun() → Claude agent
    │       │  uses calendarTools (schedule/list_schedule/update_schedule/cancel_schedule)
    │       └─► result
    │
    └─► onItemRun → broadcast calendar.result / pulse:completed
                 → useGateway hook updates calendarRuns[]
                 → Automations.tsx refreshes pulse status
```

### Sunder (SaaS, Supabase + Vercel)

```
User (Next.js Web UI / Chat)
    │
    ▼
Vercel Cron (every 1m) → GET /api/cron/scan
    │  — claims due triggers (Postgres UPDATE ... RETURNING)
    │  — releases stale claims
    │
    ├─► POST /api/trigger/run (15-min max) → executeTrigger()
    │       │  — pulse → runAutopilot()
    │       │  — rss → collectNewRssItems() → runAgent() if new items
    │       │  — schedule/webhook → write <trigger-event> → runAgent()
    │       └─► release claim with status + next_fire_at
    │
    └─► POST /api/trigger/webhook/{triggerId} → claimWebhookTrigger() → executeTrigger() via after()

Agent (in any run) uses 3 tools:
  - search_triggers (catalog search)
  - setup_trigger (create schedule/webhook/rss)
  - manage_active_triggers (list/view/edit/delete/simulate)
```

---

## 2. Reference File Map

### Dorabot: Files to Reference

| File | Role | Lines |
|------|------|-------|
| `src/calendar/scheduler.ts` | **Core scheduler engine** — CalendarItem type, RRULE computation, tick loop, ICS export, legacy migration | ~640 |
| `src/tools/calendar.ts` | **4 agent tools** — schedule, list_schedule, update_schedule, cancel_schedule | ~148 |
| `src/autonomous.ts` | **Pulse system** — AUTONOMOUS_SCHEDULE_ID, pulse intervals → RRULE, pulse prompt, buildAutonomousCalendarItem | ~77 |
| `src/gateway/server.ts` | **RPC handlers** — calendar.list/add/remove/toggle/run/update/export, pulse.status/setInterval, config.set autonomy | ~1600 (scheduler relevant: lines ~1484-1590) |
| `src/gateway/types.ts` | **Gateway types** — RpcMethod union, CalendarRun event type | — |
| `src/config.ts` | **Config types** — CronConfig, CalendarConfig, AutonomyMode | — |
| `desktop/src/components/Automations.tsx` | **Automations UI** — Pulse card + add form + item list with collapsible cards | ~477 |
| `desktop/src/hooks/useGateway.ts` | **Client state** — CalendarRun type, calendarRuns array, markCalendarRunsSeen | — |
| `desktop/src/components/tool-ui/CronTool.tsx` | **Tool display** in chat history | — |
| `desktop/src/components/tool-stream/CronStream.tsx` | **Streaming tool display** with animated clock | — |
| `desktop/src/components/approval-ui/CronApproval.tsx` | **Approval UI** for scheduling actions | — |
| `src/system-prompt.ts` | **System prompt** — references schedule tool, injects last pulse timestamp | — |
| `scripts/test-scheduler-run-item.ts` | **Integration test** — temp DB, mock runItem, runItemNow assertion | — |

### Sunder: Our Implementation Files

| File | Role | Dorabot Counterpart |
|------|------|---------------------|
| `src/lib/triggers/schemas.ts` | Zod schemas, types | Part of `scheduler.ts` CalendarItem type |
| `src/lib/triggers/cron-utils.ts` | Cron validation, next-fire-at computation | `scheduler.ts` computeNextRun + RRule |
| `src/lib/triggers/scanner.ts` | Scanner loop (claim, dispatch, error handling) | `scheduler.ts` tick() + gateway scheduler init |
| `src/lib/triggers/executor.ts` | Execution routing per trigger type | `scheduler.ts` executeItem + `gateway/server.ts` runItem callback |
| `src/lib/triggers/trigger-event.ts` | `<trigger-event>` XML message builder | No direct counterpart — dorabot uses message field directly |
| `src/lib/triggers/webhook-auth.ts` | HMAC signature verification | No counterpart (dorabot has no webhooks) |
| `src/lib/triggers/webhook-claim.ts` | Atomic webhook claim | No counterpart |
| `src/lib/triggers/rss.ts` | RSS feed parsing + dedup | No counterpart (dorabot has no RSS) |
| `src/lib/triggers/rss-schedule.ts` | RSS interval → cron mapping | No counterpart |
| `app/api/cron/scan/route.ts` | Vercel cron entry point | `gateway/server.ts` scheduler startup |
| `app/api/trigger/run/route.ts` | Internal execution route | `scheduler.ts` runItemNow |
| `app/api/trigger/webhook/[triggerId]/route.ts` | Public webhook ingress | No counterpart |
| `src/lib/runner/tools/triggers/search-triggers.ts` | Catalog search tool | No counterpart (dorabot has 4 flat tools) |
| `src/lib/runner/tools/triggers/setup-trigger.ts` | Create trigger tool | `tools/calendar.ts` scheduleTool |
| `src/lib/runner/tools/triggers/manage-triggers.ts` | List/view/edit/delete/simulate | `tools/calendar.ts` list/update/cancel tools |
| `src/components/automations/automations-table.tsx` | Automations table UI | `desktop/src/components/Automations.tsx` |
| `src/hooks/use-triggers.ts` | TanStack Query hook + realtime | `desktop/src/hooks/useGateway.ts` calendarRuns |
| `app/(dashboard)/automations/page.tsx` | Automations page | `desktop/src/components/Automations.tsx` (container) |

---

## 3. Pattern Catalogue

### Pattern 1: CalendarItem / iCal Data Model

**Dorabot uses iCal/RFC 5545 as the scheduling data model.** Items have:
- `dtstart` (ISO 8601 start time)
- `rrule` (RFC 5545 RRULE string, e.g. `FREQ=DAILY;BYHOUR=9;BYMINUTE=0`)
- `timezone` (IANA timezone — wall-clock time interpretation)
- `type` (event / todo / reminder)
- `deleteAfterRun` (one-shot items)
- `message` (prompt to run)

The agent writes RRULE strings directly. This is a rich, expressive scheduling format.

### Pattern 2: In-Memory Tick-Based Scheduler

Dorabot runs a `setInterval(tick, 30000)` loop. On each tick:
1. Check all enabled items whose `nextRunAt <= now`
2. Guard concurrent runs via `running: Set<string>`
3. Execute item → update `lastRunAt`, recompute `nextRunAt`
4. One-shot items (no rrule) get disabled after firing
5. `deleteAfterRun` items get removed from DB

### Pattern 3: Pulse as a Special CalendarItem

The autonomous pulse is a CalendarItem with a fixed ID (`autonomy-pulse`). It:
- Is filtered OUT of the user-visible automations list
- Has its own dedicated UI card with toggle, interval selector, run now
- Uses RRULE intervals: 15m / 30m / 1h / 2h
- Has a dedicated prompt (`buildAutonomousPrompt`) with strict priority ordering

### Pattern 4: Agent-Created Automations (4 Flat Tools)

Dorabot exposes 4 MCP tools:
- `schedule` — create (Zod-validated input)
- `list_schedule` — list all items
- `update_schedule` — partial update by ID
- `cancel_schedule` — delete by ID

Each tool operates on the in-memory scheduler singleton via `setScheduler()`. No catalog/search abstraction — the agent just uses the tools directly.

### Pattern 5: Gateway RPC for UI ↔ Backend

All UI operations go through WebSocket RPC: `cron.list`, `cron.add`, `cron.toggle`, `cron.run`, `cron.remove`. The gateway handles backward compat (`cron.*` → `calendar.*` aliasing). Events like `calendar.result` and `pulse:completed` are broadcast to connected clients.

### Pattern 6: RRULE + Luxon for Timezone-Aware Scheduling

`computeNextRun()` uses:
- `rrule` library for recurrence rule expansion
- `luxon` for timezone-aware wall-clock time interpretation
- A "fake UTC dtstart" trick for daily+ frequencies with BYHOUR/BYMINUTE
- Direct interval math for sub-daily frequencies (MINUTELY, HOURLY)

### Pattern 7: Automations UI — Pulse Card + Collapsible Items

The desktop UI has:
- A **Pulse card** at top with toggle switch, interval selector, run-now button, last/next run times, and a "connect a channel" warning
- A **New automation form** with summary, message, type, dtstart, RRULE fields
- **Collapsible item cards** per automation showing schedule, status, message, and enable/disable/run-now/delete actions

---

## 4. Sunder vs Dorabot: Where We Align

| Area | Alignment |
|------|-----------|
| **Pulse as a special trigger type** | Both filter pulse out of user-facing automations list; both have a dedicated pulse concept |
| **Agent creates automations** | Both let the agent create scheduled work via tools |
| **Concurrent-run guard** | Dorabot: in-memory `Set<string>`. Sunder: DB-level `current_run_id IS NULL` + `UPDATE ... RETURNING`. Same concept, different implementation |
| **Timezone handling** | Both normalize to a default timezone and compute next fire time in wall-clock time |
| **Enable/disable toggle** | Both support toggling automations on/off in UI |
| **Automations page** | Both show a list of user-created automations with status, type, schedule info, and actions |
| **System prompt integration** | Both inject automation context into the system prompt/reminder |

---

## 5. Sunder vs Dorabot: Where We Drift

### Drift 1: Scheduling Format — Cron vs RRULE

| | Dorabot | Sunder |
|--|---------|--------|
| **Format** | RFC 5545 RRULE strings | 5-field cron expressions |
| **Library** | `rrule` + `luxon` | `cron-parser` |
| **Expressiveness** | Very high (BYDAY, BYMONTHDAY, BYHOUR, BYMINUTE, INTERVAL, COUNT, UNTIL) | Standard cron (minute, hour, day-of-month, month, day-of-week) |
| **One-shot items** | dtstart without rrule → fires once, then disables or deletes | Not supported natively; would need a separate mechanism |
| **Timezone** | `timezone` field on CalendarItem, wall-clock interpretation via Luxon | Timezone stored in `payload.timezone`, normalized to `Asia/Singapore` default |

### Drift 2: Storage — SQLite JSON Blobs vs Postgres Table

| | Dorabot | Sunder |
|--|---------|--------|
| **Storage** | SQLite with `id TEXT, data TEXT` (JSON blob) | Supabase Postgres with typed columns (`agent_triggers` table) |
| **Querying** | Load all into memory, iterate | SQL queries with RLS, RPC functions |
| **Concurrency** | In-memory `Set<string>` | DB-level atomic claim via `UPDATE ... WHERE current_run_id IS NULL RETURNING *` |

### Drift 3: Execution Model — In-Process vs Two-Hop Dispatch

| | Dorabot | Sunder |
|--|---------|--------|
| **Scanner** | `setInterval(tick, 30s)` in same process | Vercel Cron → `GET /api/cron/scan` every 1 minute |
| **Execution** | Direct function call in same process | POST to `/api/trigger/run` (separate Vercel Function, 15-min timeout) |
| **Reason for drift** | Desktop app = single long-lived process | Serverless = need to separate fast scanner from long-running agent work |

### Drift 4: Trigger Types — 1 vs 4

| | Dorabot | Sunder |
|--|---------|--------|
| **Types** | CalendarItem (event / todo / reminder) — all are scheduled items | 4 types: schedule, webhook, rss, pulse |
| **Webhooks** | Not supported | Full inbound webhook with HMAC auth |
| **RSS** | Not supported | RSS/Atom feed polling with seen-state deduplication |
| **Reason** | Desktop agent — no inbound HTTP | SaaS — needs external event ingestion |

### Drift 5: Agent Tool Design — 4 Flat Tools vs 3 Structured Tools

| | Dorabot | Sunder |
|--|---------|--------|
| **Tools** | `schedule`, `list_schedule`, `update_schedule`, `cancel_schedule` | `search_triggers`, `setup_trigger`, `manage_active_triggers` |
| **Pattern** | 4 simple, single-purpose tools | 3 tools with `search_triggers` as catalog lookup and `manage_active_triggers` as multi-action tool |
| **Mutation gating** | None — agent always has full access | `allowMutations` flag: when running inside a cron trigger, agent can only list/view, not create new triggers |
| **Simulate** | `runItemNow()` via UI only | Agent can `simulate` a trigger via tool |

### Drift 6: Retry & Error Handling

| | Dorabot | Sunder |
|--|---------|--------|
| **Retry** | None — if it fails, `onItemRun` receives `status: 'failed'` | Retry count tracked in DB. User triggers: 2 retries before `failed_permanent` (auto-disable). Pulse: 0 retries |
| **Stale claims** | No concept (single process) | `release_stale_trigger_claims(15 min)` reaps orphaned claims |
| **Invalid config** | Would fail silently on bad RRULE | Explicit `invalid_cron` / `invalid_rss_config` statuses with auto-disable |

### Drift 7: UI — Desktop Panel vs Web Table

| | Dorabot | Sunder |
|--|---------|--------|
| **Layout** | Card-based panel with collapsible items | HTML table with columns (name, type, config, status, last run, next run, actions) |
| **Add form** | Inline form in panel (summary, message, type, dtstart, rrule) | Agent-created only — no user-facing creation form |
| **Pulse card** | Dedicated card at top of automations panel | Pulse filtered out, not shown |
| **Delete** | AlertDialog confirmation | Not implemented yet |
| **Run now** | Button per item | Not implemented yet (agent can simulate) |
| **Realtime** | WebSocket RPC + event broadcasts | Supabase Realtime subscription via `useRealtimeTable` |

---

## 6. Drift Justification Matrix

| Drift | Justified? | Reason |
|-------|-----------|--------|
| **Cron vs RRULE** | **Yes** | Cron is simpler, sufficient for v1, standard for Vercel Cron integration. RRULE adds complexity (rrule lib + luxon) for features we don't need yet (BYDAY, COUNT, UNTIL, one-shot timers). Can migrate to RRULE later if needed. |
| **Postgres vs SQLite** | **Yes** | Multi-tenant SaaS requires persistent, queryable, RLS-protected storage. SQLite JSON blobs are fine for single-user desktop but don't scale. |
| **Two-hop dispatch** | **Yes** | Vercel serverless mandates it. Cron route must be fast (45s limit); agent runs need up to 15 min. Same logical flow, different physical boundary. |
| **4 trigger types** | **Yes** | Webhooks and RSS are genuine product requirements for a SaaS automation platform. Dorabot doesn't need them because it runs locally. |
| **3 structured tools vs 4 flat** | **Partial** | The catalog search pattern adds discoverability. However, 4 flat tools (dorabot pattern) is simpler and arguably better for LLM tool use. Consider simplifying to flat tools if agent struggles with the structured approach. |
| **Retry + stale claims** | **Yes** | Essential for serverless reliability. Dorabot's in-process model doesn't need it. |
| **Table UI vs Card UI** | **Neutral** | Both are valid. Dorabot's card UI is richer (collapsible, inline messages, run now, delete). We could adopt some dorabot patterns (run now, delete, pulse card) for future iterations. |

---

## 7. Code to Copy / Reference per Task Area

### A. If We Add "Run Now" to Automations UI

**Copy from:** `desktop/src/components/Automations.tsx` lines 182-188 (runItemNow pattern), lines 298-306 (run-now button in pulse card), lines 442-444 (run-now button per item)

**Sunder implementation:** Add a `runNow` mutation to `use-triggers.ts` that calls a new API route `POST /api/trigger/run-now` which claims + executes the trigger immediately.

### B. If We Add User-Created Automations via UI (Add Form)

**Copy from:** `desktop/src/components/Automations.tsx` lines 42-49 (newItem state), lines 146-171 (addItem handler), lines 325-398 (add form JSX)

**Sunder adaptation:** Replace RPC calls with Supabase insert. Replace RRULE field with cron expression field. Add webhook/RSS type options.

### C. If We Add a Pulse Card to Automations Page

**Copy from:** `desktop/src/components/Automations.tsx` lines 263-323 (pulse card)

**Sunder adaptation:** Query the `agent_triggers` table for `trigger_type = 'pulse'` and `client_id` match. Pulse toggle would create/delete the pulse trigger row. Interval changes would update `cron_expression`.

### D. If We Switch to RRULE-Based Scheduling

**Copy:** `src/calendar/scheduler.ts` lines 80-253 (computeNextRun family), lines 216-254 (parseRRuleString), lines 396-434 (cron-to-rrule migration helpers)

**Dependencies to add:** `rrule`, `luxon`

**Sunder changes:** Replace `cron-parser` usage in `cron-utils.ts` with RRULE computation. Add `rrule` column to `agent_triggers` (or store in payload). Update `setup_trigger` tool to accept RRULE strings.

### E. If We Add ICS Export

**Copy:** `src/calendar/scheduler.ts` lines 262-330 (generateIcsString, escapeIcal, toIcalDate, formatDuration)

### F. Agent Tool Patterns (Current Reference)

**Dorabot tools to reference:** `src/tools/calendar.ts`
- `scheduleTool` (lines 15-63) — Zod schema, single-purpose create
- `listScheduleTool` (lines 65-95) — simple list with formatted output
- `updateScheduleTool` (lines 97-127) — partial update with filtered undefined values
- `cancelScheduleTool` (lines 129-146) — delete by ID

**Key difference from Sunder:** Dorabot tools are flat (4 single-purpose tools). Sunder uses a structured multi-action pattern for `manage_active_triggers`. If agent usability suffers, consider switching to dorabot's flat pattern.

### G. Autonomous Pulse Prompt

**Copy from:** `src/autonomous.ts` lines 25-61 (buildAutonomousPrompt)

This is a highly-tuned pulse prompt with strict priority ordering. Useful reference when refining Sunder's autopilot prompt. Key elements:
1. Bootstrap: read memory, check goals/tasks
2. Priority cascade: advance tasks → monitor → follow up → handle blockers → research → onboard → engage → propose → momentum
3. After acting: log to memory, persist research, update stable facts, message owner
4. Boundaries: never declare "nothing to act on" without verification

---

## Appendix: Dorabot Key Types

### CalendarItem (scheduler.ts:18-49)

```typescript
type CalendarItemType = 'event' | 'todo' | 'reminder';

type CalendarItem = {
  id: string;
  type: CalendarItemType;
  summary: string;
  description?: string;
  dtstart: string;              // ISO 8601
  dtend?: string;
  due?: string;
  rrule?: string;               // RFC 5545 RRULE
  timezone?: string;            // IANA timezone
  valarm?: number;              // seconds offset
  message: string;              // agent prompt
  session?: 'main' | 'isolated';
  model?: string;
  thinking?: 'low' | 'medium' | 'high';
  channel?: string;
  to?: string;
  deliver?: boolean;
  enabled?: boolean;
  deleteAfterRun?: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
};
```

### SchedulerRunner (scheduler.ts:440-448)

```typescript
type SchedulerRunner = {
  stop: () => void;
  addItem: (item: Omit<CalendarItem, 'id' | 'createdAt'> & { id?: string }) => CalendarItem;
  updateItem: (id: string, updates: Partial<Omit<CalendarItem, 'id' | 'createdAt'>>) => CalendarItem | null;
  removeItem: (id: string) => boolean;
  listItems: () => CalendarItem[];
  runItemNow: (id: string) => Promise<{ status: string; result?: string }>;
  exportIcs: () => string;
};
```

### Pulse Constants (autonomous.ts)

```typescript
const AUTONOMOUS_SCHEDULE_ID = 'autonomy-pulse';
const INTERVAL_TO_RRULE = {
  '15m': 'FREQ=MINUTELY;INTERVAL=15',
  '30m': 'FREQ=MINUTELY;INTERVAL=30',
  '1h':  'FREQ=HOURLY;INTERVAL=1',
  '2h':  'FREQ=HOURLY;INTERVAL=2',
};
const DEFAULT_PULSE_INTERVAL = '30m';
```

### Agent Tool Schemas (tools/calendar.ts)

```typescript
// schedule tool input
{
  summary: z.string(),
  message: z.string(),
  dtstart: z.string(),
  rrule: z.string().optional(),
  type: z.enum(['event', 'todo', 'reminder']).optional(),
  description: z.string().optional(),
  dtend: z.string().optional(),
  due: z.string().optional(),
  timezone: z.string().optional(),
  valarm: z.number().optional(),
  deleteAfterRun: z.boolean().optional(),
}
```
