# QA Surface 25: Instruction Skills

> **PRs covered:** 51 (discovery + defaults + system prompt injection), 51a (frontend skills page + chat badge)
> **Dogfoodable:** Yes (frontend pages + chat interaction)
> **Time estimate:** 30-40 min manual

---

## Prerequisites

- Logged in with working chat
- Supabase dashboard open to check `agent-files` bucket under `{clientId}/skills/`
- Fresh client (or clear the `skills/` directory in Storage to test bootstrap)

---

## Dogfood Checklist (automated browser pass)

- [ ] `/skills` page loads without errors
- [ ] Skills list displays 7 default skills (if bootstrapped)
- [ ] Each skill card shows name + description + Edit button
- [ ] `/skills/call-prep` editor page loads without errors
- [ ] Textarea is populated with SKILL.md content
- [ ] Sidebar shows "Skills" in the AGENT section (where Mission Control was)
- [ ] `/mission-control` returns 404

---

## Manual QA Scenarios

### PR 51: Backend — Skill Discovery + Bootstrap + System Prompt

---

### 25.1 Default skills bootstrapped on first login

1. Create a new client (or clear `{clientId}/skills/` in Supabase Storage)
2. Open chat and send any message
3. Check Supabase Storage: `{clientId}/skills/`
4. **Expected:** 7 directories created: `call-prep`, `daily-briefing`, `draft-outreach`, `pipeline-review`, `opportunity-analysis`, `call-summary`, `market-briefing`
5. **Expected:** Each contains a `SKILL.md` file with valid YAML frontmatter

**Notes / failures:**

---

### 25.2 Bootstrap is idempotent

1. After 25.1, send another message in chat
2. Check Supabase Storage again
3. **Expected:** No duplicate files, no errors. Same 7 skills present.

**Notes / failures:**

---

### 25.3 Skills appear in system prompt

1. Open Langfuse and find a trace for a recent message
2. Inspect the system prompt
3. **Expected:** Contains `<available-skills>` block listing all 7 default skills
4. **Expected:** Each skill entry has name, description, and `read_file("...")` path
5. **Expected:** Block appears after `<working-memory>` and before `<compaction-summary>`

**Notes / failures:**

---

### 25.4 Agent loads skill on matching request

1. In chat: "What's on my plate today?"
2. **Expected:** Agent calls `read_file("/agent/skills/daily-briefing/SKILL.md")`
3. **Expected:** Agent then follows the skill's workflow (calls `search_crm` for tasks/deals)
4. **Expected:** Output matches the skill's format (priority-grouped action plan)

**Notes / failures:**

---

### 25.5 Agent loads call-prep skill

1. First create a CRM contact: "Add a contact named David Tan, he's looking for a 3BR in Bishan"
2. Then: "Prep me for my call with David Tan"
3. **Expected:** Agent calls `read_file("/agent/skills/call-prep/SKILL.md")`
4. **Expected:** Agent calls `search_crm` to find David Tan's history
5. **Expected:** Agent may call `web_search` for market context
6. **Expected:** Output includes talking points and CRM-grounded context

**Notes / failures:**

---

### 25.6 Agent does NOT load skill for unrelated requests

1. In chat: "What's the weather in Singapore?"
2. **Expected:** Agent does NOT call `read_file` on any skill
3. **Expected:** Agent answers normally (web search or general knowledge)

**Notes / failures:**

---

### 25.7 Agent creates a new skill via chat

1. In chat: "Save a skill for me. Whenever I close a deal, I want you to update the CRM to closed-won, log the final price, and remind me to ask for a Google review in 2 weeks."
2. **Expected:** Agent calls `write_file("/agent/skills/deal-closed/SKILL.md", ...)`
3. **Expected:** File has valid YAML frontmatter with name and description
4. Check Supabase Storage: `{clientId}/skills/deal-closed/SKILL.md` exists
5. Send another message — check system prompt in Langfuse
6. **Expected:** `<available-skills>` now lists 8 skills including `deal-closed`

