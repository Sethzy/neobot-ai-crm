---
name: ship-feature
description: After shipping a feature, update QA coverage (surface file + automated scenarios + tracker) and mark the PR as done in the v2 plan. Use when a feature PR is complete and committed. Invoke with PR number(s), e.g. "/ship-feature 51,51a".
---

# Ship Feature — QA + Plan Bookkeeping

After a feature PR is committed, ensure QA coverage exists and the v2 plan is up to date.

**Announce at start:** "I'm using the ship-feature skill to update QA coverage and the v2 plan."

## Inputs

The user provides one or more PR identifiers (e.g., `51`, `51,51a`, `42a-pdf`).

## The Process

### Step 1: Read the v2 Plan

Read `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`.

For each PR provided:
- Find the PR entry in the plan
- Extract: `title`, `tasks`, `testCriteria`, `status`, tool names mentioned in tasks
- If the PR entry doesn't exist, warn the user and ask whether to add it

### Step 2: Update PR Status

For each PR where `status` is not already `"done"`:
- Set `"status": "done"`
- Set all tasks to `"done": true`
- Increment `meta.donePRs` count
- Update `meta.updated` with today's date and a short description

### Step 3: Match to QA Surface

Read all existing QA surface files in `docs/qa/` (just the headers — first 6 lines of each).

**Auto-match logic:** Check each surface's `PRs covered:` line. If the PR number appears there, that's the target surface.

**If no match found:**
1. Check if the feature logically belongs in an existing surface (e.g., a new CRM tool belongs in surface 03)
2. If yes, propose adding to that surface
3. If no, create a new surface with the next available number

**Ask the user to confirm** the surface assignment before writing.

### Step 4: Write/Update QA Surface File

Follow the exact format from existing surfaces. Every QA surface file has this structure:

```markdown
# QA Surface {NN}: {Name}

> **PRs covered:** {PR list}
> **Dogfoodable:** Yes/No/Partial
> **Time estimate:** {X-Y} min manual

---

## Prerequisites

- {setup requirements}

---

## Dogfood Checklist (automated browser pass)

- [ ] {quick automated checks}

---

## Manual QA Scenarios

### {NN.1} {Scenario title}

1. {Step-by-step user action}
2. **Expected:** {outcome}
3. **Verify in Supabase:** {DB check if applicable}

**Notes / failures:**

---

{... more scenarios ...}

## Edge Cases

- [ ] {edge case}

---

## Pass / Fail Criteria

- **Pass:** {success conditions}
- **Fail:** {failure conditions}
```

**When updating an existing surface:**
- Add the new PR number to the `PRs covered:` line
- Add a section header for the PR (e.g., `### PR 51a: Frontend — Skills Page`)
- Append new scenarios after existing ones, continuing the numbering
- Add new edge cases to the edge cases section
- Update pass/fail criteria to include new functionality

**When creating a new surface:**
- Use the full template above
- Number scenarios as `{NN}.1`, `{NN}.2`, etc.

**Scenario authoring rules:**
- Each scenario tests ONE user-visible behavior
- Steps are numbered, written as user actions
- Every scenario has an `**Expected:**` line
- Include Supabase/Langfuse verification where the behavior touches the DB or agent
- Group scenarios by PR when a surface covers multiple PRs
- 5-15 scenarios per surface is the sweet spot

### Step 5: Add Automated Scenarios

Read `scripts/qa/scenarios.ts` to understand the existing format and surface naming convention.

Add new `QaScenario` entries for the feature. Each entry needs:

```typescript
{
  surface: "{NN}-{slug}",        // e.g., "25-instruction-skills"
  scenario: "{kebab-case-name}", // e.g., "skill-bootstrap"
  prompt: "{realistic user message}",
  expectedTools: ["{tool_name}"],
  sequential: true/false,
  notes: "{what should happen and why}",
  // Optional:
  tokenBudget?: number,
  latencyBudgetMs?: number,
  expectedOutput?: "regex pattern",
}
```

**Rules for automated scenarios:**
- Only add scenarios that are **chat-testable** (the user sends a message, the agent does something)
- Frontend-only features (page loads, UI interactions) go in the surface file only, NOT in scenarios.ts
- Use realistic prompts that a real estate agent would actually type
- `sequential: true` means this scenario depends on the previous one in the same surface (shares thread)
- `sequential: false` starts a fresh thread
- `expectedTools` should list the minimum required tools (extras are OK)
- Add `// TODO: verify expectedTools` comment on any scenario where you're uncertain
- Keep new scenarios grouped together, inserted after the last scenario of the same surface (or at the end if new surface)

**How many automated scenarios to add:**
- 1 per tool the feature introduces or modifies
- 1 for the "happy path" end-to-end flow
- 1 for the most important edge case (if chat-testable)
- Skip UI-only, mobile-only, and approval-gated scenarios

### Step 6: Update Tracker

Read `docs/qa/tracker.json`.

**If the surface already exists in the tracker:** No change needed (status stays as-is until QA is run).

**If this is a new surface:** Add an entry:

```json
{ "id": "{NN}", "name": "{Surface Name}", "status": "pending", "lastRun": null, "report": null }
```

Update `lastUpdated` at the top level to today's ISO timestamp.

### Step 7: Summary

Present a concise summary:

```
Ship-feature complete for PR {N}:

v2 plan:
- PR {N} status → done ({title})

QA surface:
- {Created/Updated} docs/qa/{NN}-{slug}.md
- {X} manual scenarios added ({NN}.{first}–{NN}.{last})

Automated scenarios:
- {Y} scenarios added to scripts/qa/scenarios.ts
- Surface: {NN}-{slug}

Tracker:
- {Updated/Added entry for} surface {NN}

TODOs (if any):
- {scenarios marked with TODO}
```

## When to Stop and Ask

- **PR not in v2 plan:** Ask whether to add it or skip plan update
- **Surface assignment ambiguous:** Show the user the candidate surfaces and ask
- **Feature is frontend-only:** Confirm that no automated scenarios are needed (surface file only)
- **Feature introduces a new tool:** Double-check the tool name against `src/lib/runner/tools/`

## Common Mistakes

**Writing scenarios for non-chat-testable features**
- Board views, calendar views, quick edit — these are browser-testable, not chat-testable
- They go in the surface file's Dogfood Checklist and Manual QA sections only

**Forgetting sequential dependencies**
- If scenario B needs data from scenario A, mark B as `sequential: true`
- Put A before B in the array

**Wrong surface slug format**
- Match existing convention: `"03-crm-tools"` not `"03-crm-tools-via-chat"`
- Check existing slugs in scenarios.ts before inventing a new one

**Over-generating scenarios**
- Not every manual QA scenario needs an automated counterpart
- Focus on tool-call verification, not UI rendering
