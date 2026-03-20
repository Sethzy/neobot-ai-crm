# PR 38d: Skill-Based Onboarding (Dorabot Pattern)

> **Replaces:** PR 38 tasks 8-13 (conversational onboarding flow)
> **Does NOT touch:** PR 38 tasks 1-7 (auth funnel — already shipped)
> **Reference implementation:** `/Users/sethlim/Documents/dorabot-1/skills/onboard/SKILL.md`

---

## Reference Analysis: Dorabot Onboarding Patterns

### What dorabot does (and we're copying)

1. **Onboarding is a skill file, not infrastructure.** One `SKILL.md`, zero DB tables, zero system prompt injection. The agent reads the skill and follows it.
2. **Three phases:** learn user (→ USER.md) → craft soul (→ SOUL.md) → confirm.
3. **`AskUserQuestion` for every question.** Structured clickable options, not prose questions.
4. **Online research.** Offers to look up user on LinkedIn/Twitter/GitHub to pre-fill info.
5. **Show drafts, iterate.** Agent shows USER.md and SOUL.md to user during the conversation.
6. **SOUL.md is 5-10 lines.** "This isn't a constitution, it's a personality sketch."
7. **File state = onboarding state.** If USER.md has real content, you're onboarded. No DB flag.
8. **Agent writes SOUL.md.** No read-only restriction.

### Dorabot skill file (verbatim reference)

```
File: /Users/sethlim/Documents/dorabot-1/skills/onboard/SKILL.md
```

Key elements to copy:
- YAML frontmatter: `name`, `description` with trigger phrases
- "before you start" — read existing files, acknowledge, ask update vs fresh
- "how to ask questions" — AskUserQuestion with example format
- "phase 1: learn about the user" — online lookup offer, 3-4 rounds max, write USER.md, show draft
- "phase 2: craft the soul" — tone/opinions/verbosity/boundaries/vibe, 2-3 rounds, write SOUL.md, show draft
- "phase 3: confirm" — one-liner summaries, remind files are editable
- "rules" — ≤20 lines SOUL.md, handle "skip", update vs overwrite existing

### Where we drift (with reasons)

| # | Drift | Reason |
|---|-------|--------|
| 1 | Paths use `/agent/` prefix | SaaS — agent sees `/agent/SOUL.md` not `~/.dorabot/workspace/SOUL.md` |
| 2 | `ask_user_question` options are string labels | Our schema: `options: string[]`. Dorabot: `options: [{label, description}]`. Adapt skill instructions. |
| 3 | No `header` field on questions | Our AskUserQuestion doesn't have it. Drop from skill instructions. |
| 4 | Max 3 questions per call (dorabot: 4) | Our schema: `.max(3)`. Skill says "up to 3 questions" instead of 4. |
| 5 | Skill bootstraps to Supabase Storage | Dorabot loads from disk. We upload via `skill-bootstrap.ts` on first run. |
| 6 | System prompt hint for empty USER.md | Dorabot uses autonomous pulse detection. We add one line to system prompt. |
| 7 | `write_file` / `edit_file` instead of `Write` / `Edit` | Our agent tools use different names. Adapt examples in skill. |
| 8 | USER.md structure adds advisory-sales context | Dorabot's template has "tools & preferences" for dev context. We swap for Goals/Context/Communication matching our DEFAULT_USER_MD. |

### What we delete from PR 38

- `setup_progress` DB dependency (tasks 8-13 no longer need it)
- Bootstrap system prompt injection logic (never built)
- Completion tracking / fallback heuristic (never built)
- OpenClaw comparison doc references to real estate (outdated)

---

## Files to touch

| File | Change |
|------|--------|
| `src/lib/storage/agent-files.ts` | Remove SOUL.md read-only restriction |
| `src/lib/runner/skills/skill-templates.ts` | Add onboarding skill content + add to DEFAULT_SKILL_SLUGS |
| `src/lib/ai/system-prompt.ts` | Update `<memory-system>` — SOUL.md writable, empty USER.md hint |
| `src/lib/storage/__tests__/agent-files.test.ts` | Update tests for SOUL.md writability |
| `src/lib/runner/skills/__tests__/skill-templates.test.ts` | Add test for onboarding skill frontmatter |
| `docs/qa/13-onboarding.md` | Simplify QA surface for skill-based approach |
| `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` | Add PR 38d, update PR 38 tasks 8-13 |

