# Pre-prod codebase audit — 2026-04-21

Author: audit driven via `/simplify` workstream
Scope: `app/`, `src/` — the product codebase

## TL;DR

After several refactors the codebase is **in significantly better shape than
feared**. No legacy `-v2/-old/-deprecated` file naming, no `@deprecated` tags,
no lingering `TODO/FIXME/HACK` comments. Design tokens are ~99% compliant;
TanStack Query is the established data-fetching pattern (30+ hooks under
`src/hooks/`); API routes uniformly use zod except for two stragglers.

The real risks before shipping are **local and specific**, not systemic.
Deferring monolith decomposition and parallel-component de-duplication to
post-prod — both are architectural changes, not simplifications.

## Healthy baselines

| Signal | Finding |
|---|---|
| Legacy naming (`-v2`, `-old`, `-legacy`, `-deprecated`, `.bak`) | **None** |
| `@deprecated` JSDoc tags | **None** |
| `TODO` / `FIXME` / `HACK` / `XXX` comments | **None** |
| Raw Tailwind palette classes (`bg-amber-500`, `text-green-600`, …) in dashboard scope | **Zero occurrences** |
| Color maps centralization | `src/lib/ui/color-maps.ts` — 11 exported maps, all Layer 2/3 semantic tokens |
| API route validation | zod used in every route except `/api/pdf` (`/api/health` is a GET and has no body) |
| Data-fetching pattern | TanStack Query via custom hooks in 30+ files under `src/hooks/` |
| Critical-path tests | managed-agents adapter, stripe, triggers, webhooks, auth, chat API all have `__tests__` coverage |

## Findings

Risk tiers: 🟢 safe / 🟡 needs review / 🔴 defer post-prod.

### Finding 1 — Dead 16,356-line vendored data module 🟢

- **Paths**
  - `src/lib/crm/free-email-providers.ts` (16,356 lines)
  - `src/lib/crm/__tests__/free-email-providers.test.ts`
- **Evidence**: `FREE_EMAIL_PROVIDERS` and `isFreeEmailDomain` are imported
  **only by their own test file**. Vendored from Twenty CRM per the header
  comment. Referenced in
  `docs/product/tasks/2026-04-10-crm-guardrails-phase-1-tasklist.md` as a
  planned guardrail step that was never wired into managed-agent tools.
- **Impact**: Server-only library, so bundle impact likely zero, but the file
  itself inflates the repo and any contributor searching for CRM code hits
  16k lines of email domains.
- **Fix**: Delete both files.
- **Risk**: 🟢 — zero production call sites confirmed by grep.

### Finding 2 — Raw `await fetch` in 8 component files 🟢

Data-fetching pattern is otherwise standardized on TanStack Query hooks. Eight
stragglers still use raw `fetch` in component bodies:

- `src/components/settings/agent-context-form.tsx`
- `src/components/chat/chat-composer.tsx`
- `src/components/settings/profile/default-messaging-agent-form.tsx`
- `src/components/settings/messaging-channels/telegram-connect-row.tsx`
- `src/components/settings/autopilot-card.tsx`
- `src/components/ai-elements/prompt-input.tsx`
- `src/components/crm/record-drawer/drawer-files-tab.tsx`
- `src/components/property/market-search-box.tsx`

**Fix**: Per file, either (a) call an existing `use-*` hook that already
targets the endpoint, or (b) for one-shot POSTs, wrap the `fetch` in
`useMutation` for consistent loading/error state.

**Risk**: 🟢 per file. May split across multiple commits by feature.

### Finding 3 — `dark:` prefix audit on semantic tokens 🟡

CLAUDE.md rule: "No `dark:` prefixes on accent colors — CSS cascade handles it."

**Occurrences**: 47 across 23 files under `src/components/ui/`. Heaviest in
`badge.tsx` (6), `button.tsx` (4), `input-group.tsx` (3), `tabs.tsx` (3),
`switch.tsx` (2), `input-otp.tsx` (2). `iphone.tsx` has 11 but is a hardware
mock — exclude from scope.

**Nuance**: Many usages are legitimate *opacity* variants for dark-mode
contrast (e.g. `bg-destructive/10` light → `dark:bg-destructive/20` dark),
not accent-color swaps. Those are deliberate, not violations. Each case
needs a 10-second eyeball.

