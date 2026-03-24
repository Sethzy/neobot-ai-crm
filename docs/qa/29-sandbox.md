# QA Surface 29: Sandbox (Code Execution)

> **PRs covered:** 52 (analyze_spreadsheet — Sprites + Excel), 53 (publish_artifact — showcase pages), 52a (sandbox workflow skills — outer + inner)
> **Dogfoodable:** Partial (requires SPRITES_TOKEN + ANTHROPIC_API_KEY env vars, real Fly.io Sprites)
> **Time estimate:** 30-40 min manual
> **v2 tools:** `analyze_spreadsheet`, `publish_artifact`

---

## Prerequisites

- `SPRITES_TOKEN` configured (Fly.io Sprites API token)
- `ANTHROPIC_API_KEY` configured (for Claude Code CLI inside Sprite)
- At least one xlsx/csv file available for upload
- A deal in CRM with property details (for showcase page data gathering)

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat composer accepts .xlsx and .csv file uploads
- [ ] Sandbox tools appear in tool output rendering when invoked
- [ ] Download links in chat messages are clickable and download valid files
- [ ] Preview URLs returned by publish_artifact are accessible in browser

---

## Manual QA Scenarios

### PR 52: analyze_spreadsheet

### 29.1 Upload xlsx and request analysis

1. Upload a property deals spreadsheet (.xlsx with 3+ properties)
2. Say: "Build me a comparison model for these properties"
3. **Expected:** Agent calls `analyze_spreadsheet`, returns download link + summary
4. **Verify:** Downloaded .xlsx has live Excel formulas (not hardcoded values), blue inputs, black formulas
5. **Verify in Supabase:** `sprite_sessions` row created for this thread

**Notes / failures:**

---

### 29.2 Multi-turn iteration on same Sprite

1. After 29.1, say: "Add a sensitivity table for mortgage rates 2.5% to 4.5%"
2. **Expected:** Agent calls `analyze_spreadsheet` again, Sprite wakes from sleep, returns updated model
3. **Verify:** New download link, sensitivity table present in workbook
4. **Verify:** Same Sprite name used (check `sprite_sessions` — no new row)

**Notes / failures:**

---

### 29.3 Analysis without file upload

1. In a new thread, say: "Compare the two condos in my pipeline — which is the better investment?"
2. **Expected:** Agent searches CRM first (search_crm), gathers data, then calls `analyze_spreadsheet`
3. **Verify:** Agent follows gather-first pattern (CRM before sandbox)

**Notes / failures:**

---

### 29.4 Formula verification via recalc

1. Upload a spreadsheet and request: "Build a net yield calculator for this listing"
2. **Expected:** Summary mentions formula verification passed (recalc.py)
3. **Verify:** No #DIV/0!, #REF!, or #NAME? errors in downloaded xlsx

**Notes / failures:**

---

### PR 53: publish_artifact

### 29.5 Property showcase page — happy path

1. Say: "Build me a showcase page for the Marina Bay listing"
2. **Expected:** Agent gathers data from CRM, searches web for neighborhood info, then calls `publish_artifact`
3. **Verify:** Live preview URL returned, page loads in browser with property details + photos + contact card

**Notes / failures:**

---

### 29.6 Iterate on showcase page

1. After 29.5, say: "Make the cards bigger and add more whitespace"
2. **Expected:** Agent calls `publish_artifact` again, same Sprite, preview URL updates
3. **Verify:** Same URL, updated layout

**Notes / failures:**

---

### 29.7 Ship-it — publish final artifact

1. After 29.6, say: "Looks good, ship it"
2. **Expected:** Agent calls `publish_artifact` with shipIt=true, returns a 30-day signed URL
3. **Verify:** Signed URL is different from preview URL and loads the final static page

**Notes / failures:**

---

### PR 52a: Sandbox Workflow Skills

### 29.8 Deal-comparison skill triggers data gathering

1. Say: "Compare these 3 condos — which is the best deal?" (with xlsx attached)
2. **Expected:** Agent reads deal-comparison skill, searches CRM + web, then hands off to analyze_spreadsheet
3. **Verify in Langfuse:** read_file call for deal-comparison SKILL.md before sandbox tool call

**Notes / failures:**

---

### 29.9 Property-showcase skill triggers full data pipeline

1. Say: "Build a marketing page for the Noriega listing"
2. **Expected:** Agent reads property-showcase skill, gathers CRM data + SOUL.md + web search + photos, then calls publish_artifact
3. **Verify in Langfuse:** Multiple tool calls before publish_artifact (search_crm, read_file, web_search)

**Notes / failures:**

---

### 29.10 Inner skills loaded by sandbox

1. Set up re-analyst preferences: "My mortgage is 3.2% fixed, minimum yield I accept is 3%"
2. Then upload xlsx and say: "Analyze this deal"
3. **Expected:** Agent writes/updates re-analyst SKILL.md, then analyze_spreadsheet uses those preferences
4. **Verify:** Excel model reflects 3.2% mortgage rate and 3% yield benchmark, not defaults

**Notes / failures:**

---

### 29.11 Market-report skill routes to analyze_spreadsheet

1. Say: "Give me a market report for District 10 condos this year"
2. **Expected:** Agent gathers web data (transactions, prices), then calls analyze_spreadsheet
3. **Verify:** Downloaded xlsx has charts and market data tables

**Notes / failures:**

---

## Edge Cases

- [ ] Sandbox tool called when SPRITES_TOKEN is missing — should return graceful error, not crash
- [ ] Very large xlsx upload (>5MB) — should handle without timeout
- [ ] Sprite hibernation recovery after long gap (>1 hour) — should wake cleanly
- [ ] Multiple threads with active Sprites — each thread gets its own Sprite
- [ ] User asks to analyze without any data — agent should ask for files or search CRM, not call sandbox empty

---

## Pass / Fail Criteria

- **Pass:** analyze_spreadsheet returns downloadable xlsx with live formulas; publish_artifact returns working preview URL; multi-turn iteration reuses same Sprite; workflow skills trigger proper data gathering before sandbox calls
- **Fail:** Sandbox tool crashes or times out; formulas are hardcoded values; preview URL unreachable; agent calls sandbox without gathering data first; Sprite sessions leak (not cleaned up)