---

## Task 1: Unlock SOUL.md for agent writes

**What:** Remove the read-only restriction on SOUL.md so the agent can write to it during onboarding.

**Why:** Dorabot's onboarding writes SOUL.md directly. Our agent currently can't — `assertWritable()` throws on SOUL.md.

### 1a. Write failing test

**File:** `src/lib/storage/__tests__/agent-files.test.ts`

Find the existing test that asserts SOUL.md is read-only and update it to assert SOUL.md is writable. If no test file exists, check for tests in `src/lib/storage/` or create one.

Look for a test like:
```typescript
it("rejects writes to SOUL.md", () => {
  expect(() => assertWritable("SOUL.md")).toThrow();
});
```

Change to:
```typescript
it("allows writes to SOUL.md", () => {
  expect(() => assertWritable("SOUL.md")).not.toThrow();
});
```

Run: `npx vitest run src/lib/storage --reporter=verbose`
Expected: FAIL (SOUL.md is still read-only)

### 1b. Remove SOUL.md restriction

**File:** `src/lib/storage/agent-files.ts`

Remove lines 53-55 (the SOUL.md guard):

```typescript
// REMOVE THIS:
if (normalizedPath === ROOT_SOUL_PATH) {
  throw new Error(`Path "${normalizedPath}" is read-only and cannot be modified by the agent.`);
}
```

Also remove the `ROOT_SOUL_PATH` constant on line 8 if no longer used:

```typescript
// REMOVE THIS (if unused after the guard removal):
const ROOT_SOUL_PATH = "SOUL.md";
```

Run: `npx vitest run src/lib/storage --reporter=verbose`
Expected: PASS

### 1c. Verify no other code depends on SOUL.md being read-only

Search for `ROOT_SOUL_PATH` and `read-only` references:

```bash
rg "ROOT_SOUL_PATH|SOUL.*read.only" src/
```

If any other code references the read-only behavior, update accordingly.

---

## Task 2: Update system prompt — SOUL.md writable + empty USER.md detection

**What:** Update two sections in the system prompt to reflect the new onboarding approach.

### 2a. Update SOUL.md guidance in `<memory-system>`

**File:** `src/lib/ai/system-prompt.ts`

Find this line in the `<memory-system>` section:
```
- /agent/SOUL.md — your personality and identity (read-only, do not attempt to modify)
```

Replace with:
```
- /agent/SOUL.md — your personality and identity (update during onboarding or when the user explicitly asks to change your personality)
```

### 2b. Add empty USER.md detection hint

**File:** `src/lib/ai/system-prompt.ts`

At the end of the `<memory-system>` section, before the closing `</memory-system>` tag, add:

```
If USER.md fields are mostly empty (Name, Timezone, Goals all blank), you haven't met this user yet. Read the onboarding skill and follow it to introduce yourself and learn about them.
```

### 2c. Run system prompt tests

```bash
npx vitest run src/lib/ai --reporter=verbose
```

Expected: PASS (or update snapshot tests if applicable)

---

## Task 3: Add onboarding skill to default skills

**What:** Add the onboarding skill content to `skill-templates.ts` and include it in the bootstrap list.

### 3a. Add "onboarding" to DEFAULT_SKILL_SLUGS

**File:** `src/lib/runner/skills/skill-templates.ts`

Update the `DEFAULT_SKILL_SLUGS` array (line ~15):

```typescript
export const DEFAULT_SKILL_SLUGS = [
  "onboarding",    // ← ADD THIS (first, so it's prominent)
  "call-prep",
  "daily-briefing",
  "draft-outreach",
  "pipeline-review",
  "opportunity-analysis",
  "call-summary",
  "market-briefing",
] as const;
```

### 3b. Add onboarding skill content

**File:** `src/lib/runner/skills/skill-templates.ts`

Add the following entry to `DEFAULT_SKILL_CONTENT` (at the top, before "call-prep"):

```typescript
  "onboarding": `---
name: onboarding
description: "Personalize the agent — interview the user to build their profile (USER.md) and craft the agent's personality (SOUL.md). Triggered by 'onboard', 'personalize', 'set up my personality', 'customize sunder', etc."
---

# Onboard — Agent Personalization

You're setting up for a new user (or re-personalizing for an existing one). The goal is to build two files:

1. /agent/USER.md — who this person is
2. /agent/SOUL.md — who you should be for them

