---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Run a structured, report-only code review by spawning the Codex `reviewer` agent role.

**Core principle:** review early, review often.

## When to Request Review

**Mandatory:**

- After each major completed task
- After completing a major feature
- Before merge to main

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing a complex bug

## How to Run

**1. Decide review range (prefer explicit SHAs):**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main, or a batch-start SHA
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Read template (REQUIRED):**

```
Read file: .agents/skills/1-requesting-code-review/code-reviewer.md
```

**3. Spawn `reviewer` agent using the exact template prompt:**

Fill these placeholders:

- `{WHAT_WAS_IMPLEMENTED}` - what was built
- `{PLAN_OR_REQUIREMENTS}` - target requirements
- `{BASE_SHA}` - starting commit
- `{HEAD_SHA}` - ending commit
- `{DESCRIPTION}` - concise implementation summary
- `{PLAN_REFERENCE}` - plan path or inline requirements

Do not invent an ad-hoc review format. Use the template output shape.
Pass the filled template as the reviewer's assignment.

**4. Present findings to user (report-only):**

- Do not implement fixes
- Do not create todos automatically
- Do not change files during review

The user decides what to action.

## Example

```
[Just completed Task 2: Add verification function]

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Spawn reviewer agent with filled template]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Review returns]
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed
```

## Integration with Workflows

**Task-driven development:**

- Review after each meaningful task
- Present findings to user
- User decides what to action

**Executing plans (via `executing-plans` skill):**

- Run after each completed batch
- Review changes since batch start SHA
- Present findings for decision

**Ad-hoc development:**

- Review before merge
- Review when stuck

## Red Flags

**Never:**

- Skip review because "it's simple"
- Auto-fix issues without user approval
- Dismiss review feedback without user input

## Codex Notes

- Codex CLI supports `/review` for working-tree review.
- For deterministic plan-vs-implementation review, prefer spawning `reviewer` with this skill template and explicit `{BASE_SHA}` and `{HEAD_SHA}`.

See template at: `.agents/skills/1-requesting-code-review/code-reviewer.md`
