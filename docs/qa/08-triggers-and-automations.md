# QA Surface 8: Triggers & Automations

> **PRs covered:** 18 (cron scanner + triggers table), 20 (trigger tools + user triggers), 20a (template prompt cards), 2026-04-24 Daily Orchestrator cutover
> **Dogfoodable:** Yes (automations page, Daily Orchestrator bootstrap, schedule/webhook/RSS)
> **Time estimate:** 30-40 min manual (some waiting for cron-triggered runs)
> **v2 tools:** `setup_trigger`, `manage_active_triggers`, `search_triggers`, `search_crm`, `list_todo`, `manage_todo`

---

## Prerequisites

- Logged in with CRM data so `Daily Orchestrator` has something to reason about
- Cron scanner running (`/api/cron/scan` — via Vercel cron or manual curl)
- At least one overdue task or stale deal in CRM
- Supabase dashboard open to inspect `agent_triggers`, `conversation_threads`, and `runs`

---

## Dogfood Checklist

- [ ] `/automations` loads without errors
- [ ] `Daily Orchestrator` is visible in the automations list like any other automation
- [ ] `Daily Orchestrator` shows type `Schedule` and default daily cadence
- [ ] Automations detail page opens for `Daily Orchestrator`
- [ ] Enable/disable toggle is visible and works
- [ ] Automations page works on mobile

---

## Manual QA Scenarios

### 8.1 Default bootstrap — `Daily Orchestrator` exists once

1. Sign up or load the dashboard for a fresh client
2. Visit `/automations`
3. **Expected:** A normal automation row named `Daily Orchestrator` is present
4. Open the row detail
5. **Expected:** Schedule is daily at `8:00 AM` local time, enabled by default
6. **Verify in Supabase:** `agent_triggers` contains exactly one row for that client with:
   - `trigger_type = 'schedule'`
   - `name = 'Daily Orchestrator'`
   - `instruction_path = 'state/triggers/daily-orchestrator.md'`
7. **Verify in Supabase:** `clients.daily_orchestrator_seeded_at` is populated

**Notes / failures:**

---

### 8.2 Daily Orchestrator uses the normal schedule path

1. Set `next_fire_at` for `Daily Orchestrator` to `now()` in Supabase
2. Trigger cron scan (`/api/cron/scan`)
3. **Expected:** A new `runs` row is created with `run_type = 'cron'`
4. **Expected:** The run is linked to the trigger, not stored as a special autopilot run type
5. **Expected:** A new run thread is created for that fire, following the normal “new thread per run” model
6. **Verify:** `conversation_threads.source_trigger_id` on the run thread points back to `Daily Orchestrator`

**Notes / failures:**

---

### 8.3 Morning briefing boundaries

1. Seed CRM with:
   - an overdue task
   - an active deal needing attention
   - an email/task scenario that would naturally suggest an external follow-up
2. Fire `Daily Orchestrator`
3. **Expected:** The assistant posts a concise morning brief in the run thread
4. **Expected:** It may do obvious internal work automatically
5. **Expected:** It may prepare external drafts or recommendations
6. **Expected:** It does **not** send external-facing actions unprompted
7. **Expected:** It does **not** create child automations, same-day one-offs, or recurring automations

**Notes / failures:**

---

### 8.4 User can continue in the same run thread

1. Open the run thread created by `Daily Orchestrator`
2. Reply with something like: `ok go do it` or `draft the Sarah follow-up`
3. **Expected:** The assistant continues in that same thread like a normal chat
4. **Expected:** No new automation is created just because the user replied

**Notes / failures:**

---

### 8.5 Delete / disable semantics

1. Disable `Daily Orchestrator`
2. **Expected:** The row moves to the inactive section and no longer fires
3. Re-enable it
4. **Expected:** It returns to active and can fire again
5. Delete `Daily Orchestrator`
6. Refresh the app
7. **Expected:** It stays deleted and is **not** recreated on reload

**Notes / failures:**

---

### 8.6 Concurrency — skip while current run is busy

1. Start a `Daily Orchestrator` run and leave it active
2. Fire cron scan again while that trigger still has an in-flight run
3. **Expected:** No duplicate run starts for the same automation
4. **Expected:** Trigger status reflects the normal busy-skip path (`skipped_thread_busy`), not a special pulse status

**Notes / failures:**

---

### 8.7 Search available trigger types

1. In chat: `What kinds of automations can I set up?`
2. **Expected:** Agent calls `search_triggers`
3. **Expected:** It returns schedule, webhook, and RSS trigger types with descriptions
4. In chat: `Tell me about webhook triggers`
5. **Expected:** Agent explains webhook capabilities accurately

**Notes / failures:**

---

### 8.8 Create a scheduled trigger via chat

1. In a new thread: `Check my overdue tasks every morning at 8am`
2. **Expected:** Agent calls `setup_trigger` with:
   - type `schedule`
   - a morning cron expression
   - instructions about checking overdue tasks
3. **Expected:** Agent confirms trigger creation
4. Check `/automations`
5. **Expected:** New automation is visible with schedule and `next_fire_at`

**Notes / failures:**

---

### 8.9 Create a webhook trigger via chat

1. In chat: `Create a webhook trigger that processes inbound leads`
2. **Expected:** Agent calls `setup_trigger` with type `webhook`
3. **Expected:** Agent returns a webhook URL
4. POST sample JSON to that URL
5. **Expected:** A trigger run fires in the automation's thread with the POST body as context

**Notes / failures:**

---

### 8.10 Create an RSS trigger via chat

1. In chat: `Monitor this RSS feed for new listings and summarize anything relevant`
2. **Expected:** Agent calls `setup_trigger` with type `rss`
3. **Expected:** Trigger appears in `/automations`
4. Seed or wait for a new feed item
5. **Expected:** RSS dedup works and one new run fires per unseen item

**Notes / failures:**

---

## Edge Cases

- [ ] Fresh client with no CRM data still gets exactly one `Daily Orchestrator`
- [ ] No `pulse` rows appear anywhere in `agent_triggers`
- [ ] No `autopilot` run type appears in `runs`
- [ ] `Daily Orchestrator` delete is permanent until the user creates a new automation manually
- [ ] Trigger detail / run history surfaces do not mention quiet hours
- [ ] Background automation failures surface as standard trigger statuses only
- [ ] Webhook trigger processes payload and creates a run thread correctly
- [ ] RSS trigger deduplicates repeated feed entries

---

## Pass / Fail Criteria

- **Pass:** `Daily Orchestrator` is seeded once, visible in Automations, runs as a normal `schedule` trigger, creates a new run thread per fire, allows same-thread continuation after the morning brief, and never recreates itself after deletion. User-created schedule/webhook/RSS automations continue to work.
- **Fail:** The product still depends on hidden `pulse` behavior, `Daily Orchestrator` is recreated after deletion, quiet-hours behavior still appears anywhere in runtime/UI, cron runs still write `run_type = 'autopilot'`, or the automations UI hides or special-cases the default automation.
