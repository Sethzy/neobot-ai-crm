# Automations UX Overhaul

**Date:** 2026-04-12
**Status:** Design
**Context:** The automations page is a bare table with enable/disable toggles. Creation, editing, deletion, and simulation all require going through chat. Trigger runs dump output into a single shared thread, polluting context and making it expensive (agent reads all past run output as fluff). We want a polished, self-contained automations experience modeled after Micro.so — dedicated detail pages, per-run threads, editable instructions, and schedule config in the UI.

**Reference:** Micro.so automations UI (app.micro.so/automations). Screenshots captured 2026-04-12.

---

## Design Decisions (Agreed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Thread model | New thread per run | Keeps each run's context clean. Avoids expensive context accumulation. Lets users chat with a specific run's output. |
| Run threads in sidebar | Mixed with regular chats (Micro style) | Simple, matches reference product. No sidebar grouping logic. |
| Creation flow | Chat-only (no UI creation) | Agent handles SOP authoring well. Bigger pain is visibility/management. |
| Automation detail page | Clone Micro — Instructions tab + Runs tab + schedule sidebar | Full management without going through chat. |
| Instructions editor | Novel (Tiptap-based, Next.js native) | WYSIWYG markdown, maps to SOP files in Supabase Storage. |
| Model selector | Skip — static label ("Sonnet 4.6") | Single managed agent, model pinned to agent definition. |
| Email notifications | Show toggle, greyed out "Coming soon" | Resend integration is separate scope. Telegram delivery continues as-is. |

---

## Architecture Change: New Thread Per Run

### Current Model (Single Thread)

```
setup_trigger (chat) → agent_triggers.thread_id = "thread-abc"

Run 1 fires → output → INSERT message into thread-abc
Run 2 fires → output → INSERT message into thread-abc
Run 3 fires → output → INSERT message into thread-abc
...
All output piles up in one thread.
User opens thread-abc → sees chat + run1 + run2 + run3 mixed together.
Agent in chat session can't read trigger output (different Anthropic session).
```

### New Model (Thread Per Run)

```
setup_trigger (chat) → agent_triggers.thread_id = "thread-abc" (origin thread)

Run 1 fires → CREATE thread-run-1 → output → INSERT message into thread-run-1
Run 2 fires → CREATE thread-run-2 → output → INSERT message into thread-run-2
Run 3 fires → CREATE thread-run-3 → output → INSERT message into thread-run-3

Each run thread appears in chat sidebar.
User clicks into thread-run-2 → sees just that run's output.
User can reply → new chat session picks up run output as prior context.
```

### Data Model Changes

**`conversation_threads` — new columns:**

```sql
ALTER TABLE conversation_threads
  ADD COLUMN source_type TEXT DEFAULT 'chat',     -- 'chat' | 'automation_run'
  ADD COLUMN source_trigger_id UUID REFERENCES agent_triggers(id),
  ADD COLUMN source_run_id UUID REFERENCES runs(run_id);
```

- `source_type = 'chat'` — user-initiated thread (default, backward compat)
- `source_type = 'automation_run'` — thread created by a trigger run
- `source_trigger_id` — links run thread back to the automation
- `source_run_id` — links to the specific run row

**`agent_triggers.thread_id`** — becomes the **origin thread** (where trigger was created via chat). Not where output goes. Nullable for future UI-created triggers that have no origin thread.

**`runs` table** — add thread linkage:

```sql
ALTER TABLE runs ADD COLUMN run_thread_id UUID REFERENCES conversation_threads(id);
```

### spawnTriggerRun Changes

```
spawnTriggerRun(input):
  1. Create new conversation_threads row:
     - title: "{triggerName} — {timestamp}"
     - source_type: "automation_run"
     - source_trigger_id: input.triggerId
     - source_run_id: runId
  2. Create disposable Anthropic session (unchanged)
  3. Insert runs row with run_thread_id = new thread ID (new)
  4. Send kickoff, queue Trigger.dev task (unchanged)
  5. finalizeTriggerRun persists output to the NEW thread, not origin thread
```

