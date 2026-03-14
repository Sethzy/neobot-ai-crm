# QA Surface 8: Triggers & Automations

> **PRs covered:** 18 (cron scanner + triggers table), 19 (autopilot), 20 (trigger tools + user triggers), 20a (template prompt cards)
> **Dogfoodable:** Yes (automations page), partial (trigger execution needs time or simulation)
> **Time estimate:** 30-40 min manual (some waiting for triggers to fire)
> **v2 tools:** `setup_trigger`, `manage_active_triggers`, `search_triggers`, `search_crm`, `list_todo`, `manage_todo`

---

## Prerequisites

- Logged in with CRM data (for autopilot to have work)
- Cron scanner running (`/api/cron/scan` — either via Vercel cron or manual curl)
- Some overdue tasks and stale deals in CRM (so autopilot has things to act on)
- Supabase dashboard open to inspect `agent_triggers` and `runs` tables

---

## Dogfood Checklist (automated browser pass)

- [ ] `/automations` page loads without errors
- [ ] Trigger list table renders (if triggers exist)
- [ ] Suggested automations section visible below trigger table
- [ ] Template cards render with icon, title, description
- [ ] Click a template card → navigates to `/chat?prompt=...`
- [ ] Responsive: automations page works on mobile
- [ ] Enable/disable toggle on triggers is visible and clickable

---

## Manual QA Scenarios

### 8.1 Autopilot plumbing — thread, trigger, and cron

1. Navigate to `/chat`
2. **Expected:** "Sunder Autopilot" pinned thread visible in sidebar
3. Check `/automations` page
4. **Expected:** Autopilot trigger exists (type: pulse, default `0 */6 * * *` cron)
5. **Verify in Supabase:** `agent_triggers` has autopilot trigger with `next_run_at` set, linked to the pinned thread
6. Manually fire: set `next_run_at` to `now()` in Supabase, then `curl /api/cron/scan?cron_secret=...`
7. **Expected:** `runs` table has a new row with `run_type = 'autopilot'`, linked to the autopilot thread, using `generateText` (non-streaming)

**Notes / failures:**

---

### 8.2 Bootstrap — agent checks live state before acting

> Tests: `BOOTSTRAP` section of `AUTOPILOT_INSTRUCTION_PROMPT` in `src/lib/autopilot/constants.ts`

Pre-condition: Seed CRM with a few tasks (some overdue) and deals.

1. Fire a pulse
2. **Inspect Langfuse trace** (or `runs` table tool calls): agent's FIRST tool calls must be the bootstrap trio:
   - `list_todo()` — check thread todos
   - `search_crm(entity: "tasks")` — live CRM tasks
   - `search_crm(entity: "deals")` — live CRM deals
3. **Expected:** These calls happen BEFORE any write/action tools. The agent does not act on stale thread history alone.
4. **Fail if:** Agent skips bootstrap and immediately writes, or only calls one of the three.

**Notes / failures:**

---

### 8.3 Priority order — agent works the highest-priority item

> Tests: `PRIORITY` ladder (9 tiers) in `AUTOPILOT_INSTRUCTION_PROMPT`

Run each sub-scenario by seeding specific state, firing a pulse, then checking what the agent chose to work on.

**8.3a — Tier 1: Resume interrupted work (todos)**

1. Create agent todos in the autopilot thread via `manage_todo` (e.g., "Draft follow-up email for Mr. Tan")
2. Fire pulse
3. **Expected:** Agent calls `list_todo()`, finds the pending todo, and resumes that work before anything else

**8.3b — Tier 2: Overdue CRM tasks**

1. Clear all todos. Create a CRM task with `due_date` in the past.
2. Fire pulse
3. **Expected:** Agent calls `search_crm(entity: "tasks")`, identifies the overdue task, and acts on it (e.g., creates an interaction, proposes a follow-up)

**8.3c — Tier 3: Monitored CRM state (deals)**

1. Clear todos and overdue tasks. Have active deals with recent stage changes.
2. Fire pulse
3. **Expected:** Agent reviews deals via `search_crm(entity: "deals")` or `run_sql()`, surfaces insights or proposes next actions

**8.3d — Tier 6: Sparse USER.md**

1. Clear todos, tasks, and deals. Ensure `/agent/USER.md` is empty or has < 3 lines.
2. Fire pulse
3. **Expected:** Agent leaves a concise question in the thread to learn about the user (not a wall of questions — one question only)

**8.3e — Tier 7-9: Engagement / proposals / momentum**

1. Clear everything. Populate CRM with a stalled deal (no activity for 14+ days).
2. Fire pulse
3. **Expected:** Agent proposes concrete next steps: creates a CRM task via `create_task()`, or proposes a follow-up action for user approval

**Notes / failures:**

---

### 8.4 Approval override — safe vs deferred actions

> Tests: `<approval-override>` section of `AUTOPILOT_INSTRUCTION_PROMPT`

**8.4a — Auto-executed actions (internal)**