## Before you start

Read the existing files first:

\\\`\\\`\\\`
read_file("/agent/USER.md")
read_file("/agent/SOUL.md")
\\\`\\\`\\\`

If they already have content, acknowledge what's there and ask if they want to update or start fresh.

## How to ask questions

**Use the ask_user_question tool for every question.** Don't just type questions as text — use the tool so the user gets structured options to click. This is faster and more engaging than typing.

For each question:
- Write a clear, short question
- Provide 2-4 options that cover common answers
- The user can always type a custom response instead of clicking
- You can ask up to 3 questions per tool call if they're related

Example:
\\\`\\\`\\\`
ask_user_question({
  questions: [{
    question: "What tone do you want from me?",
    options: ["Casual", "Direct", "Professional", "Blunt"],
    type: "single_select"
  }]
})
\\\`\\\`\\\`

Pace questions across 3-4 rounds. Don't cram everything into one call.

## Phase 1: Learn about the user

Start by asking their name. Then ask if they want you to look them up online (LinkedIn, Twitter/X, personal site) to pre-fill info. If they say yes, use web_search and web_scrape to pull key details (role, company, interests, location). Don't stop at one result — dig deeper. Check multiple sources to build a fuller picture. Confirm what you found, then only ask about stuff you couldn't find.

Things to learn (ask or discover via lookup):

- **Name** — what they go by, what they want you to call them
- **Timezone** — where they are
- **What they do** — work, clients, industry, specializations
- **Communication style** — do they want terse or thorough? formal or casual? do they hate filler?
- **Pet peeves** — what annoys them in an assistant? what should you never do?
- **Goals** — what are they trying to achieve? short-term and long-term
- **Context** — what are they working on right now? what do they care about?

Don't ask all of these if they volunteer info early. 3-4 rounds of ask_user_question max. Read the room.

After gathering enough, write /agent/USER.md using this structure:

\\\`\\\`\\\`markdown
# User Profile

- Name: {name}
- What to call them: {preference}
- Timezone: {tz}
- Notes: {anything notable}

## Goals

{what they're working toward — short-term and long-term}

## Context

{what they care about, projects, clients, market}

## Communication

{style preferences, pet peeves, what to avoid}
\\\`\\\`\\\`

Show them what you wrote and ask if anything needs tweaking.

## Phase 2: Craft the soul

Now help them define your personality. Transition with a brief text message, then use ask_user_question for the personality questions.

Use ask_user_question for each of these:

- **Tone** — casual, professional, dry humor, warm, blunt?
- **Opinions** — should you have strong opinions or stay neutral?
- **Verbosity** — concise by default? thorough when it matters? always brief?
- **Boundaries** — anything you should never do? always do?
- **Vibe** — any reference points? "like talking to a sharp colleague" or "like a friend who happens to know everything"

2-3 rounds of ask_user_question here. Then write /agent/SOUL.md. Keep it short and punchy — this isn't a constitution, it's a personality sketch. Aim for 5-10 lines of actual guidance.

Example output (don't copy this, craft it from their answers):

\\\`\\\`\\\`markdown
# Sunder Soul

Be direct, skip filler. Have opinions but flag when you're guessing.

Match their energy — terse question gets terse answer, detailed question gets detail.

Don't say "Great question!" or "I'd be happy to help." Just help.

When something is a bad idea, say so. Don't sugarcoat.

Use humor sparingly but don't be a robot.
\\\`\\\`\\\`

Show them the draft. Iterate if they want changes.

## Phase 3: Confirm

After both files are written, give a brief summary:
- "Here's what I know about you: {1-liner}"
- "Here's how I'll talk to you: {1-liner}"
- Remind them they can edit these anytime in the Memory page or by asking you to re-personalize

## Rules

- Be yourself during this process — don't be stiff or overly formal
- Never write more than 20 lines in SOUL.md. Brevity is the soul of soul.
- If user says "skip" or "just use defaults", write sensible defaults and move on
- If files already exist and have real content, default to updating not overwriting
- Use write_file for new files, edit_file for updates
`,
```

> **IMPORTANT:** The backticks inside the template string above must be properly escaped. When copying into `skill-templates.ts`, use the same escaping pattern as other skills in that file (backtick-escaping with `\\\`\\\`\\\``).

### 3c. Write test for onboarding skill frontmatter

