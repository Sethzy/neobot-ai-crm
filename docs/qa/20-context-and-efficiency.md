# QA Surface 20: Context Management & Efficiency

> **PRs covered:** 22 (context recovery), 22c (block storage + context management), 15 (platform instructions), 56 (context pipeline redesign)
> **Dogfoodable:** No (invisible backend — test via Langfuse traces)
> **Time estimate:** 30-35 min manual
> **Components:** `run-agent.ts`, `run-persistence.ts`, `compaction.ts`, `context.ts`, `activated-tools.ts`
> **Analyzer features:** Token budgets, baseline regression, context bloat detection

---

## Prerequisites

- Logged in with CRM data
- Langfuse dashboard open (to inspect traces and token counts)
- Supabase dashboard open (messages, runs, threads, and connections tables)
- At least one active OAuth connection if testing schema-cache behavior
- Analyzer baseline set from a clean run (`--save-baseline`) if you use the QA scripts

---

## What This Tests

This surface verifies the post-PR56 context pipeline: append-only persistence, DB-cached connection schemas, stable prompt-prefix construction, token-aware compaction, and stale-thread resets. Most checks require Langfuse and Supabase because the chat UI alone does not expose cache behavior.

**Key constants:**
- `MAX_STEPS_TIER_1 = 9` — max steps per run
- `MAX_CONTEXT_MESSAGES = 240` — recent message history loaded before fallback trimming
- `COMPACTION_TRIGGER_FRACTION = 0.85` — compaction trigger when previous run prompt tokens exceed 85% of the model window
- `COMPACTION_MESSAGE_FALLBACK = 80` — fallback trigger when prompt token data is unavailable
- `COMPACTION_KEEP_RECENT = 30` — messages kept verbatim after compaction pass

---

## Manual QA Scenarios

### 20.1 Append-only tool output persistence

1. Ask a query that returns a large text payload: `Run this SQL: select repeat('alpha ', 2000) as payload;`
2. **Expected:** Agent calls `run_sql` and returns the payload
3. **Verify in Supabase:** Persisted message parts keep the full text output inline — no `<context-removed>` marker for text payloads
4. **Verify in Langfuse:** The next model call sees the full tool text in history
5. **Expected:** No block-storage recovery step is required for plain-text tool output

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

### 20.3 Stable prefix + reminder message injection

1. Start a fresh thread and ask: "What are my deal stages and how many tasks do I have?"
2. Send a follow-up: "Answer again in one sentence."
3. **Verify in Langfuse:** The system string is identical across both turns
4. **Expected:** `<system-reminder>` appears as a user message, not in the system prompt string
5. **Expected:** Memory payload appears after the reminder message and before thread history
6. Compare prompt tokens against baseline if set

**Notes / failures:**

---

### 20.4 Connection schema cache / self-heal path

1. Use a client with an active connection (for example Google Calendar)
2. Ask for a connected action the agent can satisfy with an already-activated tool
3. **Expected:** The action succeeds without an on-run Composio catalog dependency
4. **Verify in Supabase:** `connections.tool_schemas` is populated for the active row
5. If the row started empty, **Expected:** the first successful fallback persists schemas so the next run is warm

**Notes / failures:**

---

### 20.5 Token efficiency — simple query

1. "How many contacts do I have?"
2. **Verify in Langfuse:** Total tokens (prompt + completion across all steps)
3. **Expected:** Single `run_sql` call or a direct context answer, total < 20K tokens
4. **Flag:** If agent uses multiple steps for a simple count, investigate

**Notes / failures:**

---

### 20.6 Fraction-based compaction trigger

1. Create or reuse a thread with very large prompt usage (long history, heavy tool outputs, or seeded fixture data)
2. Send the next message after the previous run has completed
3. **Expected:** Compaction fires automatically when the prior run crosses the token threshold
4. **Verify in Supabase:** The just-finished run row has `prompt_tokens` populated and the thread has a compaction summary stored
5. **Expected:** Compaction summary has 4 sections: User Instructions, Workflow, Resources, Current Focus
6. Send another message after compaction
7. **Expected:** Agent still has context from earlier conversation (key entities preserved in summary)

**Notes / failures:**

---

### 20.7 Stale thread reset

1. Pick a thread with visible old history
2. In Supabase, set `conversation_threads.updated_at` to more than 4 hours in the past
3. Send a new message in that thread
4. **Expected:** The agent responds using system prompt + reminder + memory + the new message, not the stale history
5. **Verify in Supabase:** `context_reset_at` is set to the thread's prior `updated_at`
6. **Expected:** Old messages remain visible in the UI and DB, but are excluded from assembled context

**Notes / failures:**

---

### 20.8 Message history limit fallback

1. Create a thread approaching 240 messages without triggering compaction fallback first
2. **Expected:** Context loads the most recent 240 messages (`MAX_CONTEXT_MESSAGES`)
3. **Expected:** Older messages are not in context but still in DB
4. Agent should not crash or behave oddly at this boundary

**Notes / failures:**

---

## Edge Cases

- [ ] Empty `tool_schemas` on an active connection — first read self-heals and subsequent runs stay on DB cache
- [ ] Compaction below 85% context usage but above 80 messages with missing token data — fallback message-count trigger still works
- [ ] Compaction model (Gemini Flash Lite) unavailable — graceful fallback or error
- [ ] 9 steps all using large tool results — context doesn't overflow
- [ ] Agent tries to use tool on step 9 (final step) — tool disabled, agent gets text-only response
- [ ] Unconfigured browser/market tools stay registered but fail only when invoked

---

## Pass / Fail Criteria

- **Pass:** Tool outputs stay append-only in DB, prompt prefix stays stable across turns, connection schemas are served from the DB cache (or self-heal once), step limit (9) is enforced, stale threads reset after 4 hours idle, and compaction fires from previous-run prompt tokens with a structured 4-section summary.
- **Fail:** Text tool outputs are truncated or replaced with recovery markers. System reminder or memory payload leaks into the system string. Active connections keep requiring hot-path Composio fetches. Stale threads still load old history. Compaction fails to trigger when prompt tokens cross the threshold or loses key entities after summarization.
