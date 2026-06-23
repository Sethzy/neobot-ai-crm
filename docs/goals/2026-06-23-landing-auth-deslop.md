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
| Goal checkpoint commit exists before UI fixes | Commit containing this goal artifact only | Complete | `b8803653 chore: define landing auth deslop goal` |
| Landing visual language de-slopped | Landing diff removes/reduces saturated AI tells while preserving route behavior | Complete | `5a1d938a style: de-slop landing visual language` |
| Auth visual language de-slopped | Auth shell diff removes glass/default hero cards and keeps auth layout usable | Complete | `bcee00d0 style: simplify auth visual shell` |
| Inspection completed | Desktop/mobile visual or source inspection recorded; static scan run | Complete | `node .agents/skills/impeccable/scripts/detect.mjs --json app/page.tsx app/globals.css app/layout.tsx src/components/landing src/components/auth app/login app/register app/forgot-password app/update-password app/auth/confirm` returned `[]`; screenshots inspected at `/tmp/neobot-deslop-screens/*.png` |
| Verification completed | Relevant lint/type/test command run and result recorded | Complete | `pnpm typecheck` passed; `pnpm lint` passed |

## Goal Prompt

```text
/goal De-slop only NeoBot landing and auth surfaces, verified by focused landing/auth commits, current visual/source inspection of `/` and `/login`, the impeccable static detector output, and a relevant lint/type/test check, while preserving dashboard product UI, auth behavior, routing, responsiveness, existing unrelated dirty changes, and NeoBot's calm operational brand. Use only app/page.tsx, src/components/landing, src/components/auth, and directly necessary auth route files unless evidence proves another landing/auth file is required. Between iterations, inspect the diff and rendered/source evidence, write a one-paragraph continuation prompt for the next improvement attempt, and choose the next best action. If blocked or no valid paths remain, report attempted paths, evidence gathered, blocker, and what would unlock progress.
```

## Iteration Log

- `b8803653` created this goal artifact before UI fixes.
- `5a1d938a` changed the landing visual language: moved landing surfaces from warm parchment to a green-tinted neutral canvas, removed Newsreader/unused old auth-preview assets, reduced serif/italic display usage, removed glass/shadow treatments, and simplified section cards/tables.
- `bcee00d0` simplified the auth shell: replaced the watercolor/gradient/glass feature cards with a plain dark trust panel, removed the heavy left-column shadow, and normalized oversized alert radii.
- Verification after both UI commits: detector returned `[]`; `pnpm typecheck` passed; `pnpm lint` passed; Playwright screenshots of `/`, `/login`, and landing sections showed no horizontal overflow and no remaining glass/parchment/editorial landing pattern.

## Final Result

Landing and auth de-slop work is complete. The public landing page now uses a calmer green-tinted neutral canvas, sans/product-minded headings, cleaner cards/tables, and fewer decorative shadows. The auth shell now reads as an operational trust panel instead of a generic glassmorphism SaaS split screen. The work is split into revertable commits:

- `5a1d938a style: de-slop landing visual language`
- `bcee00d0 style: simplify auth visual shell`

Evidence: `pnpm typecheck` passed, `pnpm lint` passed, the impeccable detector returned `[]` for the landing/auth target set, and screenshots were inspected for desktop/mobile landing and login plus landing sections. Existing unrelated dirty files were not committed.
