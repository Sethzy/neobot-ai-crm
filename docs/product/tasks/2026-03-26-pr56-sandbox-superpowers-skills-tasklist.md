# Sandbox Superpowers Skills Implementation Plan

**PR:** PR 56: Sandbox superpowers skills (quality discipline for inner Claude Code)
**Decisions:** EXEC-04 (extended — inner agent quality)
**Goal:** Bundle a trimmed subset of obra/superpowers skills into the Sprite so the inner Claude Code self-enforces verification, debugging discipline, and a code review loop before claiming done.

**Architecture:** 5 skills + 1 agent prompt + 1 CLAUDE.md from superpowers are adapted for our sandbox context (no TDD — not useful for spreadsheets/artifacts). Written once to the Sprite on first use via a `.installed` marker guard. CLAUDE.md at `/workspace/CLAUDE.md` tells Claude Code to read the meta-skill — no prompt injection needed. The `Task` tool is added to `ALLOWED_TOOLS` to enable subagent dispatch for the code review loop. Completely separate from the per-job domain skill flow (re-analyst, excel_editing, etc.) which re-fetches from Supabase Storage every job since users can edit those.

**Tech Stack:** Fly Sprites SDK, Claude Code CLI (`--allowedTools`), bundled markdown skill files

**Reference:** https://github.com/obra/superpowers (MIT license, Jesse Vincent). Local clone at `/Users/sethlim/Documents/superpowers/`.

---

## Relevant Files

### New Files
- `src/lib/sandbox/superpowers/index.ts` — skill content strings, `toSpriteSkillFiles()`, `SANDBOX_CLAUDE_MD`, `ensureSuperpowersInstalled()`
- `src/lib/sandbox/superpowers/__tests__/superpowers.test.ts`

### Modified Files
- `src/lib/sandbox/run-claude-in-sprite.ts` — add `Task` to `ALLOWED_TOOLS`, export `DEFAULT_MAX_TURNS = 100`
- `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts` — update tests
- `src/lib/sandbox/sprite-jobs.ts` — call `ensureSuperpowersInstalled()` before job setup, use `DEFAULT_MAX_TURNS`

---

## Task 1: Bundle Superpowers Skill Content

**Files:**
- Create: `src/lib/sandbox/superpowers/index.ts`
- Create: `src/lib/sandbox/superpowers/__tests__/superpowers.test.ts`

**Step 1: Write failing test for skill content exports**

