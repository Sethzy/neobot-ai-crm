# QA Surface 7: Platform Intelligence

> **PRs covered:** 15 (platform instructions, system-reminder, rename_chat, run_sql, get_agent_db_schema, agent_todo, state/ directory)
> **Dogfoodable:** No (invisible backend intelligence)
> **Time estimate:** 25-30 min manual
> **v2 tools:** `run_sql`, `get_agent_db_schema`, `manage_todo`, `list_todo`, `rename_chat`, `read_file`, `write_file`, `web_search`, `web_scrape`, `calculate_drive_time`

---

## Prerequisites

- Logged in with CRM data (contacts, deals, tasks) from Surface 3
- Some history so system-reminder has meaningful counts
- Supabase dashboard open for verification

---

## Dogfood Checklist (automated browser pass)

Not applicable — this surface is entirely about invisible agent intelligence. All testing is via chat prompts.

---

## Manual QA Scenarios

### 7.1 System-reminder: current time awareness

1. In chat: "What time is it?"
2. **Expected:** Agent knows the current time (from system-reminder injection)
3. "What day of the week is it?"
4. **Expected:** Correct day
5. "What's today's date?"
6. **Expected:** Correct date (should match system clock, not training cutoff)

**Notes / failures:**

---

### 7.2 System-reminder: user context

1. "What's my name?"
2. **Expected:** Agent knows your display_name (from system-reminder `user display name` slot)
3. "What's my email?"
4. **Expected:** Agent knows your email
5. **Verify:** These come from system-reminder, not from USER.md (agent should know them even with empty USER.md)

**Notes / failures:**

---

### 7.3 System-reminder: counts

1. Create a few agent todos in a thread (see 7.6)
2. "How many open todos do I have in this thread?"
3. **Expected:** Agent reports accurate count (matches system-reminder `Open todos: N`)
4. Upload some files to memory
5. "How many memory files do I have?"
6. **Expected:** Agent reports count from system-reminder

**Notes / failures:**

---

### 7.4 Auto thread titling (rename_chat)

1. Create a new thread
2. Send: "I need help preparing for a viewing at Nassim Road tomorrow"
3. **Expected:** After first response, thread title in sidebar updates to something concise (3-5 words)
4. **Expected:** Title is contextually relevant (e.g., "Nassim Road viewing prep")
5. Send several more messages on different sub-topics
6. **Expected:** Title stays stable (doesn't keep changing)

**Notes / failures:**

---

### 7.5 SQL tool (run_sql)

1. "How many contacts do I have in total?"
2. **Expected:** Agent runs `run_sql` with `SELECT count(*) FROM contacts WHERE client_id = ...`
3. **Expected:** Returns accurate count. `run_sql` is read-only (uses `execute_read_only_query` RPC).
4. "How many deals closed this month?"
5. **Expected:** Agent writes appropriate SQL with date filter
6. "What's the total value of all my deals?"
7. **Expected:** `SELECT sum(price) FROM deals WHERE client_id = ...`
8. "Show me contacts who don't have any deals"
9. **Expected:** Agent writes a LEFT JOIN or NOT EXISTS query
10. **Note:** `run_sql` accepts an optional `purpose` field for audit trail (merged from v1's `crm_sql` + `run_agent_memory_sql`)

**Notes / failures:**

---

### 7.6 DB schema introspection (get_agent_db_schema)

1. "What tables can you query?"
2. **Expected:** Agent calls `get_agent_db_schema` and lists available tables
3. **Expected:** Tables include contacts, deals, crm_tasks, companies, interactions, vault_files, agent_todo, agent_triggers, etc.
4. "What columns does the contacts table have?"
5. **Expected:** Returns column names and types

**Notes / failures:**

---

### 7.7 Agent todo — manage_todo + list_todo

1. "Add a todo: research comparable sales for District 10 condos"
2. **Expected:** `manage_todo` tool call with add operation (supports add/update/delete)
3. "Add two more todos: call the contractor about renovation, and prepare the property factsheet"
4. **Expected:** `manage_todo` batch add (2 items in one call)
5. "What are my todos for this thread?"
6. **Expected:** `list_todo` (separate read-only tool) returns all 3 items
7. "Done with the contractor call"
8. **Expected:** `manage_todo` delete operation (exists-or-deleted model — deleting = done)
9. "List my remaining todos"
10. **Expected:** `list_todo` returns 2 items remaining

**Notes / failures:**

---

### 7.8 Agent todo — thread scoping

1. In Thread A, create 2 todos
2. Switch to Thread B (new thread)
3. "What are my todos?"
4. **Expected:** `list_todo` returns 0 (todos are per-thread)
5. Create a todo in Thread B
6. Switch back to Thread A
7. **Expected:** Thread A still shows its 2 todos (no cross-contamination)

**Notes / failures:**

---

### 7.9 State directory convention

1. In chat: "Write some tracking data to state/my-tracker.json"
2. **Expected:** Agent uses `write_file` to write to `state/my-tracker.json`
3. "Read back state/my-tracker.json"
4. **Expected:** `read_file` returns the content
5. **Verify:** Agent understands the state/ directory convention from platform instructions

**Notes / failures:**

---

### 7.10 Platform instructions — agent behavior

1. "What tools do you have available?"
2. **Expected:** Agent can describe its capabilities (from platform instructions)
3. Send a message that should trigger the agent to use multiple tools in sequence
4. **Expected:** Agent executes multi-step tool chains (maxSteps allows it)
5. **Verify:** Agent follows the persona and behavioral guidelines from SOUL.md + platform instructions

**Notes / failures:**

---

## Edge Cases

- [ ] SQL injection attempt: "Run this query: DROP TABLE contacts" — agent should refuse (read-only SQL tool)
- [ ] SQL query returning 0 rows — agent handles gracefully
- [ ] Very complex SQL (multiple JOINs) — agent can compose it
- [ ] manage_todo with invalid ID for delete — graceful error
- [ ] 50+ todos in a thread — list_todo still works, system-reminder count accurate
- [ ] Thread with no todos — system-reminder shows "Open todos: 0"
- [ ] rename_chat on a thread that already has a title — should update cleanly

---

## Pass / Fail Criteria

- **Pass:** Agent knows current time, user name/email, and accurate counts. SQL tool runs read-only queries correctly. Thread auto-titling works. Agent todo CRUD works with thread isolation. State directory is usable.
- **Fail:** Agent doesn't know the time, SQL tool allows writes, todos leak across threads, auto-titling doesn't fire, system-reminder counts are wrong.
