---
name: codebase-audit
description: Use for systematic codebase review and cleanup across directories. Supports parallel execution on separate branches.
---

# Codebase Audit

Dispatch `codebase-auditor` subagent to review files in a directory and optionally apply fixes.

**Core principle:** Review systematically, fix incrementally.

## When to Use

- Scheduled codebase health checks
- Pre-refactoring baseline assessment
- Technical debt cleanup sprints
- Onboarding new team members (codebase familiarization)

## How to Use

**1. Create audit branch:**

```bash
AUDIT_NAME="ui-components"  # descriptive name for this audit scope
git checkout -b audit/${AUDIT_NAME}
```

**2. Read the template (REQUIRED):**

```
Read file: .claude/skills/1-codebase-audit/codebase-auditor.md
```

**3. Dispatch codebase-auditor subagent:**

Use Task tool with `subagent_type="code-reviewer"`.

Fill in these placeholders:
- `{AUDIT_NAME}` - Short name (e.g., "ui-components")
- `{TARGET_PATHS}` - Directories/files to review
- `{FOCUS_AREAS}` - Specific concerns to check
- `{CROSS_CUTTING}` - Issues to flag everywhere
- `{FIX_MODE}` - "report-only" or "fix-and-commit"

**4. Handle results:**

- **report-only:** Present findings to user, user decides what to action
- **fix-and-commit:** Review applied fixes, then create PR

## Parallel Execution

Run multiple audits simultaneously by using separate branches:

```bash
# Terminal 1
git checkout -b audit/ui-components
claude  # run audit for src/components/ui/

# Terminal 2
git checkout -b audit/api-integrations
claude  # run audit for src/lib/

# Terminal 3
git checkout -b audit/hooks
claude  # run audit for src/hooks/
```

Each session works independently. Merge branches after review.

## Example

```
[Running audit on src/components/ui/]

git checkout -b audit/ui-components

[Dispatch codebase-auditor subagent]
  AUDIT_NAME: ui-components
  TARGET_PATHS: src/components/ui/
  FOCUS_AREAS: ShadCN patterns, accessibility, large files
  CROSS_CUTTING: console.log, TODO comments, files >500 LOC
  FIX_MODE: fix-and-commit

[Subagent returns]:
  Files Reviewed: 26
  Issues Found: 8 (2 Important, 6 Minor)
  Fixes Applied: 6
  Commits: 2

[Create PR from audit/ui-components → main]
```

## Integration with Review Plan

For multi-track audits, use `docs/codebase-review-plan.md` to coordinate:
1. Each track gets its own branch
2. Run audits in parallel
3. Cross-review PRs
4. Merge in sequence

See template at: 1-codebase-audit/codebase-auditor.md