**File:** `src/lib/runner/skills/__tests__/skill-templates.test.ts` (or similar test file)

Add a test that validates the onboarding skill has valid frontmatter:

```typescript
import { DEFAULT_SKILL_CONTENT } from "../skill-templates";
import { parseFrontmatter } from "../discover-skills";

describe("onboarding skill", () => {
  it("has valid frontmatter with name and description", () => {
    const content = DEFAULT_SKILL_CONTENT["onboarding"];
    expect(content).toBeDefined();
    const meta = parseFrontmatter(content);
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe("onboarding");
    expect(meta!.description).toContain("Personalize");
  });
});
```

Run: `npx vitest run src/lib/runner/skills --reporter=verbose`
Expected: PASS

### 3d. Verify bootstrap includes onboarding

No code change needed — `bootstrapSkills()` already iterates `DEFAULT_SKILL_SLUGS` and uploads any missing. Adding "onboarding" to the array is sufficient.

Verify by reading `src/lib/runner/skills/skill-bootstrap.ts` and confirming `DEFAULT_SKILL_SLUGS` is the source list.

---

## Task 4: Update QA surface

**What:** Rewrite `docs/qa/13-onboarding.md` to match the simplified skill-based approach.

**File:** `docs/qa/13-onboarding.md`

Replace the entire file with:

```markdown
# QA Surface 13: Onboarding

> **PRs covered:** 38d (skill-based onboarding)
> **Dogfoodable:** Yes (requires fresh user account or reset USER.md/SOUL.md to templates)
> **Time estimate:** 10-15 min manual

---

## Prerequisites

- A fresh user account (no prior chat history, default USER.md/SOUL.md)
- Or: reset test account (delete and re-upload template USER.md/SOUL.md from storage)

---

## Manual QA Scenarios

### 13.1 Auto-detection of new user

1. Ensure USER.md has only default template content (Name: blank, etc.)
2. Send any message (e.g., "Hey")
3. **Expected:** Agent detects empty USER.md, reads onboarding skill, and starts onboarding naturally
4. **Expected:** Agent asks the user's name and offers to look them up online

**Notes / failures:**

---

### 13.2 Onboarding via explicit trigger

1. With a fresh or existing account, type "onboard" or "personalize"
2. **Expected:** Agent reads the onboarding skill and starts the flow
3. **Expected:** If USER.md/SOUL.md have content, agent asks update vs start fresh

**Notes / failures:**

---

### 13.3 Phase 1 — USER.md co-discovery

1. Continue from 13.1 or 13.2
2. Respond to agent's questions naturally
3. **Expected:** Agent uses ask_user_question with clickable options (not prose questions)
4. **Expected:** If user agrees to online lookup, agent researches via web_search
5. **Expected:** Agent writes USER.md with structured fields (Name, Timezone, Goals, Context, Communication)
6. **Expected:** Agent shows draft and asks if anything needs tweaking
7. **Verify in storage:** USER.md has real content

**Notes / failures:**

---

### 13.4 Phase 2 — SOUL.md co-creation

1. Continue from 13.3
2. **Expected:** Agent transitions to personality questions
3. **Expected:** Asks about tone, opinions, verbosity, boundaries, vibe via ask_user_question
4. **Expected:** Writes SOUL.md — 5-10 lines, punchy prose
5. **Expected:** Shows draft and iterates if user wants changes
6. **Verify in storage:** SOUL.md has real personalized content (not just defaults)

**Notes / failures:**

---

### 13.5 Phase 3 — Confirmation

1. After both files written
2. **Expected:** Agent gives brief summary ("here's what I know / here's how I'll talk")
3. **Expected:** Reminds user files are editable in Memory page

**Notes / failures:**

---

### 13.6 Second session — personalized context

1. After completing onboarding, start a new thread
2. Chat naturally: "Good morning, what's on my plate today?"
3. **Expected:** Agent uses SOUL.md personality from co-creation
4. **Expected:** Agent knows user context from USER.md
5. **Expected:** No onboarding re-trigger (USER.md has content)

**Notes / failures:**

---

## Edge Cases

- [ ] User says "skip" — agent writes sensible defaults, moves on
- [ ] User gives minimal responses — agent handles gracefully, doesn't loop
- [ ] User re-runs onboarding ("personalize me again") — agent reads existing files, asks update vs fresh
- [ ] Very fast onboarding (2-3 messages) — still writes both files
- [ ] SOUL.md exceeds 20 lines — agent should self-correct

---

## Pass / Fail Criteria

- **Pass:** New user gets warm, conversational onboarding via skill. USER.md and SOUL.md populated with real context. ask_user_question used for structured input. Subsequent sessions are personalized. Re-onboarding works.
- **Fail:** Onboarding feels robotic or form-like. Files empty after onboarding. Agent asks prose questions instead of using ask_user_question. SOUL.md is a wall of text.
```

