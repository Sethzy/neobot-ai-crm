# Landing And Auth De-Slop Goal

## Decision / Outcome

Landing and auth surfaces should no longer read as generic AI SaaS output. The public landing page and auth shell should keep NeoBot's competent, calm, operational brand while removing saturated 2026 tells: parchment-as-default warmth, decorative glass cards, oversized soft shadows, serif/editorial overuse, and repeated template scaffolding.

## Evidence Surface

Strong evidence:

- Current diffs limited to landing/auth styling and copy/components.
- Visual inspection of `/` and `/login` at desktop and mobile viewport sizes.
- Static slop scan using `.agents/skills/impeccable/scripts/detect.mjs`.
- Type/lint/test command that covers edited files without unrelated failures.
- Git commits split by fix so each change can be reverted independently.

Proxy evidence:

- Source grep showing reduced `bg-parchment`, `backdrop-blur-xl`, `shadow-2xl`, raw warm neutrals, and `font-serif` use in landing/auth.

## Scope And Boundaries

In scope:

- `app/page.tsx` and landing components under `src/components/landing/`.
- Auth surfaces under `src/components/auth/` and auth route pages only if required by shared shell changes.
- Shared visual tokens only when needed for landing/auth and without altering dashboard product UI behavior.

Out of scope:

- Dashboard/product UI, market pages, CRM pages, chat product surfaces, migrations, Supabase, Managed Agents, demo scripts, unrelated package changes, and existing dirty files not touched for this goal.

## Constraints

- Preserve landing and auth functionality, routing, auth flows, and responsive behavior.
- Do not introduce raw Tailwind dashboard palette classes into dashboard components.
- Do not commit unrelated pre-existing changes.
- Use standard, readable implementations; avoid clever design abstractions.
- Each meaningful fix gets its own commit.
- Inspect the work after changes before marking the goal complete.

## Iteration Policy

After each fix, inspect the source diff and decide whether the remaining gap is landing, auth, responsiveness, or verification. Record the commit hash in the iteration log. If a visual regression appears, make a follow-up fix commit rather than mixing unrelated concerns.

## Continuation Prompt Loop

When you hit a stopping point, write one paragraph for the next improvement attempt. Include: current evidence, the strongest remaining gap, the next concrete action, and the verification surface to inspect afterward. Keep going until the Completion Audit is satisfied or the Blocked Condition is met.

## Blocked Condition

Progress is blocked if the app cannot be installed or run due to unrelated dependency/worktree breakage, if required design assets are missing and cannot be safely replaced, or if existing unrelated dirty changes overlap the same files in a way that makes landing/auth edits unsafe. Unblock by resolving dependency state, providing assets, or confirming how to handle overlapping changes.

## Completion Audit

| Deliverable | Evidence Required | Status | Evidence Link / Command |
| --- | --- | --- | --- |
| Goal checkpoint commit exists before UI fixes | Commit containing this goal artifact only | Not started | `git log --oneline -1` |
| Landing visual language de-slopped | Landing diff removes/reduces saturated AI tells while preserving route behavior | Not started | `git diff HEAD~..HEAD -- src/components/landing app/page.tsx` |
| Auth visual language de-slopped | Auth shell diff removes glass/default hero cards and keeps auth layout usable | Not started | `git diff HEAD~..HEAD -- src/components/auth app/login app/register app/forgot-password app/update-password` |
| Inspection completed | Desktop/mobile visual or source inspection recorded; static scan run | Not started | `node .agents/skills/impeccable/scripts/detect.mjs --json app src/components/landing src/components/auth` |
| Verification completed | Relevant lint/type/test command run and result recorded | Not started | `pnpm lint` or narrower available command |

## Goal Prompt

```text
/goal De-slop only NeoBot landing and auth surfaces, verified by focused landing/auth commits, current visual/source inspection of `/` and `/login`, the impeccable static detector output, and a relevant lint/type/test check, while preserving dashboard product UI, auth behavior, routing, responsiveness, existing unrelated dirty changes, and NeoBot's calm operational brand. Use only app/page.tsx, src/components/landing, src/components/auth, and directly necessary auth route files unless evidence proves another landing/auth file is required. Between iterations, inspect the diff and rendered/source evidence, write a one-paragraph continuation prompt for the next improvement attempt, and choose the next best action. If blocked or no valid paths remain, report attempted paths, evidence gathered, blocker, and what would unlock progress.
```

## Iteration Log

## Final Result