```typescript
// src/lib/sandbox/superpowers/__tests__/superpowers.test.ts
/** Tests for bundled superpowers skill content. */
import { describe, it, expect, vi } from "vitest";
import {
  SUPERPOWERS_SKILLS,
  SUPERPOWERS_AGENT_PROMPTS,
  SANDBOX_CLAUDE_MD,
  toSpriteSkillFiles,
  ensureSuperpowersInstalled,
} from "../index";

describe("superpowers skill content", () => {
  it("exports 5 skill files", () => {
    expect(Object.keys(SUPERPOWERS_SKILLS)).toHaveLength(5);
  });

  it("exports 1 agent prompt", () => {
    expect(Object.keys(SUPERPOWERS_AGENT_PROMPTS)).toHaveLength(1);
    expect(SUPERPOWERS_AGENT_PROMPTS).toHaveProperty("code-reviewer");
  });

  it("all skills have YAML frontmatter with name and description", () => {
    for (const [, content] of Object.entries(SUPERPOWERS_SKILLS)) {
      expect(content).toMatch(/^---\nname:/);
      expect(content).toContain("description:");
    }
  });

  it("using-superpowers references all other skill names", () => {
    const meta = SUPERPOWERS_SKILLS["using-superpowers"];
    expect(meta).toContain("verification-before-completion");
    expect(meta).toContain("systematic-debugging");
    expect(meta).toContain("requesting-code-review");
    expect(meta).toContain("receiving-code-review");
  });

  it("SANDBOX_CLAUDE_MD references the superpowers meta-skill", () => {
    expect(SANDBOX_CLAUDE_MD).toContain("superpowers");
    expect(SANDBOX_CLAUDE_MD).toContain("receiving-code-review");
  });

  it("generates SpriteSkillFile[] with superpowers/ prefix", () => {
    const files = toSpriteSkillFiles();
    expect(files.length).toBe(6); // 5 skills + 1 agent prompt
    for (const { path, content } of files) {
      expect(path).toMatch(/^superpowers\//);
      expect(content.length).toBeGreaterThan(50);
    }
  });

  it("code-reviewer agent prompt uses agents/ subdirectory", () => {
    const files = toSpriteSkillFiles();
    const agentFile = files.find((f) => f.path.includes("agents/"));
    expect(agentFile).toBeDefined();
    expect(agentFile!.path).toBe("superpowers/agents/code-reviewer.md");
  });
});

describe("ensureSuperpowersInstalled", () => {
  it("skips writing when .installed marker exists", async () => {
    const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const mockWriteFile = vi.fn();
    const sprite = {
      execFile: mockExecFile,
      filesystem: vi.fn(() => ({ writeFile: mockWriteFile })),
    } as never;

    await ensureSuperpowersInstalled(sprite);

    // test -f succeeded, so no writes should happen
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockExecFile).toHaveBeenCalledWith("test", ["-f", "/skills/superpowers/.installed"]);
  });

  it("writes all files + CLAUDE.md + marker on first install", async () => {
    const mockExecFile = vi.fn().mockImplementation(async (cmd: string, args?: string[]) => {
      if (cmd === "test") throw new Error("ENOENT"); // marker doesn't exist
      return { stdout: "", stderr: "" };
    });
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);
    const sprite = {
      execFile: mockExecFile,
      filesystem: vi.fn(() => ({ writeFile: mockWriteFile })),
    } as never;

    await ensureSuperpowersInstalled(sprite);

    // Should write 6 skill files + CLAUDE.md + .installed marker = 8 writes
    expect(mockWriteFile).toHaveBeenCalledTimes(8);

    const writtenPaths = mockWriteFile.mock.calls.map(([path]: [string]) => path);
    expect(writtenPaths).toContain("/skills/superpowers/using-superpowers/SKILL.md");
    expect(writtenPaths).toContain("/skills/superpowers/verification-before-completion/SKILL.md");
    expect(writtenPaths).toContain("/skills/superpowers/systematic-debugging/SKILL.md");
    expect(writtenPaths).toContain("/skills/superpowers/requesting-code-review/SKILL.md");
    expect(writtenPaths).toContain("/skills/superpowers/receiving-code-review/SKILL.md");
    expect(writtenPaths).toContain("/skills/superpowers/agents/code-reviewer.md");
    expect(writtenPaths).toContain("/workspace/CLAUDE.md");
    expect(writtenPaths).toContain("/skills/superpowers/.installed");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/superpowers/__tests__/superpowers.test.ts
```
Expected: FAIL — module not found.

**Step 3: Create the skill content module**

Cross-reference each adapted skill against the original at `/Users/sethlim/Documents/superpowers/` to minimize drift. Core discipline preserved; git/PR/branch/CLAUDE.md/TodoWrite/EnterPlanMode references removed.

```typescript
// src/lib/sandbox/superpowers/index.ts
/**
 * Bundled superpowers skill content for Sprite sandbox.
 * Adapted from obra/superpowers (MIT license, Jesse Vincent).
 * Written once to Sprite on first use — not re-written per job.
 * @see https://github.com/obra/superpowers
 * @module lib/sandbox/superpowers
 */

import { dirname } from "node:path";

import type { SpriteSkillFile } from "../types";
import type { SpriteHandle } from "../types";

/** CLAUDE.md written to /workspace/ so Claude Code reads it at session start. */
export const SANDBOX_CLAUDE_MD = `# Sunder Sandbox

## Quality Discipline

You have quality discipline skills installed at /skills/superpowers/.
Read /skills/superpowers/using-superpowers/SKILL.md before starting any task.

Workflow:
1. Do the assigned work
2. Before claiming done → activate verification-before-completion (check every requirement, not just file existence)
3. Draft summary.txt with what was produced
4. Activate requesting-code-review, dispatch a reviewer subagent via Task tool (reviewer checks output + summary)
5. When reviewer responds → activate receiving-code-review to evaluate feedback before acting
6. Fix Critical/Important issues, re-verify after each fix, update summary.txt if needed
`;

/**
 * Trimmed subset of superpowers skills for sandbox use.
 * TDD skill excluded — not useful for spreadsheet/artifact work.
 * Git/PR/branch references removed. Core discipline preserved.
 */
export const SUPERPOWERS_SKILLS: Record<string, string> = {
  "using-superpowers": `---