1. Seed an overdue task. Fire pulse.
2. **Expected:** Agent auto-executes without asking: `create_task`, `update_task`, `create_interaction`, `manage_todo`, `write_file` (to memory files)
3. **Verify:** These tool calls complete successfully in the trace — no "awaiting approval" language

**8.4b — Deferred actions (external-facing)**

1. Seed state that would naturally lead to creating a new contact (e.g., a lead name mentioned in a task note)
2. Fire pulse
3. **Expected:** Agent does NOT call `create_contact`, `update_contact`, `create_deal`, etc. directly
4. **Expected:** Agent leaves a clear proposal in the thread: "I'd like to create a contact for [name] — please approve"
5. **Verify in trace:** No blocked tool calls, no errors — agent self-gates via prompt, not via tool restrictions

**8.4c — Summary of actions**

1. Fire any pulse that results in actions
2. **Expected:** Agent's thread response ends with a summary: what it did, what it deferred for user approval
3. **Fail if:** Agent takes actions silently with no summary

**Notes / failures:**

---

### 8.5 Memory persistence — MEMORY.md updated after pulse

> Tests: `AFTER ACTING` section of `AUTOPILOT_INSTRUCTION_PROMPT`

1. Fire a pulse that results in at least one action
2. **Expected:** Agent calls `write_file` to `/agent/MEMORY.md` with a timestamped summary of what it did and learned
3. Fire a second pulse
4. **Expected:** Agent reads MEMORY.md, sees the previous pulse summary, and does not repeat the same work
5. **Bonus:** If the agent learned a stable fact (e.g., user prefers mornings for viewings), check if it wrote to `/agent/USER.md` or `/agent/memory/*.md`

**Notes / failures:**

---

### 8.6 Hard rules — no empty pulses, no filler

> Tests: `HARD RULES` section of `AUTOPILOT_INSTRUCTION_PROMPT`

**8.6a — Always does something**

1. Seed minimal but non-empty state (a few contacts, one active deal)
2. Fire pulse
3. **Expected:** Agent takes at least one meaningful action (not just "everything looks good!")
4. **Fail if:** Agent produces only a status report with no concrete action or next step

**8.6b — Logs when nothing is actionable**

1. Clear ALL state: no todos, no tasks, no deals, empty CRM
2. Fire pulse
3. **Expected:** Agent verifies all sources (todos, tasks, deals, follow-ups) and explicitly logs WHY nothing was actionable
4. **Expected:** Agent still does something constructive (Tier 6: asks about the user, or Tier 8: proposes creating initial CRM tasks)
5. **Fail if:** Agent says "nothing to do" without checking all sources

**8.6c — No filler / low-value output**

1. Fire 3 pulses in quick succession (reset `next_run_at` each time)
2. **Expected:** Pulses 2 and 3 don't just repeat pulse 1's work. Agent reads MEMORY.md and finds new things to do or correctly identifies that it already handled everything.
3. **Fail if:** Agent produces generic motivational text, restates CRM data without acting on it, or repeats the same actions

**Notes / failures:**

---

### 8.7 Quiet hours — pulse skipped during off-hours

1. Set `quiet_hours_start` and `quiet_hours_end` in `autopilot_config` to cover the current time
2. Fire cron scan
3. **Expected:** Pulse is skipped, `next_run_at` is rescheduled to after quiet hours end
4. **Verify:** No new run created in the autopilot thread

**Notes / failures:**

---

### 8.8 Concurrency — pulse skipped if thread is busy

1. Start a long-running chat in the autopilot thread (or simulate by leaving a run in `processing` state)
2. Fire cron scan
3. **Expected:** Pulse returns `skipped_busy`, no double-execution
4. **Verify:** No new run created

**Notes / failures:**

---

### 8.9 Search available trigger types

1. "What kinds of automations can I set up?"
2. **Expected:** Agent calls `search_triggers` to discover available trigger types
3. **Expected:** Returns trigger types (schedule, webhook, RSS) with descriptions
4. "Tell me about webhook triggers"
5. **Expected:** Agent describes webhook trigger capabilities

**Notes / failures:**

---

### 8.10 Create a scheduled trigger via chat

1. In a new thread: "Check my overdue tasks every morning at 8am"
2. **Expected:** Agent calls `setup_trigger` with:
   - Type: schedule
   - Cron expression: something like `0 8 * * *`
   - Prompt/instructions about checking tasks
3. **Expected:** Agent confirms trigger creation
4. Check `/automations` page — new trigger visible with schedule and next_run_at

**Notes / failures:**

---

### 8.11 Create a webhook trigger via chat

1. "Create a webhook trigger that processes inbound leads"
2. **Expected:** `setup_trigger` with type: webhook
3. **Expected:** Agent returns a webhook URL: `/api/trigger/webhook/{triggerId}`
4. Test the webhook (via curl or Postman):
   ```
   curl -X POST https://your-app.vercel.app/api/trigger/webhook/{triggerId} \
     -H "Content-Type: application/json" \
     -d '{"lead_name": "Test Lead", "source": "PropertyGuru"}'
   ```
