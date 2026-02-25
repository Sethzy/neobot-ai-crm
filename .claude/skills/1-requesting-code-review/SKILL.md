---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Dispatch `code-reviewer` subagent to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Read the template (REQUIRED):**

```
Read file: .claude/skills/1-requesting-code-review/code-reviewer.md
```

**3. Dispatch code-reviewer subagent:**

Use Task tool with `subagent_type="code-reviewer"`.

**IMPORTANT:** Use the EXACT template from step 2 as your prompt, filling in these placeholders:

- `{WHAT_WAS_IMPLEMENTED}` - What you just built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
- `{DESCRIPTION}` - Brief summary
- `{PLAN_REFERENCE}` - Path to plan file or inline requirements

Do NOT write your own ad-hoc prompt. The template ensures consistent, thorough reviews.

**4. Present feedback to user:**

Report the code review results to the user in full markdown format. Do NOT:
- Implement any fixes
- Create todos
- Make code changes

The user reviews findings and decides what to action.

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent via Task tool]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Present review to user - user decides what to fix]
```

## Integration with Workflows

**Subagent-Driven Development:**

- Review after EACH task
- Present findings to user
- User decides what to action

**Executing Plans (via `executing-plans` skill):**

- Called after each batch (default 3 tasks)
- Review changes since batch start
- Present findings to user for decision

**Ad-Hoc Development:**

- Review before merge
- Review when stuck

## Red Flags

**Never:**

- Skip review because "it's simple"
- Auto-fix issues without user approval
- Dismiss review feedback without user input

See template at: requesting-code-review/code-reviewer.md