**Notes / failures:**

---

### 25.8 Agent edits an existing skill via chat

1. In chat: "Update my call prep to always include competitor analysis"
2. **Expected:** Agent calls `read_file("/agent/skills/call-prep/SKILL.md")` then `write_file` with updated content
3. **Expected:** Updated SKILL.md in Storage contains the new instruction
4. **Expected:** Frontmatter still valid

**Notes / failures:**

---

### 25.9 Write protection — system skills

1. In chat: "Write 'test' to /agent/skills/system/creating-connections/SKILL.md"
2. **Expected:** Agent gets error: path is read-only
3. **Expected:** Agent does NOT overwrite the system skill

**Notes / failures:**

---

### 25.10 Write protection — connection skills

1. In chat: "Write 'test' to /agent/skills/connections/some-connection/SKILL.md"
2. **Expected:** Agent gets error: path is read-only

**Notes / failures:**

---

### 25.11 Subagents see skills

1. Set up a trigger that fires a subagent (or use an existing cron automation run)
2. Check the subagent's system prompt in Langfuse
3. **Expected:** Subagent's prompt includes `<available-skills>` block (same as main runner)

**Notes / failures:**

---

### 25.12 Existing skill systems unaffected

1. In chat: "How do I connect Gmail?"
2. **Expected:** Agent reads system skill `/agent/skills/system/creating-connections/SKILL.md` (via fallback)
3. **Expected:** Agent follows the connection creation flow as before PR 51
4. If a connection has a skill file, check system-reminder still shows the pointer

**Notes / failures:**

---

### PR 51a: Frontend — Skills Page + Editor + Chat Badge

---

### 25.13 Skills page — list view

1. Navigate to `/skills` via sidebar
2. **Expected:** Page title "Skills" with description text
3. **Expected:** 7 default skill cards displayed
4. **Expected:** Each card shows skill name, description, and [Edit] button
5. **Expected:** Cards are sorted alphabetically by slug

**Notes / failures:**

---

### 25.14 Skills page — empty state

1. Delete all skills from `{clientId}/skills/` in Supabase Storage (keep `system/` and `connections/`)
2. Navigate to `/skills`
3. **Expected:** Empty state message: "No skills yet. Ask your agent to create one..."
4. Re-send a chat message to re-bootstrap defaults

**Notes / failures:**

---

### 25.15 Skill editor — load and display

1. Click [Edit] on "call-prep" from the skills list
2. **Expected:** Navigates to `/skills/call-prep`
3. **Expected:** Textarea shows full SKILL.md content (frontmatter + body)
4. **Expected:** "← Back to skills" link present
5. **Expected:** "Save" and "Reset to default" buttons visible
6. **Expected:** Textarea uses monospace font

**Notes / failures:**

---

### 25.16 Skill editor — save valid content

1. On `/skills/call-prep`, edit the textarea (add a line to the workflow)
2. Click [Save]
3. **Expected:** Success message "Saved." appears
4. Navigate away and back to `/skills/call-prep`
5. **Expected:** Edit persisted — new line is still there
6. Check Supabase Storage — file content updated

**Notes / failures:**

---

### 25.17 Skill editor — save invalid frontmatter

1. On `/skills/call-prep`, delete the `---` frontmatter block entirely
2. Click [Save]
3. **Expected:** Error message containing "frontmatter" — content NOT saved
4. Navigate away and back
5. **Expected:** Original content still intact (save was rejected)

**Notes / failures:**

---

### 25.18 Skill editor — save empty name

1. On `/skills/call-prep`, change frontmatter to `name: ` (empty)
2. Click [Save]
3. **Expected:** Error message containing "name" — content NOT saved

**Notes / failures:**

---

### 25.19 Skill editor — save empty description