name: using-superpowers
description: Use when starting any task — establishes how to find and use quality skills, requiring skill activation before ANY action
---

<SUBAGENT-STOP>
If you were dispatched as a subagent (e.g., the code-reviewer), skip this skill entirely.
Do your assigned review and return. Do not apply the superpowers workflow to yourself.
</SUBAGENT-STOP>

# Using Superpowers

You have quality discipline skills available. Check for applicable skills before taking any action.

## Instruction Priority

1. **Task prompt instructions** (from Sunder) — highest priority
2. **Superpowers skills** — override default behavior where they conflict
3. **Default system prompt** — lowest priority

## Available Skills

These skills are in /skills/superpowers/:

| Skill | When to Use |
|-------|-------------|
| verification-before-completion | Before claiming work is done — run verification, show proof |
| systematic-debugging | When hitting bugs, errors, or unexpected behavior |
| requesting-code-review | After completing major work — dispatch reviewer subagent |
| receiving-code-review | When processing review feedback — verify before implementing |

The code-reviewer agent prompt is at /skills/superpowers/agents/code-reviewer.md.

## The Rule

**If there is even a 1% chance a skill applies, read and follow it.**

- About to say "done"? Read verification-before-completion first.
- Hit an error? Read systematic-debugging first.
- Finished the main work? Read requesting-code-review and dispatch a reviewer.
- Received reviewer feedback? Read receiving-code-review before acting on it.

## Red Flags

These thoughts mean STOP — you're skipping discipline:

| Thought | Reality |
|---------|---------|
| "This is simple, no need" | Simple things have bugs too |
| "I'm confident it works" | Confidence is not evidence |
| "Just this once" | No exceptions |
| "I'll verify later" | Later never comes |
`,

  "verification-before-completion": `---
name: verification-before-completion
description: Use before claiming work is complete — requires running verification commands and confirming output before making any success claims
---

# Verification Before Completion

## The Iron Law

NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

If you haven't run the verification command in this step, you cannot claim it passes.

## The Gate Function

BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

## Requirements Checklist

Before claiming done, re-read the original task prompt and create a checklist:

1. List every specific deliverable or calculation the task requested
2. Verify each item is present in the output — not just that the file exists, but that it contains the right content
3. If the task asked for "cap rate" — verify the number is there, not a placeholder
4. If the task asked for "3 scenarios" — count them
5. Report any gaps

A file can exist and still miss requested calculations, sections, or labels. Check the content, not just the existence.

## For Spreadsheet Work

- Run the recalc/validation script: verify zero formula errors
- Check that output file exists and has content (not 0 bytes)
- Read summary.txt and confirm it contains actual metrics, not placeholders
- Re-read task prompt: verify every requested calculation/metric is present in output

## For Artifact Work

- Run the build command, confirm exit 0
- Check that output HTML/assets exist and have content
- Validate generated files with CLI checks (e.g., grep for expected content, check file sizes)
- Re-read task prompt: verify every requested section/element is present

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Output complete | Requirements checklist verified | File exists |
| Formulas work | Recalc script: 0 errors | "Should be correct" |
| Build succeeds | Build command: exit 0 | "Looks good" |
| Task done | Every deliverable verified | Some deliverables verified |

## Red Flags — STOP

- Using "should", "probably", "seems to"
- About to write summary.txt without running verification
- Thinking "just this once I can skip"
- Expressing satisfaction before verification ("Done!", "Perfect!")
- Checking file existence but not file content

## The Bottom Line

Run the command. Read the output. Check every requirement. THEN claim the result.
`,

  "systematic-debugging": `---
name: systematic-debugging
description: Use when fixing bugs, errors, or unexpected behavior — requires root cause investigation before proposing fixes
---

# Systematic Debugging

## The Iron Law

NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.

If you haven't completed Phase 1, you cannot propose fixes.

## The Four Phases

### Phase 1: Root Cause Investigation

BEFORE attempting ANY fix:

1. Read error messages carefully — they often contain the exact solution
2. Reproduce consistently — can you trigger it reliably?
3. Check recent changes — what did you just modify?
4. Trace data flow — where does the bad value originate?

### Phase 2: Pattern Analysis

