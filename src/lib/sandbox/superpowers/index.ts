/**
 * Bundled superpowers skill content for Sprite sandbox.
 * Adapted from obra/superpowers (MIT license, Jesse Vincent).
 * Written once to Sprite on first use — not re-written per job.
 * @see https://github.com/obra/superpowers
 * @module lib/sandbox/superpowers
 */

import { dirname } from "node:path";

import type { SpriteHandle, SpriteSkillFile } from "../types";

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

3. **Correctness**
   - For spreadsheets: Do formulas calculate correctly? Are numbers reasonable?
   - For artifacts: Does the HTML have actual content? Are images/links valid?
   - Are there obvious errors, broken references, or missing data?

4. **Quality**
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