---

## Task 5: Update reference docs

### 5a. Update OpenClaw comparison doc

**File:** `docs/product/references/2026-03-09-openclaw-onboarding-comparison.md`

Add a note at the top:

```markdown
> **UPDATE 2026-03-20:** PR 38 tasks 8-13 replaced by PR 38d (skill-based onboarding following dorabot pattern). This comparison doc is historical reference only. The setup_progress DB approach, system prompt injection, and completion tracking are all removed. See `docs/product/tasks/2026-03-20-pr38d-skill-based-onboarding-tasklist.md` for the current approach.
```

### 5b. Remove real estate references from comparison doc

Search for and remove/generalize any references to:
- "real estate agents in Singapore"
- "HDB, condo, landed, commercial"
- "brokerage"
- "market areas"
- "specializations"

These were already removed from the system prompt and templates earlier in this session.

---

## Task 6: Update v2 plan

**File:** `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`

Add PR 38d to Phase 4's `prs` array (after PR 38c):

```json
{
  "pr": "38d",
  "title": "Skill-based onboarding (dorabot pattern)",
  "status": "pending",
  "simplified": true,
  "decisions": ["UX-09"],
  "note": "Replaces PR 38 tasks 8-13 with dorabot-inspired skill-based onboarding. One SKILL.md file, zero DB state, zero system prompt injection. Agent detects empty USER.md and follows the onboarding skill. Three phases: learn user → craft soul → confirm. SOUL.md unlocked for agent writes. Reference: dorabot-1/skills/onboard/SKILL.md.",
  "tasks": [
    {
      "id": "PR38d-1",
      "task": "Remove SOUL.md read-only restriction in agent-files.ts",
      "done": false
    },
    {
      "id": "PR38d-2",
      "task": "Update system prompt: SOUL.md writable guidance + empty USER.md detection hint",
      "done": false
    },
    {
      "id": "PR38d-3",
      "task": "Add onboarding skill to DEFAULT_SKILL_SLUGS and DEFAULT_SKILL_CONTENT in skill-templates.ts",
      "done": false
    },
    {
      "id": "PR38d-4",
      "task": "Update QA surface 13 for skill-based approach",
      "done": false
    },
    {
      "id": "PR38d-5",
      "task": "Update reference docs (comparison doc outdated, remove RE references)",
      "done": false
    }
  ],
  "testCriteria": [
    "New user with empty USER.md: agent detects, reads onboarding skill, runs 3-phase flow",
    "Explicit 'onboard' trigger: agent reads skill and starts flow",
    "USER.md and SOUL.md populated with real content after onboarding",
    "ask_user_question used for structured input (not prose questions)",
    "SOUL.md is ≤20 lines of punchy prose",
    "Second session loads personalized context, no re-trigger",
    "Re-onboarding ('personalize me') works — reads existing files, asks update vs fresh"
  ]
}
```

Also update PR 38's note to reference the replacement:

Find PR 38's `"note"` field and append:
```
 Tasks 8-13 replaced by PR 38d (skill-based onboarding, dorabot pattern).
```

---

## Commit

After all tasks pass:

```bash
git add src/lib/storage/agent-files.ts \
        src/lib/runner/skills/skill-templates.ts \
        src/lib/ai/system-prompt.ts \
        docs/qa/13-onboarding.md \
        docs/product/references/2026-03-09-openclaw-onboarding-comparison.md \
        docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json

# Include test files if modified/created:
git add src/lib/storage/__tests__/ \
        src/lib/runner/skills/__tests__/

git commit -m "feat(pr38d): skill-based onboarding — dorabot pattern

Replace PR 38 tasks 8-13 with a single onboarding SKILL.md.
Unlock SOUL.md for agent writes. Add empty-USER.md detection
hint to system prompt. Zero DB state, zero infra.

Reference: dorabot-1/skills/onboard/SKILL.md"
```