1. Find working examples in the same codebase or skill references
2. Compare against what works — what's different?
3. List every difference, however small

### Phase 3: Hypothesis and Testing

1. Form single hypothesis: "I think X is the root cause because Y"
2. Make the SMALLEST possible change to test it
3. One variable at a time — don't fix multiple things at once
4. If it didn't work, form NEW hypothesis (don't pile on more fixes)

### Phase 4: Implementation

1. Show the failing symptom first — reproduce the error and capture the output before attempting any fix. This is your "before" evidence.
2. Implement single fix addressing root cause
3. Re-run the same command from step 1 — compare output to confirm the fix worked
4. If 3+ fix attempts fail and each reveals a different problem: STOP.
   Write your findings to summary.txt. The architecture may be wrong.

## Red Flags — STOP and Return to Phase 1

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "I don't fully understand but this might work"
- Proposing solutions before tracing data flow
- Each fix reveals a new problem in a different place
- Jumping to implementation without capturing the failing symptom first

## The Bottom Line

Systematic debugging is FASTER than guess-and-check. Find the root cause first. Show the failure before fixing it.
`,

  "requesting-code-review": `---
name: requesting-code-review
description: Use after completing major work — dispatch a code-reviewer subagent to catch issues before finalizing
---

# Requesting Code Review

After completing the main work, dispatch a fresh code-reviewer subagent. The reviewer gets only the work product (not your session history), so it evaluates with fresh eyes.

## When to Request Review

- After completing the main task (spreadsheet analysis, artifact build)
- Before writing the final summary.txt
- When you've made significant changes and want a second opinion

## How to Request

Use the Task tool to dispatch a subagent with this prompt structure:

You are a code reviewer. Review the work in this directory.

Read /skills/superpowers/agents/code-reviewer.md for your review guidelines.

**Original task requirements:** [paste or summarize the original task prompt — what was requested, what metrics/deliverables were expected]
**What was done:** [brief description of what you built]
**Output location:** [path to output files]
**Key files to review:** [list the main output files]

Review the output against the original task requirements for correctness, completeness, and quality.
Report issues as Critical (must fix), Important (should fix), or Suggestions.

## Acting on Feedback

When feedback arrives, activate the receiving-code-review skill before acting on it.

1. Read all feedback completely first
2. Verify each issue against actual output
3. Fix Critical issues immediately
4. Fix Important issues before finalizing
5. Note Suggestions but don't block on them
6. If reviewer is wrong, ignore with reasoning — don't blindly agree

## After Review

Once Critical and Important issues are addressed:
1. Re-verify (use verification-before-completion)
2. Update summary.txt if review changed the output
3. Mark done
`,

  "receiving-code-review": `---
name: receiving-code-review
description: Use when processing code review feedback — verify before implementing, push back when feedback is incorrect
---

# Receiving Code Review

## The Response Pattern

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate the requirement in your own words
3. VERIFY: Check each issue against actual output — is it real?
4. EVALUATE: Is it technically correct for THIS task?
5. IMPLEMENT: Fix Critical and Important issues, one at a time
6. RE-VERIFY: Run verification after each fix

## Key Rules

- No performative agreement ("Great point!", "You're right!")
- Verify each issue independently — reviewer may be wrong
- Fix one thing at a time, verify after each fix
- Push back with reasoning if feedback is incorrect
- If any feedback item is unclear, clarify before implementing anything

## Handling Feedback by Severity

| Severity | Action |
|----------|--------|
| Critical | Fix immediately, re-verify |
| Important | Fix before finalizing |
| Suggestions | Note, don't block on them |
| Wrong | Ignore with brief reasoning |

## When to Push Back

- Suggestion breaks existing output that was correct
- Reviewer lacks context about task requirements
- Fix would over-engineer a simple deliverable
- Feedback conflicts with the task prompt instructions
- Reviewer suggests adding something the task didn't ask for (YAGNI)

## The Bottom Line

Review feedback is suggestions to evaluate, not orders to follow.
Verify. Fix what matters. Skip what doesn't.
`,
};

/** Agent prompts used by subagent dispatch (Task tool). */
export const SUPERPOWERS_AGENT_PROMPTS: Record<string, string> = {
  "code-reviewer": `---
name: code-reviewer
description: Reviews completed work for correctness, completeness, and quality. Dispatched as a subagent after major work is done.
---

