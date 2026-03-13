# QA Surface 19: System Prompt & Reminders

> **PRs covered:** 15 (platform instructions, system-reminder), 15c (CRM vocabulary injection), 22 (context recovery), 22c (context management alignment)
> **Dogfoodable:** No (invisible backend — test via chat behavior)
> **Time estimate:** 20-25 min manual
> **Components:** `system-prompt.ts`, `system-reminder.ts`, `context.ts`, `platform-instructions.ts`

---

## Prerequisites

- Logged in with CRM data (contacts, deals, tasks)
- USER.md and SOUL.md populated (Surface 6)
- At least one active trigger (Surface 8) and one connection (Surface 10) if possible
- Supabase dashboard open for verification

---

## What This Tests

The agent's context is assembled from 7 layers before every turn. This surface verifies that layering is correct, system reminders contain accurate data, and the agent behaves correctly when context components are missing or degraded.

**7-layer assembly order:**
1. Platform-level operational instructions (`platform-instructions.ts`)
2. Core system prompt (`system-prompt.ts`)
3. Custom instructions (if provided)
4. SOUL.md (agent persona)
5. USER.md (user profile)
6. MEMORY.md (first 200 lines)
7. System reminder (per-turn dynamic context)

---

## Manual QA Scenarios

### 19.1 System reminder — time awareness

1. In chat: "What time is it right now?"
2. **Expected:** Agent reports correct current time (from system-reminder UTC injection)
3. "What's today's date?"
4. **Expected:** Correct date (system clock, not training cutoff)
5. **Verify:** Time comes from system-reminder `<current-time>` tag, not model knowledge

**Notes / failures:**

---

### 19.2 System reminder — user identity

1. "What's my name?"
2. **Expected:** Agent knows display_name from system-reminder `user display name` slot
3. "What's my email?"
4. **Expected:** Agent knows email from system-reminder
5. **Verify:** These work even with empty USER.md (system-reminder is separate from memory files)

**Notes / failures:**

---

### 19.3 System reminder — CRM vocabulary injection

1. "What are my deal stages?"
2. **Expected:** Agent lists the correct stages from `<crm-vocabulary>` tag in system-reminder
3. "What contact types do I have?"
4. **Expected:** Agent lists contact types (buyer, seller, landlord, tenant, etc.)
5. **Verify:** Agent answers from context — no `describe_crm_schema` tool call (tool removed in v2)
6. Change CRM config (add a custom stage via Supabase), then ask again in a NEW thread
7. **Expected:** Agent reflects the updated config (system-reminder is rebuilt per-turn)

**Notes / failures:**

---

### 19.4 System reminder — counts accuracy

1. Check current counts in Supabase (contacts, deals, tasks, todos, triggers, memory files)
2. "How many contacts, deals, and tasks do I have?"
3. **Expected:** Agent reports counts that match DB (from system-reminder aggregate injection)
4. Create a new contact via chat, then ask again
5. **Expected:** Counts update on next turn (system-reminder is rebuilt each turn)

**Notes / failures:**

---

### 19.5 System reminder — connection state

1. If connections exist: "What services am I connected to?"
2. **Expected:** Agent can answer from system-reminder `<connections>` slot without calling `list_users_connections`
3. **Verify:** System-reminder includes active connections with tool counts and skill file pointers

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

## Edge Cases

- [ ] Empty USER.md + SOUL.md + MEMORY.md — agent still works with platform instructions only
- [ ] Very large CRM vocabulary (20+ custom fields) — system-reminder doesn't bloat excessively
- [ ] 20+ active connections — connection state in system-reminder stays manageable
- [ ] System-reminder with 0 todos, 0 triggers, 0 connections — all zero counts render cleanly
- [ ] Custom instructions (if feature exists) — injected between system prompt and SOUL.md

---

## Pass / Fail Criteria

- **Pass:** Agent knows current time, user identity, CRM vocabulary, and accurate counts from system-reminder. Memory files (SOUL.md, USER.md, MEMORY.md) are injected in correct order. MEMORY.md truncation at 200 lines works. XML escaping prevents injection. RPC fallback doesn't crash.
- **Fail:** Agent doesn't know the time or user name. CRM vocabulary stale after config change. Memory content missing from context. System-reminder crash on special characters. RPC failure crashes the agent.
