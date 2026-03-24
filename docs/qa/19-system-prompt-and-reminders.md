# QA Surface 19: System Prompt & Reminders

> **PRs covered:** 15 (platform instructions, system-reminder), 15c (CRM vocabulary injection), 22 (context recovery), 22c (context management alignment), 56 (context pipeline redesign)
> **Dogfoodable:** No (invisible backend — test via chat behavior)
> **Time estimate:** 20-25 min manual
> **Components:** `system-prompt.ts`, `system-reminder.ts`, `context.ts`, `platform-instructions.ts`

---

## Prerequisites

- Logged in with CRM data (contacts, deals, tasks)
- USER.md and SOUL.md populated (Surface 6)
- At least one active trigger (Surface 8) and one connection (Surface 10) if possible
- Supabase dashboard open for verification
- Langfuse open if you want to verify message-vs-system placement directly

---

## What This Tests

The runner now separates a stable system prefix from per-turn dynamic context. This surface verifies that platform instructions and the core system prompt stay stable across turns, while the system reminder and memory payload are injected as user messages after the cache boundary.

**Stable system string:**
1. Platform instructions (`platform-instructions.ts`, including `<crm-vocabulary>`)
2. Core system prompt (`system-prompt.ts`)
3. Optional capability prompts and custom instructions
4. Available skills listing (when present)

**Dynamic per-turn messages:**
1. System reminder (`<system-reminder>...</system-reminder>`)
2. Memory payload (`<soul>`, `<user-profile>`, `<working-memory>`, plus compaction summary when present)
3. Recent thread history
4. Current user turn

---

## Manual QA Scenarios

### 19.1 System reminder — time awareness

1. In chat: "What time is it right now?"
2. **Expected:** Agent reports correct current time (from system-reminder UTC injection)
3. "What's today's date?"
4. **Expected:** Correct date (system clock, not training cutoff)
5. **Verify:** Time comes from system-reminder context, not model knowledge

**Notes / failures:**

---

### 19.2 System reminder — user identity

1. "What's my name?"
2. **Expected:** Agent knows display_name from the reminder context
3. "What's my email?"
4. **Expected:** Agent knows email from the reminder context
5. **Verify:** These work even with empty USER.md (system-reminder is separate from memory files)

**Notes / failures:**

---

### 19.3 CRM vocabulary injection

1. "What are my deal stages?"
2. **Expected:** Agent lists the correct stages from `<crm-vocabulary>` in platform instructions
3. "What contact types do I have?"
4. **Expected:** Agent lists contact types (buyer, seller, landlord, tenant, etc.)
5. **Verify:** Agent answers from context — no `describe_crm_schema` tool call (tool removed in v2)
6. Change CRM config (add a custom stage via Supabase), then ask again in a NEW thread
7. **Expected:** Agent reflects the updated config

**Notes / failures:**

---

### 19.4 System reminder — counts accuracy

1. Check current counts in Supabase (contacts, deals, tasks, todos, triggers, memory files)
2. "How many contacts, deals, and tasks do I have?"
3. **Expected:** Agent reports counts that match DB
4. Create a new contact via chat, then ask again
5. **Expected:** Counts update on the next turn

**Notes / failures:**

---

### 19.5 System reminder — connection state

1. If connections exist: "What services am I connected to?"
2. **Expected:** Agent can answer from reminder context without calling `list_users_connections`
3. **Verify:** Reminder output summarizes active connections as `X/Y tools active` and does NOT inline skill-file content

**Notes / failures:**

---

### 19.6 Memory file layering

1. Write something distinctive to USER.md: "I specialize in luxury condos in Sentosa Cove"
2. Start a NEW thread
3. "What do I specialize in?"
4. **Expected:** Agent knows about Sentosa Cove luxury condos (from USER.md in context)
5. Write to SOUL.md: "Always respond with enthusiasm about waterfront properties"
6. Start another NEW thread, ask about a property
7. **Expected:** Agent exhibits the persona trait from SOUL.md
8. **Verify in Langfuse:** The memory payload is injected as a user message after the system reminder, not appended to the system string

**Notes / failures:**

---

### 19.7 MEMORY.md truncation

1. Write a MEMORY.md with 250+ lines of content
2. Start a new thread
3. Ask about content on line 210 (beyond the 200-line cutoff)
4. **Expected:** Agent does NOT know this content (first 200 lines only are injected)
5. Ask about content on line 50
6. **Expected:** Agent DOES know this content

**Notes / failures:**

---

### 19.8 System reminder — XML escaping

1. Set display_name to something with special chars (e.g., `Test <script>alert('xss')</script>`)
2. Start a new thread, send any message
3. **Expected:** No errors, no XSS, agent still functions normally
4. **Verify:** system-reminder XML-escapes user-supplied data

**Notes / failures:**

---

### 19.9 System reminder — RPC fallback

1. (Requires DB manipulation) Temporarily break the `get_system_reminder_context` RPC (e.g., rename it)
2. Send a message
3. **Expected:** Agent still responds (fallback to zero counts, no crash)
4. **Expected:** Agent may not know exact counts but conversation works
5. Restore the RPC

**Notes / failures:**

---

### 19.10 Cache boundary placement

1. Start a fresh thread and ask: "What are my deal stages and how many active connections do I have?"
2. Send a follow-up in the same thread: "Answer again in one sentence."
3. **Verify in Langfuse:** The system string is identical across both turns
4. **Expected:** `<system-reminder>` appears as a user message, not inside the system prompt
5. **Expected:** Any memory payload appears after the reminder message and before conversation history

**Notes / failures:**

---

## Edge Cases

- [ ] Empty USER.md + SOUL.md + MEMORY.md — agent still works with platform instructions only
- [ ] Very large CRM vocabulary (20+ custom fields) — prompt size stays manageable
- [ ] 20+ active connections — connection summaries stay readable
- [ ] System-reminder with 0 todos, 0 triggers, 0 connections — all zero counts render cleanly
- [ ] Custom instructions (if feature exists) — injected in the stable system prefix
- [ ] Consecutive turns with unchanged setup — system string remains byte-for-byte stable

---

## Pass / Fail Criteria

- **Pass:** Agent knows current time, user identity, CRM vocabulary, and accurate counts from context. System-reminder is injected as a user message, memory payload stays outside the system string, and repeated turns keep a stable prompt prefix. MEMORY.md truncation at 200 lines works. XML escaping prevents injection. RPC fallback doesn't crash.
- **Fail:** Agent doesn't know the time or user name. CRM vocabulary goes stale after config change. Dynamic reminder or memory data leaks into the system string. Memory content is missing from context. System-reminder crashes on special characters. RPC failure crashes the agent.
