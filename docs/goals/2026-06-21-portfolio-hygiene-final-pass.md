# Portfolio Hygiene Final Pass

## Decision / Outcome

The repository should read as a polished NeoBot product codebase to a hiring
manager or technical lead opening GitHub or VS Code. Public-facing docs and
inspection surfaces should consistently present NeoBot. Legacy `sunder-*`
names may remain only where they are internal, historical, or runtime-sensitive.

The app/runtime behavior must remain unchanged.

## Evidence Surface

Strong evidence:

- `git status --short --untracked-files=all`
- `git ls-tree --name-only HEAD`
- `git ls-files` checks for tracked local state, secrets, generated output, and
  portfolio-noise paths
- targeted `rg` checks for public-facing `Sunder` references outside archive,
  migrations, tests, and internal/runtime identifiers
- `pnpm lint`
- `pnpm vitest run --project unit`
- `pnpm build`
- `gitleaks detect` on a tracked `git archive`

Proxy evidence:

- README, `PRODUCT.md`, `AGENTS.md`, `CLAUDE.md`, and `docs/README.md` read
  coherently as NeoBot onboarding material
- root-level folder map has clear explanations for any retained workbench
  folders
- ignored local folders are hidden or documented for local VS Code inspection

## Scope And Boundaries

In scope:

- Public-facing docs and reviewer guidance
- Tracked local state cleanup
- Ignore rules and optional editor hygiene settings
- Explanations for retained agent workbench folders
- Safe naming cleanup where `Sunder` is clearly stale user-facing copy

Out of scope:

- Moving `app/`, `src/`, `supabase/`, `managed-agents/skills/`, or
  `scripts/managed-agents/`
- Renaming database migrations or historical migration content
- Renaming runtime storage keys, CSS variables, skill registry identifiers,
  Supabase data, Managed Agent names, or deployed agent behavior without a
  separate migration plan
- Feature changes, UI redesign, schema changes, or tool contract changes
- Git history rewrite

## Constraints

- Preserve app behavior exactly.
- Do not commit `.env` files, credentials, auth state, or local browser/session
  state.
- Do not erase useful historical docs; archive or label them when needed.
- Prefer small, focused commits.
- Keep `managed-agents/skills/` at the repo root because app/runtime scripts
  rely on it as a runtime catalog.
- If a `Sunder` reference could affect runtime compatibility, leave it and
  document why.

## Iteration Policy

After each pass:

1. Inspect current evidence with `git status`, `git ls-files`, and targeted
   `rg` checks.
2. Classify issues as public-facing polish, local-state cleanup, internal
   runtime identifier, or historical archive.
3. Make only low-risk presentation or tracked-state changes.
4. Run the smallest verification command that covers the change.
5. Record the next gap before continuing.

## Continuation Prompt Loop

When you hit a stopping point, write one paragraph for the next improvement
attempt. Include: current evidence, the strongest remaining gap, the next
concrete action, and the verification surface to inspect afterward. Keep going
until the Completion Audit is satisfied or the Blocked Condition is met.

## Blocked Condition

Progress is blocked if a public-facing `Sunder` reference cannot be classified
without product intent, or if a cleanup would require changing deployed Managed
Agent IDs/prompts, Supabase persisted data, database history, or user-visible
runtime behavior. The blocker is removed by explicit product naming guidance or
a separate migration plan.

## Completion Audit

