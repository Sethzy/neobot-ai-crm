---
name: react-refactor-maintenance
description: Maintenance and refactor workflow for React/Vite/Tailwind/TanStack projects that turns recurring cleanup into a prioritized queue. Use when Claude needs to run duplication and dead-code checks (jscpd, knip), enforce eslint react-compiler and deprecation rules, review API route consolidation opportunities, split oversized files, improve tricky tests/comments, update docs, modernize React patterns (including removing unnecessary useEffect), or plan dependency/tool upgrades.
---

# React Refactor Maintenance

## Execution

**Announce at start:** "I'm executing the react-refactor-maintenance skill to run a focused refactor and maintenance pass."

## Overview

Run a repeatable audit, build an ordered refactor backlog, and execute the highest-impact fixes in small safe batches.

## Quick Start

1. Run the audit script:
   - `node --experimental-strip-types .agents/skills/react-refactor-maintenance/scripts/run-refactor-audit.ts --repo .`
2. Optional slow test profiling:
   - `node --experimental-strip-types .agents/skills/react-refactor-maintenance/scripts/run-refactor-audit.ts --repo . --include-test-profiling`
3. Open the generated summary:
   - `.agents/skills/react-refactor-maintenance/runtime/audit-*/summary.md`
4. Execute the top 1-3 queued items, then rerun lint/typecheck/tests.

## Workflow

1. Baseline and safety
   - Confirm clean understanding of current state with `git status`.
   - Run baseline checks (existing lint/typecheck/tests) before touching structure.
2. Generate findings
   - Run `scripts/run-refactor-audit.ts` to collect tool and codebase signals.
   - Treat `action-needed` steps as concrete backlog candidates.
3. Prioritize by risk and impact
   - High: broken lint/compile rules, dead code, duplicated logic.
   - Medium: route consolidation, oversized files, slow tests.
   - Low: docs polish and dependency upgrades.
4. Execute in thin slices
   - Apply one focused refactor at a time.
   - Keep behavior stable; avoid broad architecture churn unless explicitly requested.
5. Validate and report
   - Re-run lint/typecheck/tests.
   - Summarize what changed, what remains, and any follow-up work.

## Refactor Rules

- Prefer straightforward, DRY, and readable implementations.
- Remove features or abstractions that are not needed now (YAGNI).
- Favor composition and pure logic over effect-heavy flows.
- Keep API route changes behavior-compatible unless product requirements changed.
- Add tests when touching risky logic.
- Add concise comments only where logic is genuinely non-obvious.

## Output Format

Use this output structure for each run:

1. `Current state`
   - What was scanned and what commands were run.
2. `Top issues`
   - Ordered list of highest-value fixes.
3. `Changes made`
   - What was refactored and why.
4. `Validation`
   - Lint/typecheck/tests status after changes.
5. `Remaining queue`
   - Next recommended refactors.

## References

- Refactor playbook and command matrix: `references/refactor-playbook.md`
- Modern React rewrite patterns: `references/modern-react-patterns.md`
- Audit automation script: `scripts/run-refactor-audit.ts`