### Chat Sidebar Impact

Run threads show up in the sidebar mixed with regular chats. Thread title format: `"Morning Briefing — Apr 12, 8:00 AM"`. The sidebar query already pulls from `conversation_threads` so these appear automatically.

Optional: show a small badge/icon to distinguish automation runs from user chats (e.g., a lightning bolt icon next to the thread title).

---

## UI: Automations List Page

### Current State

Bare data table with 7 columns (Name, Type, Config, Status, Last run, Next run, Actions). "New automation" button links to `/chat`. Enable/disable toggle + "View thread" link.

### Target State (Clone Micro List)

Reference: Micro.so automations list — active/inactive sections, emoji + name, schedule description, countdown, toggle.

```
┌─────────────────────────────────────────────────────────────┐
│  Automations                                                │
│  ┌──────────────┐  ┌──────┐                    [Templates] [New] │
│  │ Automations   │  │ Runs │                                │
│  └──────────────┘  └──────┘                                │
│                                                             │
│  Active                                                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ * Morning Briefing    Weekdays at 8:00 AM    in 18hr [=]││
│  │ @ Pipeline Health     Mondays at 9:00 AM     in 19hr [=]││
│  │ ! Follow-up Finder    Weekdays at 10:00 AM   in 20hr [=]││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Inactive                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ > New automation      Daily at 9:00 AM              [ ] ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Changes from current table:**
- Replace data table with card-style rows (emoji + name + schedule + countdown + toggle)
- Group into Active / Inactive sections
- Two top-level tabs: **Automations** (list of triggers) and **Runs** (global run history across all automations)
- Schedule shown as human-readable text ("Weekdays at 8:00 AM") not raw cron
- Countdown to next run ("in 18hr") instead of raw timestamp
- Each row clicks through to automation detail page
- Remove Type, Config, Status, Last run columns — detail page handles those

### Runs Tab (Global)

Flat list of all recent runs across all automations. Each row shows:
- Automation name + run title
- Status (completed/failed)
- Timestamp
- Click to open run thread

---

## UI: Automation Detail Page

### Route

```
/automations/[triggerId]
```

New dynamic route. Loads trigger row + SOP file content + associated runs.

### Layout (Clone Micro Detail)

Reference: Micro.so automation detail — header, Instructions/Runs tabs, schedule sidebar.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Automations / Morning Briefing                                     │
│                                                                     │
│  * Morning Briefing                                                 │
│  ~ Weekdays at 8:00 AM  |  Next run in about 17 hours  |  Active   │
│                                                                     │
│  ┌──────────────┐ ┌──────────┐              [Toggle] [> Run]        │
│  │ Instructions │ │ Runs  3  │                                      │
│  └──────────────┘ └──────────┘                                      │
│                                                    ┌───────────────┐│
│  ┌────────────────────────────────────────────┐    │  Schedule     ││
│  │                                            │    │               ││
│  │  Automation Rules (applies to ALL...)      │    │  Recurrence   ││
│  │                                            │    │  [Weekly  v]  ││
│  │  - Be concise. Use the minimum words...   │    │               ││
│  │  - Do not narrate what you are doing...   │    │  Days         ││
│  │  - Match output length to information...  │    │  [M][T][W]... ││
│  │                                            │    │               ││
│  │  Your Task:                                │    │  Time         ││
│  │                                            │    │  [08:00 AM]   ││
│  │  1. Use event-search to get today's...    │    │               ││
│  │  2. Use get-todays-emails to get...       │    │  Timezone      ││
│  │  3. Use get-tasks (filter: "today")...    │    │  [Asia/SG  v] ││
│  │                                            │    │               ││
│  │  Generate Today's Briefing:                │    ├───────────────┤│
│  │                                            │    │  Model        ││
│  │  Today's Schedule                          │    │  Sonnet 4.6   ││
│  │  List meetings chronologically...          │    │               ││
│  │                                            │    ├───────────────┤│
│  │  [Novel WYSIWYG editor]                    │    │  Notifications││
│  │                                            │    │  Email  [soon]││
│  └────────────────────────────────────────────┘    └───────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Header

- Breadcrumb: `Automations / {name}`
- Emoji + Name (editable inline — updates `agent_triggers.name`)
- Schedule summary: human-readable cron ("Weekdays at 8:00 AM")
- Next run countdown: relative time ("Next run in about 17 hours")
- Status badge: "Active" / "Disabled"
- Enable/disable toggle (existing `useSetTriggerEnabled`)
- "Run" button — manual trigger (calls existing `manage_active_triggers { action: "simulate" }` flow or a new API route)

### Instructions Tab

**Reads:** SOP markdown file from Supabase Storage via `instruction_path`.

```
agent_triggers.instruction_path = "sops/daily-report.md"
  → Supabase Storage: agent-files/{clientId}/sops/daily-report.md
  → Fetch content, render in Novel editor
