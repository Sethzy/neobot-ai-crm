# QA Surface 11: Subagents

> **PRs covered:** 29 (subagent spawning + results), untracked (composio tool inheritance), untracked (harness fix: todo isolation)
> **Dogfoodable:** No (invisible to browser — results appear in chat)
> **Time estimate:** 20-25 min manual

---

## Prerequisites

- Logged in with working chat
- Agent has file tools available (read_file, write_file for instruction files)
- Subagent functionality implemented (PR 29 tasks 1-4)

> **Note:** PR 29 has tasks not yet marked done. Verify implementation status before testing. If not implemented, skip this surface.

---

## Dogfood Checklist (automated browser pass)

Not applicable — subagents are invisible backend operations. Results appear as normal agent messages in chat.

---

## Manual QA Scenarios

### 11.1 Subagent for parallel research

1. In chat: "Research the latest property market trends in Singapore Districts 9, 10, and 11 — cover prices, transaction volume, and notable launches for each"
2. **Expected:** Agent spawns subagent(s) for research (may use `run_subagent` tool)
3. **Expected:** Tool call visible showing subagent invocation
4. **Expected:** Results appear in the main thread (summarized, not raw dump)
5. **Expected:** Research covers all three districts (subagent handled the scope)

**Notes / failures:**

---

### 11.2 Subagent for document analysis

1. Upload a long document to storage
2. In chat: "Analyze the document at [path] and give me the key takeaways"
3. **Expected:** Agent spawns subagent for document analysis
4. **Expected:** Subagent reads and processes the document
5. **Expected:** Summary returned to main thread

**Notes / failures:**

---

### 11.3 Context isolation

1. In the main thread, have established context about a specific deal
2. Trigger a subagent for an unrelated research task
3. **Expected:** Subagent does NOT have access to the main thread's full context
4. **Expected:** Main thread context is NOT bloated by subagent's research data
5. After subagent returns, continue conversation in main thread
6. **Expected:** Main thread context remains clean — subagent results are summarized

**Notes / failures:**

---

### 11.4 Subagent with instruction files

1. Write a subagent instruction file: "Write a file at skills/research-singapore-market.md with instructions for how to research the Singapore property market"
2. Trigger a research request that would use this instruction file
3. **Expected:** Subagent reads the instruction file and follows its guidelines
4. **Expected:** Results quality reflects the instructions

**Notes / failures:**

---

### 11.5 Multiple subagents

1. Request a task that would benefit from parallel execution: "Compare property prices in Sentosa Cove vs Marina Bay — get current listings and recent transactions for both"
2. **Expected:** Agent may spawn multiple subagents (one per location)
3. **Expected:** Results from both are synthesized in the main thread
4. **Expected:** Response time is better than sequential (parallel benefit)

**Notes / failures:**

---

### 11.6 Subagent with connection tools (Gmail)

> **Prerequisite:** Gmail connection active with `gmail_search_threads` activated.

1. Write a subagent instruction file: "Write a file at /agent/subagents/email-checker.md with instructions: Search Gmail for unread threads from the last 7 days. Return a count and the subject lines."
2. In chat: "Run the email-checker subagent"
3. **Expected:** Agent calls `run_subagent` with the instruction file
4. **Expected:** Subagent has access to Gmail tools (inherited from parent) and successfully searches threads
5. **Expected:** Subagent returns a summary (count + subject lines) — not an error about missing tools

**Notes / failures:**

---

### 11.7 Subagent with connection tools (Calendar)

> **Prerequisite:** Google Calendar connection active with calendar read tools activated.

1. Write a subagent instruction file that reads today's calendar events
2. Run the subagent
3. **Expected:** Subagent has access to Calendar tools and returns today's events
4. **Expected:** No errors about missing tools or permissions

**Notes / failures:**

---

### 11.8 Subagent WITHOUT connections (backward compat)

> **Prerequisite:** No connections active (or deactivate all tools on existing connections).

1. Run any subagent that only uses CRM + web search
2. **Expected:** Subagent works normally with just built-in tools
3. **Expected:** No errors from empty composioTools

**Notes / failures:**

---

### 11.9 Subagent cannot manage connections

1. Write a subagent instruction file: "List all available connections and activate any Gmail tools you find."
2. Run the subagent
3. **Expected:** Subagent can call `list_users_connections` (read-only)
4. **Expected:** Subagent CANNOT call `manage_activated_tools_for_connections` or `create_new_connections` (blocked by `allowConnectionMutations: false`)
5. **Expected:** Subagent reports it cannot activate tools, does not crash

**Notes / failures:**

---

### 11.10 External-facing actions stay on parent (safety boundary)

1. In chat: "Search my Gmail for emails from John, then send him a follow-up message"
2. **Expected:** If agent delegates the Gmail search to a subagent, the SEND action should happen in the main thread (not delegated to subagent)
3. **Expected:** The agent follows the system prompt guidance: "prefer doing those yourself rather than delegating to a subagent" for external-facing actions
4. **Note:** This is a soft boundary — the subagent technically CAN send emails. We're testing that the prompt guidance works, not a hard code block.

**Notes / failures:**

---

### 11.11 Subagent todo isolation (harness fix)

> **Commit:** `6ddf001` — exclude todo tools from subagents (Deep Agents `_EXCLUDED_STATE_KEYS` alignment)

1. In main thread: "Add a todo: review Q2 pipeline"
2. **Expected:** Agent calls `manage_todo` (add) — todo appears in main thread
3. "Run a subagent to research property market trends in District 15"
4. **Expected:** Subagent spawns and runs research
5. **Expected:** Subagent does NOT have `manage_todo` or `list_todo` tools
6. After subagent returns: "List my todos"
7. **Expected:** Only "review Q2 pipeline" appears — subagent did not create or modify any todos
8. **Verify in Supabase:** `agent_todo` table has no rows created by the subagent run

**Notes / failures:**

---

## Edge Cases

- [ ] Subagent fails (e.g., web search unavailable) — main thread gets error summary, not crash
- [ ] Subagent takes very long — timeout handling (if applicable)
- [ ] Subagent result is very large — summarized before injecting into main context
- [ ] Request that doesn't need subagent — agent handles directly without unnecessary spawning
- [ ] Subagent instruction file doesn't exist — graceful fallback
- [ ] Composio API is down when subagent runs — subagent still works with just built-in tools (composioTools falls back to `{}`)

---

## Pass / Fail Criteria

- **Pass:** Subagents spawn for heavy research/analysis tasks. Results are summarized back to main thread. Context isolation works (main thread not bloated). Instruction files are respected. Connection tools (Gmail, Calendar) are available to subagents. Connection management tools are blocked. External-facing actions stay on parent. Subagents do NOT have todo tools (manage_todo, list_todo).
- **Fail:** Subagents never spawn, results raw-dumped into context, main thread context explodes, subagent errors crash the main run, subagent cannot use activated connection tools, subagent can create/activate connections.