You are a Senior Code Reviewer. Review the completed work against the original task requirements provided to you.

## Review Checklist

1. **Task Alignment** (check against original requirements first)
   - Does the output match what was requested?
   - Are there missing requirements, metrics, or deliverables from the original task?
   - Any unnecessary additions that weren't asked for?

2. **Output Completeness**
   - Are all requested outputs present?
   - Do output files have actual content (not empty/placeholder)?

2. **Correctness**
   - For spreadsheets: Do formulas calculate correctly? Are numbers reasonable?
   - For artifacts: Does the HTML have actual content? Are images/links valid?
   - Are there obvious errors, broken references, or missing data?

3. **Quality**
   - Is the output well-organized and readable?
   - Are calculations/layouts professional quality?
   - Would a client be satisfied receiving this?

## Output Format

Structure your review as:

**Strengths:** What was done well

**Issues:**
- Critical: [must fix — broken output, wrong calculations, missing files]
- Important: [should fix — quality issues, incomplete sections]
- Suggestions: [nice to have — formatting, minor improvements]

**Assessment:** Ready to finalize / Needs fixes first

Be concise. Focus on real problems, not style preferences.
`,
};

/**
 * Returns all superpowers content as SpriteSkillFile[] entries.
 * Skills: superpowers/{slug}/SKILL.md
 * Agent prompts: superpowers/agents/{name}.md
 */
export function toSpriteSkillFiles(): SpriteSkillFile[] {
  const files: SpriteSkillFile[] = [];

  for (const [slug, content] of Object.entries(SUPERPOWERS_SKILLS)) {
    files.push({ path: `superpowers/${slug}/SKILL.md`, content });
  }

  for (const [name, content] of Object.entries(SUPERPOWERS_AGENT_PROMPTS)) {
    files.push({ path: `superpowers/agents/${name}.md`, content });
  }

  return files;
}

/**
 * Write superpowers skills + CLAUDE.md to a Sprite if not already installed.
 * Uses a marker file at /skills/superpowers/.installed to skip on repeat jobs.
 * This is separate from the per-job domain skill writes (which re-fetch from
 * Supabase Storage every job since users can edit those).
 */
export async function ensureSuperpowersInstalled(
  sprite: SpriteHandle,
): Promise<void> {
  try {
    await sprite.execFile("test", ["-f", "/skills/superpowers/.installed"]);
    return; // already installed
  } catch {
    // Not installed — write everything
    const filesystem = sprite.filesystem();

    for (const { path, content } of toSpriteSkillFiles()) {
      const fullPath = `/skills/${path}`;
      await sprite.execFile("mkdir", ["-p", dirname(fullPath)]);
      await filesystem.writeFile(fullPath, content);
    }

    await filesystem.writeFile("/workspace/CLAUDE.md", SANDBOX_CLAUDE_MD);
    await filesystem.writeFile("/skills/superpowers/.installed", "1");
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/superpowers/__tests__/superpowers.test.ts
```
Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add src/lib/sandbox/superpowers/
git commit -m "feat(pr56): bundle superpowers skills with one-time install guard + CLAUDE.md"
```

---

## Task 2: Add `Task` to ALLOWED_TOOLS + Export DEFAULT_MAX_TURNS

**Files:**
- Modify: `src/lib/sandbox/run-claude-in-sprite.ts`
- Modify: `src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts`

**Step 1: Write failing tests**

Add to the `buildClaudeCliArgs` test block in `run-claude-in-sprite.test.ts`:

```typescript
it("includes Task in allowed tools for subagent dispatch", () => {
  const args = buildClaudeCliArgs("test", 10);
  const allowedIdx = args.indexOf("--allowedTools");
  const toolsStr = args[allowedIdx + 1];
  expect(toolsStr).toContain("Task");
});
```

Add a new test block:

```typescript
import { DEFAULT_MAX_TURNS } from "../run-claude-in-sprite";

