# QA Surface 12: Approvals

> **PRs covered:** 33 (gate implementation), 34 (events + UI)
> **Dogfoodable:** Yes
> **Time estimate:** 20-25 min manual
> **v2 tools:** `create_record`, `delete_records`, `search_crm`, `update_record`, `manage_activated_tools_for_connections`, `delete_connection`

---

## Prerequisites

- Logged in with working chat
- At least one CRM contact exists (to test delete gating)
- At least one connection available (to test activation gating)
- Supabase dashboard open (to verify `approval_events` table)

---

## Dogfood Checklist (automated browser pass)

- [ ] Destructive tool calls (e.g., delete contact) show approve/deny buttons instead of auto-executing
- [ ] Approve button triggers tool execution and shows result
- [ ] Deny button shows denied state and agent acknowledges
- [ ] No console errors during approval flow
- [ ] Approval cards render correctly on mobile viewport

---

## Manual QA Scenarios

### 12.1 Destructive action gating — delete record (PR 33)

1. Create a test contact: "Create a contact named QA Test Delete"
2. **Expected:** Agent calls `create_record` (entity: contacts) — auto-executes (no gate for creates)
3. "Delete the contact QA Test Delete"
4. **Expected:** Agent calls `search_crm` to find the contact, then calls `delete_records` with a `reason` field (required for audit trail)
5. **Expected:** Tool call shows approve/deny buttons (not auto-executed — `delete_records` is always approval-gated)
6. Click "Approve"
7. **Expected:** Contact is deleted, agent confirms
8. **Verify in Supabase:** Contact row gone, `approval_events` row created with `approved` status

**Notes / failures:**

---

### 12.2 Destructive action denied (PR 33)

1. Create another test contact: "Create a contact named QA Test Keep"
2. **Expected:** `create_record` auto-executes
3. "Delete the contact QA Test Keep"
4. **Expected:** `delete_records` shows approval card (reason field populated)
5. Click "Deny"
6. **Expected:** Tool shows denied state
7. **Expected:** Agent acknowledges the denial and does NOT delete the contact
8. **Verify in Supabase:** Contact still exists, `approval_events` row has `denied` status

**Notes / failures:**

---

### 12.3 Connection tool activation gating (PR 33)

1. Ask agent to activate tools for a connection (e.g., "Activate the send email tool on Gmail")
2. **Expected:** `manage_activated_tools_for_connections` shows approval card (always approval-gated)
3. Approve the activation
4. **Expected:** Tool activates normally

**Notes / failures:**

---

### 12.4 Approval in trigger threads (PR 34)

1. Have a trigger set up that would perform a destructive action
2. Wait for trigger to fire (or manually trigger)
3. **Expected:** Trigger thread shows pending approval action
4. Open the trigger thread
5. **Expected:** Approve/deny buttons visible in thread
6. Approve or deny
7. **Expected:** Action resolves accordingly

**Notes / failures:**

---

### 12.5 Approval events table (PR 34)

1. After completing scenarios 12.1-12.3
2. **Verify in Supabase:** `approval_events` table has rows for each approval interaction
3. **Expected:** Each row has: tool call ID, action type, status (approved/denied), timestamp
4. **Expected:** Rows are scoped to the correct client (RLS)

**Notes / failures:**

---

### 12.6 Non-destructive actions bypass gate (PR 33)

1. "Create a contact named QA No Gate"
2. **Expected:** `create_record` auto-executes — no approval card (creates are not destructive)
3. "List all contacts"
4. **Expected:** `search_crm` auto-executes — no approval card (reads are not destructive)
5. "Update QA No Gate's email to test@example.com"
6. **Expected:** `update_record` auto-executes — no approval card (updates are not destructive)

**Notes / failures:**

---

### 12.7 Subagents excluded from delete tools (PR 33)

1. Trigger a subagent for a research task
2. **Expected:** Subagent does NOT have access to delete tools
3. Even if subagent's context suggests deletion, it cannot invoke delete tools

**Notes / failures:**

---

## Edge Cases

- [ ] Approve after long delay (minutes) — still works, not expired
- [ ] Multiple pending approvals in same thread — each resolves independently
- [ ] Refresh page with pending approval — card still renders
- [ ] Deny then immediately ask agent to retry the same action — new approval card appears
- [ ] Approval in trigger thread vs chat thread — both work correctly

---

## Pass / Fail Criteria

- **Pass:** `delete_records` and `manage_activated_tools_for_connections` and `delete_connection` show approval gates. Approved actions execute; denied actions don't. `approval_events` table tracks all decisions. Non-destructive tools (`create_record`, `update_record`, `search_crm`) bypass the gate. Subagents can't access delete tools.
- **Fail:** `delete_records` auto-executes without approval. Denied actions still execute. No `approval_events` rows. Gate triggers on non-destructive actions (false positives).