**Fix**: Case-by-case. Remove where the CSS cascade already handles the
swap; keep where the intent is distinct light/dark opacity. Add a short
comment block to `src/lib/ui/color-maps.ts` or `app/globals.css` documenting
the decision rule so future contributors don't re-add redundant prefixes.

**Risk**: 🟡 — visual regression possible if a legitimate dark-mode opacity
is mistakenly removed. Toggle dark-mode in the browser while editing.

### Finding 4 — `/api/pdf` uses a raw type assertion instead of zod 🟢

- `app/api/pdf/route.ts` — uses `await req.json() as { spec, download?, filename? }`

(Original audit flagged `/api/health` too — on re-read, it's a GET with no
request body, so zod adds nothing. Dropped from scope.)

The `spec` field is a vendor type from `@json-render/core` — zod can't
cheaply reconstruct it, so we validate only the wrapper fields. The real
safety win is capping `filename` length, which currently has no upper bound.

**Fix**: Minimal wrapper zod (`spec: z.unknown()`, `download` boolean,
`filename` string ≤200 chars) + the existing `sanitizeFilename` guard.

**Risk**: 🟢 — additive. The route currently has zero in-repo callers, so
this is defense-in-depth rather than fixing a known exploit.

### Finding 5 — Thin UI wrapper components 🟡 (informational — no action recommended)

- `src/components/ui/aspect-ratio.tsx` (11 L)
- `src/components/ui/skeleton.tsx` (13 L)
- `src/components/ui/spinner.tsx` (10 L)

These are near pass-throughs to Radix/shadcn primitives. Listed for
completeness. They do add `data-slot` attributes that maintain the shadcn
convention — removing them would force import fan-out across the codebase
for negligible gain.

**Recommendation**: **Keep as-is. No action pre-prod.**

## Deferred post-prod 🔴

Documenting here so these don't get lost. Each is architectural or
coverage-oriented, not a simplification:

### Monoliths to decompose

| File | Lines | Why it's hard |
|---|---|---|
| `src/components/ai-elements/prompt-input.tsx` | 1,443 | Context providers, keybindings, screenshot capture, model selection, textarea — tightly coupled |
| `src/components/chat/tool-call-inline.tsx` | 1,174 | Streaming approvals, execution, and state transitions — needs state-machine refactor |
| `src/lib/managed-agents/adapter.ts` | 1,067 | Core Anthropic session event → local tool dispatch. Heavy tests rely on this surface |
| `src/components/command-menu.tsx` | 797 | Global search, shortcuts, model selection in one file |
| `src/components/crm/kanban-board.tsx` | 674 | Board layout, drag-drop, filtering combined |

### Duplicate / parallel component trees

`src/components/chat/` and `src/components/ai-elements/` both expose
message and prompt components with overlapping rendering concerns. Merging
requires a deliberate boundary design — not a simplify pass.

### Component test-coverage gap

~47% of components have no `.test.tsx`. API routes and library code are
well-covered (395 test files), which is the higher-risk surface. The
pre-prod risk of component regressions is mitigated by manual smoke tests
and by the critical-path integration tests already in place.

## Execution order (planned commits)

| # | Commit | Risk |
|---|---|---|
| 2.1 | `chore(crm): remove unused free-email-providers vendored list` | 🟢 |
| 2.2 | `feat(api/pdf): add wrapper zod validation with filename length cap` | 🟢 |
| 2.3 | `refactor(components): migrate 8 raw-fetch call sites to TanStack Query` | 🟢 |
| 2.4 | `chore(ui): remove redundant dark: prefixes on semantic tokens` | 🟡 |

Each commit gated on: `pnpm typecheck && pnpm lint && pnpm test`. 2.4
additionally requires a manual dark-mode toggle in the browser.

## Ship-gate checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (includes the new `lint:typography` guard)
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds; compare bundle size before/after Finding 1 deletion
- [ ] Chat golden path: send a message, tool call renders, managed-agent session against Haiku
- [ ] CRM golden path: deals page, kanban, contact drawer
- [ ] Settings: each sub-page loads
- [ ] Dark mode: toggle verifies Finding 3 cleanup introduced no regressions