1. On `/skills/call-prep`, change frontmatter to `description: ` (empty)
2. Click [Save]
3. **Expected:** Error message containing "description" — content NOT saved

**Notes / failures:**

---

### 25.20 Skill editor — reset to default

1. On `/skills/call-prep`, make some edits and save them
2. Click [Reset to default]
3. **Expected:** Textarea immediately updates with the bundled default content
4. **Expected:** Success message "Reset to default."
5. **Expected:** Content in Storage matches the bundled default from `skill-templates.ts`

**Notes / failures:**

---

### 25.21 Skill editor — reset button only for defaults

1. Create a custom skill via chat (e.g., "deal-closed" from scenario 25.7)
2. Navigate to `/skills/deal-closed`
3. **Expected:** "Save" button visible
4. **Expected:** "Reset to default" button NOT visible (custom skill, not a bundled default)

**Notes / failures:**

---

### 25.22 Skill editor — back navigation

1. On `/skills/call-prep`, click "← Back to skills"
2. **Expected:** Navigates to `/skills` list page
3. **Expected:** List reflects any changes made (e.g., updated description from edited frontmatter)

**Notes / failures:**

---

### 25.23 Sidebar — Skills replaces Mission Control

1. Check the sidebar AGENT section
2. **Expected:** "Skills" link present (with document icon)
3. **Expected:** "Mission Control" NOT present
4. Click "Skills" — navigates to `/skills`
5. **Expected:** Active state shown on `/skills` and `/skills/*` routes

**Notes / failures:**

---

### 25.24 Sidebar — Mission Control gone

1. Navigate directly to `/mission-control`
2. **Expected:** 404 page

**Notes / failures:**

---

### 25.25 Chat badge — user skill triggers badge

1. In chat: "Prep me for my call with David Tan"
2. **Expected:** Agent loads the call-prep skill
3. **Expected:** A subtle badge/chip showing "call-prep" appears on the assistant message

**Notes / failures:**

---

### 25.26 Chat badge — system skill does NOT trigger badge

1. In chat: "How do I create a new connection?"
2. **Expected:** Agent reads system skill (creating-connections)
3. **Expected:** NO skill badge shown on the message

**Notes / failures:**

---

### 25.27 Chat badge — non-skill read_file does NOT trigger badge

1. In chat: "Read my memory file"
2. **Expected:** Agent calls `read_file("/agent/MEMORY.md")`
3. **Expected:** NO skill badge shown

**Notes / failures:**

---

### 25.28 Chat badge — connection skill does NOT trigger badge

1. If a connection skill exists (e.g., Gmail), trigger the agent to read it
2. **Expected:** NO skill badge — only user instruction skills get the badge

**Notes / failures:**

---

## Edge Cases

- [ ] Client with >20 custom skills — discovery still works, system prompt doesn't blow up
- [ ] Skill with very long description (>500 chars) — renders in list and system prompt
- [ ] Skill with special characters in name/description (colons, quotes, ampersands) — YAML parser handles correctly
- [ ] Skill created by agent with no frontmatter — agent gets write error (assertWritable allows, but discovery skips it)
- [ ] Two skills with the same slug (impossible via filesystem, but verify no duplicates in discovery)
- [ ] Concurrent chat sessions — both see the same skills
- [ ] Mobile/responsive — `/skills` page and editor usable on mobile viewport
- [ ] Skill file with Windows line endings (CRLF) — frontmatter parser handles correctly

---

## Pass / Fail Criteria

- **Pass:** 7 defaults bootstrapped on first login. Skills appear in system prompt. Agent discovers and follows skills on matching requests. Frontend lists, edits, validates, and resets skills. Chat badge appears for user skills only. System/connection skills unaffected. Write protection enforced.
- **Fail:** Bootstrap fails or is not idempotent. Skills missing from system prompt. Agent ignores available skills. Frontend crashes on save/reset. Invalid frontmatter saves silently. Badge appears on system/connection skill reads. Write to system/connection skills succeeds.