describe("DEFAULT_MAX_TURNS", () => {
  it("is 100 to allow for review loops on cheap models", () => {
    expect(DEFAULT_MAX_TURNS).toBe(100);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
```
Expected: FAIL — `Task` not in allowed tools, `DEFAULT_MAX_TURNS` not exported or not 100.

**Step 3: Update run-claude-in-sprite.ts**

```typescript
// Before:
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep"];
const DEFAULT_MAX_TURNS = 20;

// After:
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep", "Task"];
export const DEFAULT_MAX_TURNS = 100;
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/sandbox/run-claude-in-sprite.ts src/lib/sandbox/__tests__/run-claude-in-sprite.test.ts
git commit -m "feat(pr56): add Task to ALLOWED_TOOLS, export DEFAULT_MAX_TURNS=100"
```

---

## Task 3: Wire into Job Setup

**Files:**
- Modify: `src/lib/sandbox/sprite-jobs.ts`
- Modify: `src/lib/runner/skills/skill-bootstrap.ts` — reserve `"superpowers"` slug
- Modify: `src/lib/sandbox/__tests__/sprite-jobs-delivery.test.ts` (if mock needs updating)

**Step 1: Reserve the `superpowers` skill slug**

In `src/lib/runner/skills/skill-bootstrap.ts`, add `"superpowers"` to the reserved set so user-authored skills can never collide with the baked-in install path:

```typescript
// Before:
const RESERVED_SKILL_DIRECTORIES = new Set(["system", "connections"]);

// After:
const RESERVED_SKILL_DIRECTORIES = new Set(["system", "connections", "superpowers"]);
```

**Step 2: Add ensureSuperpowersInstalled call**

In `sprite-jobs.ts`, in the job setup function (around line 251-277), add the call BEFORE the per-job skill loading:

```typescript
import { ensureSuperpowersInstalled } from "./superpowers";
import { DEFAULT_MAX_TURNS } from "./run-claude-in-sprite";

// ... inside the try block, before "Sync skills":
await ensureSuperpowersInstalled(sprite);

// ... existing domain skill loading follows unchanged
```

**Step 3: Replace hardcoded maxTurns**

On line 319:

```typescript
// Before:
await launchBackgroundJob(sprite, next.id, { prompt, maxTurns: 20 });

// After:
await launchBackgroundJob(sprite, next.id, { prompt, maxTurns: DEFAULT_MAX_TURNS });
```

**Step 4: Write focused test for the new wiring**

The existing `sprite-jobs-delivery.test.ts` only covers `deliverResult` and `failJob`. Add a test that covers the job startup path:

```typescript
// In sprite-jobs-delivery.test.ts or a new sprite-jobs-startup.test.ts

import { ensureSuperpowersInstalled } from "@/lib/sandbox/superpowers";
import { DEFAULT_MAX_TURNS } from "@/lib/sandbox/run-claude-in-sprite";

vi.mock("@/lib/sandbox/superpowers", () => ({
  ensureSuperpowersInstalled: vi.fn().mockResolvedValue(undefined),
}));

describe("promoteNextQueuedJob", () => {
  it("calls ensureSuperpowersInstalled before skill sync", async () => {
    // Setup: insert a queued job, mock sprite + supabase
    // ...

    await promoteNextQueuedJob(supabase, sprite);

    // ensureSuperpowersInstalled should be called
    expect(ensureSuperpowersInstalled).toHaveBeenCalledWith(sprite);

    // And it should be called BEFORE writeSkillFiles
    const superpowersCallOrder = (ensureSuperpowersInstalled as any).mock.invocationCallOrder[0];
    const writeSkillsCallOrder = (mockWriteSkillFiles as any).mock.invocationCallOrder[0];
    expect(superpowersCallOrder).toBeLessThan(writeSkillsCallOrder);
  });

  it("launches background job with DEFAULT_MAX_TURNS", async () => {
    // Setup: insert a queued job, mock sprite + supabase
    // ...

    await promoteNextQueuedJob(supabase, sprite);

    expect(mockLaunchBackgroundJob).toHaveBeenCalledWith(
      sprite,
      expect.any(String),
      expect.objectContaining({ maxTurns: DEFAULT_MAX_TURNS }),
    );
  });
});
```

**Step 5: Run all sandbox tests**

```bash
npx vitest run src/lib/sandbox/__tests__/
```
Expected: ALL PASS.

**Step 6: Commit**

```bash
git add src/lib/sandbox/sprite-jobs.ts src/lib/runner/skills/skill-bootstrap.ts src/lib/sandbox/__tests__/
git commit -m "feat(pr56): wire ensureSuperpowersInstalled + DEFAULT_MAX_TURNS + reserve slug"
```

---

## Task 4: Update V2 Plan

**Files:**
- Modify: `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`

**Step 1: Verify PR 56 entry exists and update tasks to match**

The entry was already added. Update the task list and testCriteria to match the final implementation (4 tasks, CLAUDE.md approach, marker guard).

**Step 2: Commit**

```bash
git add docs/product/plans/ docs/product/tasks/
git commit -m "docs(pr56): finalize sandbox superpowers skills tasklist + v2 plan"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Bundle skill content + `ensureSuperpowersInstalled()` with `.installed` guard + CLAUDE.md | 2 new |
| 2 | Add `Task` to ALLOWED_TOOLS + export `DEFAULT_MAX_TURNS=100` | 2 modified |
| 3 | Wire into job setup (`ensureSuperpowersInstalled` + `DEFAULT_MAX_TURNS` + reserve slug + focused test) | 3 modified |
| 4 | Update v2 plan | 1-2 modified |

**Total:** 2 new files, ~4 modified files.

**How it works on each job:**

```
Job 1 (fresh Sprite):
  ensureSuperpowersInstalled():
    test -f /skills/superpowers/.installed → FAIL (doesn't exist)
    → writes 6 skill files to /skills/superpowers/
    → writes /workspace/CLAUDE.md
    → writes /skills/superpowers/.installed marker
  writeSkillFiles(allSkillFiles):  ← per-job domain skills from Supabase
    → writes /skills/re-analyst/SKILL.md
    → writes /skills/excel_editing/SKILL.md
  launchBackgroundJob(maxTurns: 100)
  Claude Code starts → reads /workspace/CLAUDE.md → reads superpowers → does work → verifies → reviews → done

Job 2 (same Sprite, different task):
  ensureSuperpowersInstalled():
    test -f /skills/superpowers/.installed → PASS (exists)
    → returns immediately, zero writes
  writeSkillFiles(allSkillFiles):  ← re-fetched from Supabase (user may have edited)
    → writes /skills/frontend-design/SKILL.md
  launchBackgroundJob(maxTurns: 100)
  Claude Code starts → reads /workspace/CLAUDE.md (already there) → same flow

Job 3+: same as Job 2
```

---

## Review Feedback Addressed

### Round 1

| Issue | Fix |
|-------|-----|
| Task 6 ineffective: `DEFAULT_MAX_TURNS` doesn't reach hardcoded `maxTurns: 20` | sprite-jobs.ts imports and uses `DEFAULT_MAX_TURNS` |
| `writeSuperpowersSkills()` duplicative wiring | Eliminated. `ensureSuperpowersInstalled()` is self-contained — one function, one call site |
| `receiving-code-review` bundled but not wired | Referenced in: CLAUDE.md workflow step 5, meta-skill, requesting-code-review "Acting on Feedback" |
| Verification missing requirements-checklist | Added "Requirements Checklist" section from upstream |
| Debugging drops "capture failing symptom first" | Phase 4 step 1: reproduce and capture before fixing |
| Artifact verification assumes port 8080 | Replaced with CLI validation (grep content, check file sizes) |
| testCriteria overstate what unit tests prove | Softened in v2 plan |
| Re-writing files every job is wasteful | `.installed` marker guard — writes once, skips on repeat jobs |
| No CLAUDE.md on Sprite | `/workspace/CLAUDE.md` written on first install, Claude Code reads it automatically |

### Round 2

| Issue | Fix |
|-------|-----|
| Missing SUBAGENT-STOP — reviewer subagent reads CLAUDE.md and tries to apply superpowers to itself | Added `<SUBAGENT-STOP>` block to using-superpowers (matches upstream) |
| Review dispatch missing task requirements — reviewer can't check completeness without knowing what was asked | Added `**Original task requirements:**` field to dispatch prompt; moved Task Alignment to first checklist item in code-reviewer |
| `superpowers` slug collision — user could create a skill named "superpowers" and overwrite baked-in files | Added `"superpowers"` to `RESERVED_SKILL_DIRECTORIES` in skill-bootstrap.ts |
| Summary timing inconsistent — workflow says "write summary after review" but reviewer checks summary | Draft summary.txt before review (step 3), update after if review changed output |
| Task 3 has no focused test for new wiring — existing tests don't cover the startup path | Added `promoteNextQueuedJob` test verifying `ensureSuperpowersInstalled` call order and `DEFAULT_MAX_TURNS` |
