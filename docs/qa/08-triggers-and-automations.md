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

### 8.1 Autopilot thread exists

1. Navigate to `/chat`
2. **Expected:** "Sunder Autopilot" pinned thread visible in sidebar
3. Click on it
4. **Expected:** Thread exists and is pinned (distinct from regular threads)
5. **Verify in Supabase:** `conversation_threads` has a row with `is_pinned = true` and title containing "Autopilot"

**Notes / failures:**

---

### 8.2 Autopilot trigger auto-created

1. Check `/automations` page
2. **Expected:** An autopilot trigger exists (type: schedule, default 6h interval)
3. **Verify in Supabase:** `agent_triggers` has autopilot trigger row with `next_run_at` set
4. **Expected:** Trigger is linked to the autopilot thread

**Notes / failures:**

---

### 8.3 Autopilot pulse execution

1. Manually trigger an autopilot pulse:
   - Option A: Wait for `next_run_at` to pass, then hit `/api/cron/scan`
   - Option B: Update `next_run_at` in Supabase to now(), then hit `/api/cron/scan`
2. **Expected:** A run is created in the autopilot thread
3. Check the autopilot thread in chat
4. **Expected:** Agent has produced meaningful output (checked CRM state, identified work to do)
5. **Expected:** Agent used tools (`search_crm` with entity: tasks, `list_todo`, etc.) — not just generic text
6. **Verify:** `runs` table has a new run linked to the autopilot thread with `generateText` (not stream)

**Notes / failures:**

---

### 8.4 Autopilot priority order

Pre-condition: Create some testable state:
- Create an overdue CRM task (due date in the past)
- Create some agent todos in the autopilot thread
- Leave USER.md sparse

1. Trigger autopilot pulse
2. **Expected priority behavior:**
   - If there are agent todos → agent resumes interrupted work first
   - If there are overdue CRM tasks → agent checks those next
   - If USER.md is sparse → agent might try to learn about user
3. **Expected:** Agent calls tools for live state BEFORE acting (bootstrap requirement from PR19-6)

**Notes / failures:**

---

### 8.5 Search available trigger types

1. "What kinds of automations can I set up?"
2. **Expected:** Agent calls `search_triggers` to discover available trigger types
3. **Expected:** Returns trigger types (schedule, webhook, RSS) with descriptions
4. "Tell me about webhook triggers"
5. **Expected:** Agent describes webhook trigger capabilities

**Notes / failures:**

---

### 8.6 Create a scheduled trigger via chat

1. In a new thread: "Check my overdue tasks every morning at 8am"
2. **Expected:** Agent calls `setup_trigger` with:
   - Type: schedule
   - Cron expression: something like `0 8 * * *`
   - Prompt/instructions about checking tasks
3. **Expected:** Agent confirms trigger creation
4. Check `/automations` page — new trigger visible with schedule and next_run_at

**Notes / failures:**

---

### 8.7 Create a webhook trigger via chat

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

### 8.8 Create an RSS trigger via chat

1. "Monitor the PropertyGuru RSS feed for new listings in District 10"
2. **Expected:** `setup_trigger` with type: rss, config includes feed URL
3. **Verify in Supabase:** `agent_triggers` row with rss type and feed URL in config
4. Trigger execution (manually set next_run_at, then `/api/cron/scan`)
5. **Expected:** Agent fetches RSS feed, identifies new items
6. **Expected:** State file created at `state/{triggerId}/seen.json` for deduplication
7. Second execution should only process NEW items (dedup works)

**Notes / failures:**

---

### 8.9 Manage triggers via chat

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

### 8.10 Automations page — trigger list

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

### 8.11 Suggested automations — template cards (PR 20a)

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

### 8.12 Chat empty state suggestion chips (PR 20a)

1. Create a new thread (empty)
2. **Expected:** 3-4 suggestion chips shown in the empty state
3. Click a chip
4. **Expected:** Prompt pre-fills in composer (does NOT auto-send)
5. Modify the prompt text before sending
6. **Expected:** Works — the pre-fill is editable

**Notes / failures:**

---

### 8.13 Autopilot configuration

1. Check `autopilot_config` in Supabase — should have a row for this client
2. Default pulse interval should be 6h
3. Change pulse interval (via direct DB edit or agent if tool exists)
4. Verify next_run_at updates accordingly

**Notes / failures:**

---

## Edge Cases

- [ ] Trigger fires while thread has an active run — serialization prevents double execution
- [ ] Cron scanner with no due triggers — completes cleanly, no unnecessary runs
- [ ] Webhook with invalid JSON body — graceful error response
- [ ] Webhook with wrong/missing secret (if HMAC validation enabled) — 401/403
- [ ] RSS feed that's down/404 — trigger handles gracefully, doesn't crash
- [ ] RSS feed with 0 new items — no run fired (noise suppression)
- [ ] Autopilot with nothing to do — produces minimal or no output (noise suppression from PR19-7)
- [ ] 20+ triggers for a single user — automations page handles pagination
- [ ] Trigger's retry policy: autopilot (0 retries), schedule (max 2 retries)
- [ ] Delete a trigger that's currently running — handled gracefully
- [ ] Template card click while already in a thread — creates new thread

---

## Pass / Fail Criteria

- **Pass:** Autopilot thread exists and fires on schedule. User can create schedule/webhook/RSS triggers via chat. Triggers fire correctly and produce meaningful output. Automations page shows accurate trigger state. Template cards pre-fill chat correctly. No double-execution.
- **Fail:** Autopilot never fires, triggers double-execute, webhook doesn't process payload, RSS doesn't dedup, automations page crashes, template cards broken.
