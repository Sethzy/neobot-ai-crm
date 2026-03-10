# QA Surface 6: File & Memory System

> **PRs covered:** 7 (file tools), 13 (storage layout + SOUL/USER/MEMORY.md), 14 (memory system + memory page)
> **Dogfoodable:** Partial (memory page yes, file ops via chat)
> **Time estimate:** 25-30 min manual

---

## Prerequisites

- Logged in with a `clients` row
- Supabase Storage dashboard open to inspect `agent-files` bucket
- `/memory` page accessible
- Fresh user recommended (to test bootstrap) OR known memory state

---

## Dogfood Checklist (automated browser pass)

- [ ] `/memory` page loads without errors
- [ ] SOUL.md content is displayed and readable
- [ ] USER.md content is displayed
- [ ] MEMORY.md content is displayed
- [ ] Memory files section shows `memory/*.md` files (preferences.md, growth-plan.md, patterns.md, key-decisions.md)
- [ ] Inline editing is functional (edit button → textarea → save)
- [ ] Responsive: memory page works on mobile

---

## Manual QA Scenarios

### 6.1 Bootstrap on first login

1. Create a new user (or clear storage for existing user)
2. Log in
3. **Expected:** `/{clientId}/SOUL.md` exists in Supabase Storage with real estate persona template
4. **Expected:** `/{clientId}/USER.md` exists (empty template)
5. **Expected:** `/{clientId}/MEMORY.md` exists (empty template)
6. **Expected:** `/{clientId}/memory/` directory exists with 4 starter files:
   - `preferences.md`
   - `growth-plan.md`
   - `patterns.md`
   - `key-decisions.md`

**Notes / failures:**

---

### 6.2 Agent reads memory files

1. Manually edit `SOUL.md` via the `/memory` page — add a distinctive line like "Always end messages with 'Cheers!'"
2. Start a new chat thread
3. Send: "Hey, how are you?"
4. **Expected:** Agent's response style reflects the SOUL.md edit (ends with "Cheers!" or similar)
5. **Verify:** Agent personality matches the SOUL.md content

**Notes / failures:**

---

### 6.3 Agent writes to memory (MEM-05 rules)

1. In chat, say: **"I always prefer to communicate via WhatsApp, not email. Remember that."**
2. **Expected:** Agent acknowledges and writes to memory (likely `memory/preferences.md`)
3. Check `/memory` page — `preferences.md` should now contain the WhatsApp preference
4. Start a NEW thread
5. Say: "How should you reach out to my clients?"
6. **Expected:** Agent references the WhatsApp preference from memory

**Notes / failures:**

---

### 6.4 Agent writes USER.md

1. In chat, say: **"My name is Wei Ming, I work at PropNex, I specialize in District 9 and 10 condos."**
2. **Expected:** Agent writes this info to USER.md
3. Check `/memory` page — USER.md should contain the user profile info
4. New thread: "What do you know about me?"
5. **Expected:** Agent recalls name, agency, specialization from USER.md

**Notes / failures:**

---

### 6.5 File tools — write and read

1. In chat: "Write a note called 'showing-prep.md' with a checklist for preparing a property showing"
2. **Expected:** Agent calls `write_file` tool
3. **Expected:** Tool result shows success with the file path
4. In chat: "Read back the showing-prep.md file"
5. **Expected:** Agent calls `read_file` and displays the content
6. **Verify in Supabase Storage:** File exists at `/{clientId}/showing-prep.md` (or under a notes/ directory)

**Notes / failures:**

---

### 6.6 File tools — directory listing

1. In chat: "What files do I have?"
2. **Expected:** Agent calls `read_file` on root directory or uses appropriate tool
3. **Expected:** Returns a tree listing of the user's files

**Notes / failures:**

---

### 6.7 Memory page — inline editing

1. Go to `/memory`
2. Click edit on SOUL.md
3. Modify a line (e.g., change a personality trait)
4. Save
5. **Expected:** Save succeeds, updated content shown
6. **Verify in Supabase Storage:** File content matches the edit
7. Start a new chat — agent should reflect the edit

**Notes / failures:**

---

### 6.8 Memory page — view all memory files

1. Go to `/memory`
2. **Expected:** Can see and expand each memory file (preferences, growth-plan, patterns, key-decisions)
3. Click on `preferences.md`
4. **Expected:** Content shown (including WhatsApp preference from 6.3)
5. Edit `key-decisions.md` — add a test entry
6. Save
7. **Expected:** Persisted correctly

**Notes / failures:**

---

### 6.9 Memory shared across threads (MEM-06)

1. In Thread A, tell agent a preference: "I like detailed market reports, not summaries"
2. Agent writes to memory
3. In Thread B (new thread), ask: "Generate a market update for District 10"
4. **Expected:** Agent produces a detailed report (not a summary), reflecting the cross-thread memory

**Notes / failures:**

---

### 6.10 Agent creates new memory files (PR 14)

1. In chat: "I have a unique approach to prospecting — I always door-knock on weekends and follow up with a handwritten note on Monday"
2. **Expected:** Agent recognizes this doesn't fit existing memory files and either:
   - Creates a new `memory/prospecting.md` file, OR
   - Writes to `patterns.md` or `preferences.md`
3. Check `/memory` page for the new content

**Notes / failures:**

---

## Edge Cases

- [ ] MEMORY.md > 200 lines — only first 200 loaded into context (verify by checking system prompt size)
- [ ] Write file with nested path (e.g., "notes/2026/march/showing.md") — directories created
- [ ] Read non-existent file — graceful error message from agent
- [ ] Concurrent edits — edit via /memory while agent is writing — no corruption
- [ ] Special characters in file content (Markdown, code blocks, unicode) — preserved
- [ ] Empty memory files — agent handles gracefully, doesn't error on empty content

---

## Pass / Fail Criteria

- **Pass:** Bootstrap creates all expected files. Agent reads/writes memory and files correctly. Memory persists across threads and sessions. Memory page allows viewing and editing. Agent personality reflects SOUL.md.
- **Fail:** Bootstrap missing files, agent doesn't recall memory across sessions, file writes fail, memory page can't save edits, USER.md/SOUL.md changes don't affect agent behavior.