| Deliverable | Evidence Required | Status | Evidence Link / Command |
| --- | --- | --- | --- |
| Public-facing product docs present NeoBot coherently | `rg -n 'Sunder|sunder' README.md PRODUCT.md AGENTS.md CLAUDE.md docs/README.md docs/product/plans/2026-04-13-PR-list-neobot-current.json managed-agents/skills/README.md` has only intentional historical/archive or compatibility-note matches | Verified | Matches are limited to README legacy-name note and `docs/archive/roadmap/Sunder - Source of Truth/` historical paths. Current PR inventory is `docs/product/plans/2026-04-13-PR-list-neobot-current.json`. |
| Tracked local/deploy state removed or converted to examples | `git ls-files | rg '(^|/)(\\.temp|\\.branches|\\.herenow/state\\.json|auth-state\\.json|settings\\.local\\.json)$'` returns no disallowed tracked local state | Verified | Command returned no output after `chore(repo): remove tracked local cli state`. |
| Retained workbench folders look intentional | README/docs explain `AGENTS.md`, `CLAUDE.md`, `.agents/`, `managed-agents/skills/`, and ignored local client state | Verified | `README.md` Agent Workbench section names the retained workbench artifacts, while `.gitignore` keeps `.claude/`, `.codex/`, `.context/`, `.kiro/`, `.windsurf/`, root `skills/`, and generated local state out of the tracked repo surface. |
| No generated artifact regressions | `git ls-files | rg '(^|/)(node_modules|clone-ui-runs|dogfood-output|roadmap docs|^package-lock\\.json$|\\.tmp-vitest\\.json|datagrid-libraries-2026\\.json|ai-agent-hitl-approval\\.json)'` returns no disallowed paths | Verified | Command returned no output. Nested `internal/media/demo-video/package-lock.json` remains intentional prototype dependency metadata, not the root app lockfile. |
| Security scan stays clean | `gitleaks detect --source <git-archive-temp-dir> --no-git --redact` exits 0 | Verified | Final `HEAD` archive scan found no leaks. Report path: `/tmp/neobot-gitleaks-portfolio-head.json`. |
| App still verifies | `pnpm lint`, `pnpm vitest run --project unit`, and `pnpm build` pass; any full integration gap is documented with exact missing env | Verified | `pnpm lint` passed; `pnpm vitest run --project unit` passed 433 files / 2438 tests; `pnpm build` exited 0. Build kept the existing non-fatal sitemap fallback when Supabase DNS could not resolve in this environment. |
| Final repo inspection is clean | `git status --short --untracked-files=all`, `git ls-tree --name-only HEAD`, and `git log --oneline -20` show focused commits and a coherent top level | Verified | Final `git status --short --untracked-files=all` returned no output. `git ls-tree --name-only HEAD` shows the documented product/docs/runtime surface plus retained workbench folders. `git log --oneline -20` shows the focused final-pass commits at the top. |

## Goal Prompt

```text
/goal Make the NeoBot repository pass a hiring-manager/technical-lead hygiene inspection, verified by clean public-facing NeoBot docs, no tracked local/deploy state, documented retained workbench folders, clean generated-artifact and secret checks, and passing lint/unit/build checks, while preserving app/runtime behavior exactly. Use only presentation docs, ignore/editor hygiene, and tracked-state cleanup; do not move core app/runtime folders or rename runtime-sensitive `sunder-*` identifiers without explicit evidence that the change is safe. Between iterations, inspect the current repo evidence, classify each issue as public-facing polish, local-state cleanup, internal runtime identifier, or historical archive, record a one-paragraph continuation prompt, and choose the next lowest-risk action. If blocked, report the ambiguous reference or runtime risk, evidence gathered, and the exact decision needed to continue.
```

## Iteration Log

- 2026-06-21: Inspected the current tree and found tracked local state
  (`supabase/.temp`, `supabase/.branches`, and
  `scripts/property-pipeline/.herenow/state.json`) plus live docs that still
  presented Sunder as the current product name.
- 2026-06-21: Removed tracked local/deploy state, added ignore rules for those
  generators, and committed the cleanup as
  `75a40e7b chore(repo): remove tracked local cli state`.
- 2026-06-21: Updated live reviewer docs to present NeoBot, renamed the current
  PR inventory file to `2026-04-13-PR-list-neobot-current.json`, added a README
  compatibility note for internal `sunder-*` names, documented retained
  workbench folders, and committed the polish as
  `025adf3c docs(repo): align inspection surface with neobot brand`.
- 2026-06-21: Verified with `git diff --check`, JSON parse, tracked-path
  guards, public naming guards, `pnpm lint`, `pnpm vitest run --project unit`,
  `pnpm build`, final status/log/top-level inspection, and a gitleaks scan of
  the final `HEAD` archive.

## Final Result

The portfolio hygiene pass is complete. The public inspection surface now
presents NeoBot consistently while preserving runtime-sensitive `sunder-*`
compatibility identifiers and historical archive names. Tracked local CLI state
has been removed and ignored, retained workbench folders are documented, the
current planning source of truth uses the NeoBot filename, and app verification
still passes. Final status is clean, the top-level tree matches the documented
inspection surface, and the committed tree passed gitleaks.
