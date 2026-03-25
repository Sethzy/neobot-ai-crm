# QA Surface 29: Sandbox (Code Execution)

> **PRs covered:** 52 (analyze_spreadsheet — Sprites + Excel), 53 (publish_artifact — showcase pages), 52a (sandbox workflow skills — outer + inner), 54a (async execution — webhook + cron delivery), 55 (general escape hatch — execute_in_sandbox, per-client Sprites, auto-queue, 7 skills)
> **Dogfoodable:** Partial (requires SPRITES_TOKEN + ANTHROPIC_API_KEY env vars, real Fly.io Sprites)
> **Time estimate:** 40-50 min manual
> **v2 tools:** `execute_in_sandbox`

---

## Prerequisites

- `SPRITES_TOKEN` configured (Fly.io Sprites API token)
- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` configured (for Claude Code CLI inside Sprite)
- `HERENOW_API_KEY` configured (for publish_website skill)
- At least one xlsx/csv file available for upload
- A deal in CRM with property details (for showcase page data gathering)

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat composer accepts .xlsx and .csv file uploads
- [ ] Sandbox tool output appears in chat with download links
- [ ] Download links are clickable and download valid files
- [ ] "Working on it" message appears immediately (async, non-blocking)
- [ ] Result delivered via Realtime (no page refresh needed)

---

## Manual QA Scenarios

### PR 55: execute_in_sandbox (general tool)

### 29.1 PDF report generation

1. Say: "Generate a PDF market report for District 10 condos"
2. **Expected:** Agent gathers CRM/web data, calls `execute_in_sandbox` with `skills: ["pdf_creation"]`
3. **Expected:** "Working on it" message appears immediately
4. **Expected:** After 2-5 min, result message with PDF download link
5. **Verify:** Downloaded PDF has proper formatting, charts, content
6. **Verify in Supabase:** `sprite_sessions` row exists for this client (not thread), `sprite_jobs` row with `job_type: "sandbox"`

**Notes / failures:**

---

### 29.2 Excel spreadsheet analysis

1. Upload a property deals spreadsheet (.xlsx with 3+ properties)
2. Say: "Build me a comparison model for these properties"
3. **Expected:** Agent calls `execute_in_sandbox` with `skills: ["excel_editing", "re-analyst"]`
4. **Verify:** Downloaded .xlsx has live Excel formulas, not hardcoded values
5. **Verify in Langfuse:** read_file call for deal-comparison SKILL.md before execute_in_sandbox

**Notes / failures:**

---

### 29.3 Word document generation

1. Say: "Write a thank-you letter to John Chen as a Word doc for choosing us as their agent"
2. **Expected:** Agent calls `execute_in_sandbox` with `skills: ["docx_editing"]`
3. **Verify:** Downloaded .docx opens in Word/Google Docs with formatted content

**Notes / failures:**

---

### 29.4 PDF form filling

1. Upload a PDF form (e.g. a property option-to-purchase form)
2. Say: "Fill in this form with the details from the Marina Bay deal"
3. **Expected:** Agent gathers CRM data first, then calls `execute_in_sandbox` with `skills: ["pdf_form_filling"]`
4. **Verify:** Downloaded PDF has filled fields

**Notes / failures:**

---

### 29.5 Property showcase page — publish to here.now

1. Say: "Build me a property showcase page for the Marina Bay listing that I can share"
2. **Expected:** Agent gathers CRM data + photos, calls `execute_in_sandbox` with `skills: ["publish_website", "frontend-design"]`
3. **Expected:** Result message contains a live here.now URL
4. **Verify:** URL loads in browser with property details, photos, contact card

**Notes / failures:**

---

### 29.6 Follow-up edit on showcase page

1. After 29.5, say: "Change the hero photo and add more whitespace"
2. **Expected:** Agent calls `execute_in_sandbox` again, publishes to same here.now slug
3. **Verify:** Same URL, updated layout

**Notes / failures:**

---

### 29.7 Per-client Sprite reuse across threads

1. In Thread A, request a PDF report (triggers Sprite creation)
2. In Thread B (different thread, same client), request a Word doc
3. **Expected:** Same Sprite reused (check `sprite_sessions` — one row per client)
4. **Verify:** Thread B's job starts fast (no package re-install)

**Notes / failures:**

---

### 29.8 Auto-queue for concurrent jobs

1. Request a PDF report (starts running)
2. While it's running, request a Word doc in a different thread
3. **Expected:** Second job returns "Queued — I'll start once the current job finishes"
4. **Expected:** After first job completes, second job auto-starts with "Starting your docx_editing task now"
5. **Verify in Supabase:** `sprite_jobs` shows first job `completed`, second job `queued` → `starting` → `running` → `completed`

**Notes / failures:**

---

### PR 54a: Async execution

### 29.9 Non-blocking tool return

1. Request any sandbox task (e.g. "Build me a PDF report")
2. **Expected:** Tool returns "Working on it" within 5-10 seconds
3. **Expected:** Chat remains interactive while sandbox job runs in background
4. **Verify:** Can send other messages while job is running

**Notes / failures:**

---

### 29.10 Webhook delivery

1. Complete a sandbox job
2. **Verify:** Result appears in chat within seconds of job completion (webhook path)
3. **Verify in Supabase:** `sprite_jobs.claimed_by = "webhook"` (not "cron")

**Notes / failures:**

---

### 29.11 Cron fallback delivery

1. Temporarily break the webhook (e.g. wrong SANDBOX_CALLBACK_SECRET)
2. Request a sandbox task
3. **Expected:** Result still appears within ~60 seconds (cron fallback)
4. **Verify in Supabase:** `sprite_jobs.claimed_by = "cron"`

**Notes / failures:**

---

### PR 52a: Skill orchestration

### 29.12 Deal-comparison skill triggers data gathering

1. Say: "Which of my pipeline properties is the best deal? Compare them side by side."
2. **Expected:** Agent reads deal-comparison skill, searches CRM, then calls `execute_in_sandbox` with `skills: ["excel_editing", "re-analyst"]`
3. **Verify in Langfuse:** read_file call for deal-comparison SKILL.md, then search_crm, then execute_in_sandbox

**Notes / failures:**

---

### 29.13 Companion skills provide domain context

1. Set re-analyst preferences: "My mortgage is 3.2% fixed, minimum yield I accept is 3%"
2. Then upload xlsx and say: "Analyze this deal"
3. **Expected:** Excel model reflects 3.2% mortgage rate and 3% yield benchmark
4. **Verify:** re-analyst SKILL.md was synced to Sprite (preferences applied)

**Notes / failures:**

---

### 29.14 QUESTION: prefix handling

1. Request an ambiguous sandbox task: "Make me a report" (no details)
2. **Expected (one of two):** Agent either asks for clarification before calling sandbox, OR sandbox returns a QUESTION: prefix asking for details
3. **Verify:** User is not left with incorrect output from ambiguous input

**Notes / failures:**

---

## Edge Cases

- [ ] Sandbox tool called when SPRITES_TOKEN is missing — should return graceful error, not crash
- [ ] Very large xlsx upload (>5MB) — should handle without timeout
- [ ] Sprite hibernation recovery after long gap (>1 hour) — should wake cleanly
- [ ] Per-client Sprite reuse across threads — one Sprite per client, not per thread
- [ ] Stale Sprite recovery — if stored Sprite is destroyed, new one is created and session row is rebound
- [ ] Failed URL input download — job should fail with error message, not run with partial inputs
- [ ] Launch failure — job should be marked failed, not stranded in "starting"
- [ ] User asks to analyze without any data — agent should ask for files or search CRM, not call sandbox empty
- [ ] 30-day cleanup sweep — inactive Sprites destroyed after 30 days (not 7)

---

## Pass / Fail Criteria

- **Pass:** execute_in_sandbox returns downloadable artifacts (PDF, xlsx, docx, pptx); publish_website returns working here.now URL; per-client Sprite reused across threads; auto-queue works for concurrent jobs; async delivery via webhook + cron fallback; workflow skills trigger proper data gathering; companion skills provide domain context
- **Fail:** Sandbox tool crashes or times out; artifacts have wrong format; Sprite sessions leak (multiple per client); queued jobs stranded; result never delivered; agent calls sandbox without gathering data first; stale Sprite not recovered