```

**Writes:** On save, upload updated markdown back to Supabase Storage at the same path.

**Editor:** Novel (Tiptap-based WYSIWYG markdown editor).
- Renders markdown as rich text
- Supports headings, lists, bold/italic, code blocks
- Output is markdown (compatible with agent's `storage_read`)
- Auto-save or explicit save button

### Runs Tab

List of past runs for this automation. Each run is a row:

```
┌───────────────────────────────────────────────────────────────┐
│  Runs  3                                                      │
│                                                               │
│  Today                                                        │
│  O Morning Briefing With Two Actiona...  @ Generated morning  │
│    briefing with 2 actionable emails, 5 over...    2:03 PM    │
│                                                               │
│  O Morning Briefing With Priority Emails  @ Retrieved morning │
│    briefing showing no meetings, 2 actiona...      2:00 PM    │
│                                                               │
│  Yesterday                                                    │
│  O Morning Briefing — Pipeline Update  @ ...       8:01 AM    │
└───────────────────────────────────────────────────────────────┘
```

**Data source:** Query `runs` table joined with `conversation_threads` where `source_trigger_id = triggerId`, ordered by `created_at DESC`.

**Each row shows:**
- Run thread title (auto-generated by agent or timestamp-based)
- First ~100 chars of assistant output (preview)
- Timestamp
- Status indicator (success/failed)
- Click → navigates to `/chat/{run_thread_id}` where user can read output and reply

### Right Sidebar — Schedule Config

**Recurrence:** Dropdown — Daily, Weekly, Weekdays, Monthly, Custom cron
**Days:** Day-of-week pill buttons (M T W T F S S) — only shown for Weekly
**Time:** Time picker (hour:minute)
**Timezone:** Dropdown (pre-populated from user profile)

**On change:** Recompute `cron_expression` and `next_fire_at`, update `agent_triggers` row. Reset `retry_count` to 0.

**Mapping from UI → cron:**

| Recurrence | Days | Cron |
|------------|------|------|
| Daily | — | `0 8 * * *` |
| Weekdays | — | `0 8 * * 1-5` |
| Weekly | M,W,F | `0 8 * * 1,3,5` |
| Monthly | — | `0 8 1 * *` |
| Custom | — | Raw cron input |

### Right Sidebar — Model

Static label: "Sonnet 4.6 — Balanced performance". Not editable. Future: dropdown to select model tier if we register multiple agents.

### Right Sidebar — Notifications

- **Email results** toggle — greyed out, tooltip: "Coming soon"
- Future: Resend integration, per-automation email delivery

---

## UI: Manual "Run" Button

The detail page header has a "Run" button for manual triggering.

### Implementation

New API route: `POST /api/automations/[triggerId]/run`

```
1. Fetch trigger row
2. Read SOP file content from storage
3. Build trigger event message (same XML format as cron scanner)
4. Create new run thread (source_type: "automation_run")
5. spawnTriggerRun with the new thread
6. Return { runId, threadId } to client
7. Client navigates to run thread or refreshes Runs tab
```

This reuses the existing spawn infrastructure. The only difference from a cron-fired run is that the claim/release cycle is skipped (manual runs don't go through the scanner).

---

## Components Breakdown

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AutomationsList` | `src/components/automations/automations-list.tsx` | Card-style rows grouped by active/inactive. Replaces `AutomationsTable`. |
| `AutomationDetail` | `src/components/automations/automation-detail.tsx` | Full detail page with tabs + sidebar. |
| `AutomationHeader` | `src/components/automations/automation-header.tsx` | Emoji + name + schedule + toggle + run button. |
| `AutomationInstructions` | `src/components/automations/automation-instructions.tsx` | Novel editor for SOP content. |
| `AutomationRuns` | `src/components/automations/automation-runs.tsx` | Run history list with thread links. |
| `AutomationScheduleSidebar` | `src/components/automations/automation-schedule-sidebar.tsx` | Recurrence + days + time + timezone + model + notifications. |