5. **Expected:** A run fires in the trigger's thread with the POST body as context
6. Check the trigger's thread — agent should have processed the lead data

**Notes / failures:**

---

### 8.12 Create an RSS trigger via chat

1. "Monitor the PropertyGuru RSS feed for new listings in District 10"
2. **Expected:** `setup_trigger` with type: rss, config includes feed URL
3. **Verify in Supabase:** `agent_triggers` row with rss type and feed URL in config
4. Trigger execution (manually set next_run_at, then `/api/cron/scan`)
5. **Expected:** Agent fetches RSS feed, identifies new items
6. **Expected:** State file created at `state/{triggerId}/seen.json` for deduplication
7. Second execution should only process NEW items (dedup works)

**Notes / failures:**

---

### 8.13 Manage triggers via chat

1. "List all my active triggers"
2. **Expected:** `manage_active_triggers` with list action
3. "Disable the overdue tasks trigger"
4. **Expected:** `manage_active_triggers` with disable/edit action
5. Check `/automations` — trigger shows as disabled
6. "Delete the webhook trigger"
7. **Expected:** `manage_active_triggers` with delete action (approval-gated — delete action requires user confirmation)
8. **Expected:** Trigger removed from `/automations`

**Notes / failures:**

---

### 8.14 Automations page — trigger list

1. Navigate to `/automations`
2. **Expected:** Table shows all triggers with:
   - Name
   - Type (schedule/webhook/RSS) with badge
   - Schedule/config info
   - Last run time
   - Next run time
   - Status (active/disabled)
3. Toggle a trigger's enable/disable
4. **Expected:** Status updates immediately
5. Click on a trigger's thread link
6. **Expected:** Navigates to the trigger's conversation thread

**Notes / failures:**

---

### 8.15 Suggested automations — template cards (PR 20a)

1. Navigate to `/automations`
2. **Expected:** "Suggested" section visible (below trigger table, or as empty state if no triggers)
3. **Expected:** 6-8 template cards visible:
   - Morning CRM briefing
   - New listing alert monitor (RSS)
   - Daily follow-up reminder sweep
   - Weekly pipeline summary
   - Post-viewing follow-up drafter
   - Inbound lead qualification
   - Birthday/anniversary reminder
4. Click "Morning CRM briefing" card
5. **Expected:** Navigated to `/chat?prompt={encoded prompt text}`
6. **Expected:** Composer is pre-filled with the template prompt
7. Send the message
8. **Expected:** New thread created, agent starts setting up the automation conversationally

**Notes / failures:**

---

### 8.16 Chat empty state suggestion chips (PR 20a)

1. Create a new thread (empty)
2. **Expected:** 3-4 suggestion chips shown in the empty state
3. Click a chip
4. **Expected:** Prompt pre-fills in composer (does NOT auto-send)
5. Modify the prompt text before sending
6. **Expected:** Works — the pre-fill is editable

**Notes / failures:**

---

## Edge Cases

### Pulse prompt behavior
- [ ] Pulse with nothing to do — agent still takes a constructive action (no empty "all good!" responses)
- [ ] Pulse repeats — agent reads MEMORY.md and avoids redoing the same work
- [ ] Pulse with external-facing action needed — agent proposes (not executes) contact/deal mutations
- [ ] Pulse during quiet hours — skipped, rescheduled correctly
- [ ] Pulse while thread is busy — returns `skipped_busy`, no double-execution
- [ ] Pulse with large thread history — agent relies on bootstrap tools for live state, not stale context
- [ ] Pulse with broken memory file (corrupt MEMORY.md) — agent handles gracefully, doesn't crash

### Triggers (non-pulse)
- [ ] Cron scanner with no due triggers — completes cleanly, no unnecessary runs
- [ ] Webhook with invalid JSON body — graceful error response
- [ ] Webhook with wrong/missing secret (if HMAC validation enabled) — 401/403
- [ ] RSS feed that's down/404 — trigger handles gracefully, doesn't crash
- [ ] RSS feed with 0 new items — no run fired (noise suppression)
- [ ] 20+ triggers for a single user — automations page handles pagination
- [ ] Trigger's retry policy: autopilot (0 retries), schedule (max 2 retries)
- [ ] Delete a trigger that's currently running — handled gracefully
- [ ] Template card click while already in a thread — creates new thread

---

## Pass / Fail Criteria

- **Pass:** Autopilot pulse fires on schedule, bootstraps with live CRM state, follows priority order, auto-executes internal actions, defers external actions as proposals, updates MEMORY.md after acting, never produces empty/filler pulses. User triggers (schedule/webhook/RSS) work via chat. Automations page accurate. No double-execution.
- **Fail:** Pulse skips bootstrap, acts on stale data, executes external-facing mutations without deferring, produces no-op filler output, doesn't update memory, repeats same work across pulses. Triggers double-execute, webhook doesn't process payload, RSS doesn't dedup, automations page crashes.
