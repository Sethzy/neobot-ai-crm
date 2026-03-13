# QA Surface 20: Context Management & Efficiency

> **PRs covered:** 22 (context recovery), 22c (block storage + context management), 15 (platform instructions)
> **Dogfoodable:** No (invisible backend — test via Langfuse traces)
> **Time estimate:** 25-30 min manual
> **Components:** `run-agent.ts`, `compaction.ts`, `context.ts`
> **Analyzer features:** Token budgets, baseline regression, context bloat detection

---

## Prerequisites

- Logged in with CRM data
- Langfuse dashboard open (to inspect traces and token counts)
- Supabase Storage access (to verify block storage files)
- Analyzer baseline set from a clean run (`--save-baseline`)

---

## What This Tests

The runner has hard limits on context window usage: tool results are truncated at 5KB (stored in block storage for recovery), the agent is limited to 9 steps per run, and tools are disabled on the final step. This surface verifies these guardrails work correctly and that the agent stays within efficiency budgets.

**Key constants:**
- `ARTIFACT_SIZE_THRESHOLD_BYTES = 5,000` — tool result truncation threshold
- `MAX_STEPS_TIER_1 = 9` — max steps per run
- `MAX_CONTEXT_MESSAGES = 240` — max history messages loaded
- `COMPACTION_MESSAGE_THRESHOLD = 200` — triggers compaction

---

## Manual QA Scenarios

### 20.1 Tool result truncation

1. Ask a query that returns a large result: "Run this SQL: SELECT * FROM contacts"
2. **Expected:** Agent calls `run_sql` and gets results
3. **Verify in Langfuse:** If result > 5KB, trace shows truncated output with `<context-removed>` marker
4. **Verify in Supabase Storage:** Full result stored at `/agent/toolcalls/{toolCallId}/result.json`
5. "Read back the full result from that last tool call"
6. **Expected:** Agent can use `read_file` to recover the full data from block storage

**Notes / failures:**

---

### 20.2 Step limit behavior

1. Ask a complex query that requires many tool calls: "Research District 9 property trends, find all my District 9 deals, compare them to market data, create a summary note, and add a follow-up task"
2. **Expected:** Agent executes up to 9 steps
3. **Verify in Langfuse:** Trace shows ≤9 GENERATION observations
4. **Expected:** On the final allowed step, agent summarizes without tools (tools disabled via `buildPrepareStep`)
5. **Expected:** Agent produces a useful response even if truncated

**Notes / failures:**

---

### 20.3 Context bloat baseline

1. Send a simple no-tool message: "Hello"
2. **Verify in Langfuse:** Step-1 prompt tokens (initial context size)
3. **Expected:** < 8K tokens for a fresh thread with minimal CRM data
4. Compare against baseline if set
5. **Flag:** > 15K tokens on step 1 indicates system prompt bloat

**Notes / failures:**

---

### 20.4 Token efficiency — simple query

1. "How many contacts do I have?"
2. **Verify in Langfuse:** Total tokens (prompt + completion across all steps)
3. **Expected:** Single `run_sql` call, total < 20K tokens
4. **Flag:** If agent uses multiple steps for a simple count, investigate

**Notes / failures:**

---

### 20.5 Token efficiency — multi-step query

1. "Find Sarah Lim's contact, show me her linked deals, and update her email to sarah@newdomain.com"
2. **Verify in Langfuse:** Token usage across steps
3. **Expected:** 3-4 tool calls (`search_crm`, `search_crm`, `update_record`), total < 80K tokens
4. Compare against baseline for regression

**Notes / failures:**

---

### 20.6 Compaction trigger

1. Create a thread with 200+ messages (use rapid back-and-forth conversation)
2. Send message 201
3. **Expected:** Compaction fires automatically
4. **Verify in Supabase:** Thread has compaction summary stored
5. **Expected:** Compaction summary has 4 sections: User Instructions, Workflow, Resources, Current Focus
6. Send another message after compaction
7. **Expected:** Agent still has context from earlier conversation (key entities preserved in summary)

**Notes / failures:**

---

### 20.7 Compaction — trigger event pruning

1. In an autopilot or trigger thread with many trigger invocations
2. Trigger compaction (200+ messages)
3. **Expected:** Old trigger events are mechanically pruned with `<context-removed>` wrapper
4. **Expected:** Only title + source extracted from pruned events (not full LLM summarization)

**Notes / failures:**

---

### 20.8 Message history limit

1. Create a thread approaching 240 messages
2. **Expected:** Context loads the most recent 240 messages (`MAX_CONTEXT_MESSAGES`)
3. **Expected:** Older messages are not in context but still in DB
4. Agent should not crash or behave oddly at this boundary

**Notes / failures:**

---

## Edge Cases

- [ ] Tool result at exactly 5,000 bytes — verify threshold behavior (≤5KB inline, >5KB truncated)
- [ ] Block storage file missing (manually deleted) — agent handles `read_file` gracefully
- [ ] Compaction on thread with 50 messages (below threshold) — does NOT fire
- [ ] Compaction model (Gemini Flash Lite) unavailable — graceful fallback or error
- [ ] 9 steps all using large tool results — context doesn't overflow
- [ ] Agent tries to use tool on step 9 (final step) — tool disabled, agent gets text-only response

---

## Pass / Fail Criteria

- **Pass:** Tool results > 5KB are truncated with `<context-removed>` and recoverable via block storage. Step limit (9) enforced — tools disabled on final step. Token usage within budgets. Compaction fires at 200 messages with structured summary. Context bloat < 8K on step 1.
- **Fail:** Large tool results crash context. Agent exceeds 9 steps. Token usage >> budget with no explanation. Compaction doesn't fire or loses key entities. Step-1 context > 15K tokens.