### New Routes

| Route | Purpose |
|-------|---------|
| `app/(dashboard)/automations/page.tsx` | Updated list page (replace table with cards) |
| `app/(dashboard)/automations/[triggerId]/page.tsx` | Automation detail page |
| `app/api/automations/[triggerId]/run/route.ts` | Manual run trigger |
| `app/api/automations/[triggerId]/instructions/route.ts` | Read/write SOP file content |

### New Hooks

| Hook | Purpose |
|------|---------|
| `useTrigger(triggerId)` | Single trigger row with realtime |
| `useTriggerRuns(triggerId)` | Paginated runs for a trigger |
| `useTriggerInstructions(triggerId)` | Fetch/update SOP content from storage |
| `useManualRun(triggerId)` | Mutation to fire manual run |
| `useUpdateTriggerSchedule(triggerId)` | Mutation to update cron/timezone/payload |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/managed-agents/spawn-trigger-run.ts` | Create new thread per run instead of using origin thread |
| `src/lib/managed-agents/finalize-trigger-run.ts` | Persist to run thread, not origin thread |
| `src/lib/triggers/executor.ts` | Pass `triggerId` to spawn, create run thread |
| `src/hooks/use-triggers.ts` | Add `instruction_path` to select; add new hooks |
| `src/components/automations/automations-table.tsx` | Replace with `automations-list.tsx` |

---

## Migration

### Existing Triggers

Existing triggers have output in their origin thread. We don't retroactively split these into per-run threads. After the migration:

- Old run output stays in the origin thread (accessible via "View origin thread" link on detail page)
- New runs create per-run threads
- The Runs tab shows only post-migration runs (those with `run_thread_id` set)

### Database Migration

```sql
-- 1. Add source columns to conversation_threads
ALTER TABLE conversation_threads
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN source_trigger_id UUID REFERENCES agent_triggers(id) ON DELETE SET NULL,
  ADD COLUMN source_run_id UUID;

-- 2. Add run thread linkage to runs
ALTER TABLE runs
  ADD COLUMN run_thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL;

-- 3. Index for efficient runs-by-trigger queries
CREATE INDEX idx_threads_source_trigger ON conversation_threads(source_trigger_id)
  WHERE source_type = 'automation_run';
```

---

## Unresolved Questions

1. **Run thread title generation** — Should the title be timestamp-based ("Morning Briefing — Apr 12, 8:00 AM") or agent-generated (let the agent name its own output like Micro does)?

2. **Run thread cleanup** — Should old run threads be archived/deleted after N days? They'll accumulate in the sidebar. Micro seems to keep them indefinitely.

3. **Sidebar visual distinction** — How to differentiate automation run threads from user chats in the sidebar? Small icon? Different text color? Or just let them blend in like Micro does?

4. **SOP file locking** — If the user edits the SOP in the UI while the agent is reading it during a run, there could be a race. Likely acceptable (last-write-wins) but worth noting.

5. **Manual run from list page** — Should there be a "Run" action on each row in the list view, or only on the detail page?

6. **Templates / marketplace** — Deferred. The `AUTOMATION_TEMPLATES` array in `src/lib/automations/templates.ts` already has 15 templates. Could be surfaced as a "Templates" button on the list page in a follow-up.
