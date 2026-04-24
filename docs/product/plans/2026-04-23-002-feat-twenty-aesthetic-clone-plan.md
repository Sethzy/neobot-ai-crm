---
title: "feat: Clone Twenty CRM aesthetics into Sunder (tokens + component recipes)"
type: feat
status: active
date: 2026-04-23
origin: docs/product/ideations/2026-04-23-twenty-aesthetic-clone-requirements.md
---

# feat: Clone Twenty CRM aesthetics into Sunder (tokens + component recipes)

## Overview

Bring Sunder's CRM data-plane surfaces (tables, kanban, record drawer, shared primitives) to visual parity with Twenty CRM's density, proportions, and motion budget — while preserving Sunder's brand identity (Flexoki palette, teal primary, Figtree/Fraunces typography, warm-paper canvas). Five sequential phases, one commit per phase, all on a single feature branch, one PR at the end.

Origin doc: [2026-04-23-twenty-aesthetic-clone-requirements.md](../ideations/2026-04-23-twenty-aesthetic-clone-requirements.md). Reference drift analysis: [`roadmap docs/Sunder - Source of Truth/references/twenty-crm/crm-aesthetics-drift-analysis.md`](../../../roadmap%20docs/Sunder%20-%20Source%20of%20Truth/references/twenty-crm/crm-aesthetics-drift-analysis.md).

## Problem Statement / Motivation

Sunder's CRM surfaces read as a generic shadcn dashboard: rows are ~40–44 px tall with `py-2.5`; badges are full pills at `rounded-4xl`; row selection tints gray; radii are ~5.6 px (`--radius: 0.35rem`); shadows exist across 8 tiers but are barely used. Twenty's "Attio-level" feel derives from **sizing and proportion**, not colors: 32 px rows with zero vertical padding, 4 px chip radii, blue-tinted selection, 4 semantic shadow roles, and exactly two transition durations (100 / 300 ms). Cloning Twenty's token values and component recipes — without touching Sunder's colors, fonts, or canvas — is the smallest change with the largest perceptual impact. Origin decision carried forward: **tokens-only clone, not a brand clone** (see origin: `2026-04-23-twenty-aesthetic-clone-requirements.md` §Key Decisions).

## Proposed Solution

Five phases, each a single commit on a feature branch `feat/twenty-aesthetic-clone`:

1. **Tokens** — `app/globals.css` only. Update `--radius`, add `--radius-chip`, add four semantic shadow-role tokens, add `--selection` token, add two semantic duration tokens. Zero component edits. Deployable but invisible.
2. **List-table + row density** — `list-table.tsx`, `table.tsx`. 32 px rows, zero vertical cell padding, mixed-case headers, accent-tinted selection, 100 / 300 ms transitions.
3. **Shared primitives** — `badge.tsx`, `button.tsx`, `input.tsx`, `avatar.tsx`, `skeleton.tsx`. Badge reshape to 4 px chip. Button/input pick up new `--radius` automatically. Avatar gains `xs` size variant (16 px).
4. **Kanban + record drawer** — `kanban-board.tsx`, `deal-kanban-card.tsx`, record-drawer components, `quick-edit-cell.tsx`. Card radius to 8 px, 40 px header avatar, inline-edit focus treatment.
5. **Motion + ornament guard** — global transition utility audit, CRM-surface ornament-class sweep (grep confirms none currently, so this phase is a lint/guard step), empty-state polish.

Each phase is independently shippable and visually inspectable at `/customers/people`, `/customers/companies`, `/customers/deals`, `/tasks`, and a record drawer.

## Technical Considerations

**Token propagation.** Tailwind 4's `@theme inline` block (globals.css:325–340) already re-exports `--radius-*` and `--shadow-*` as theme tokens. Changing `--radius` at the `:root` level automatically updates every `rounded-md/lg/xl` utility consumer — no component edits required for the radius cascade. However, hard-coded utilities like `rounded-4xl` (badge) and `rounded-xl` (kanban card) bypass the variable and need explicit swaps.

**Row density cascade.** Changing `px-4 py-2.5` → `h-8 px-2` on `<td>`/`<th>` in `list-table.tsx` changes the vertical rhythm for every authenticated list surface (Tasks, Companies, People, Deals) in one edit, because they all use `ListTable`. Zero per-page changes required.

**Selection color.** Introducing `--selection` as a new CSS variable means every consumer can swap `bg-app-hover/80` → `bg-[var(--selection)]`. Using `color-mix()` keeps the token readable and automatically picks up dark-mode primary.

**Dark mode.** All changes pass through the existing `.dark` CSS-variable cascade; no `dark:` prefix additions needed. Shadow tokens already have a dark-mode block (globals.css:172–179) — the four new role tokens get a dark variant that aliases to the same computed shadow scale.

**Focus ring trade.** R10 explicitly splits focus treatment: keep `ring-3` on explicit form inputs (`input.tsx` accessibility), replace with border-color + 1 px inner glow on inline-edit cells (`quick-edit-cell.tsx`). This is intentional and not a regression.

**Ornament classes.** `.badge-shimmer` is used in `src/components/landing/Pricing.tsx` (not CRM); `.card-shimmer-sweep`, `.icon-flame`, `.icon-key`, `.icon-clock` have no active callers in the CRM surface per `grep -rn` on `src/`. R15 is a guard (enforce with a visual spot-check), not an active removal pass.

**Resolved deferred technical questions** (from origin `Outstanding Questions § Deferred to Planning`):

1. **Shadow-role mapping.** Map the four new semantic tokens onto existing scale:
   - `--shadow-surface-light` → `var(--shadow-sm)` (popovers, floating panels, field selectors)
   - `--shadow-surface-strong` → `var(--shadow-lg)` (modals, drawers, dialogs)
   - `--shadow-surface-underline` → `0 1px 0 0 hsl(225 27.7778% 14.1176% / 0.08)` (sticky headers)
   - `--shadow-surface-menu` → `var(--shadow-xl)` (dropdown menus, context menus, command palettes)
2. **Selection token vs inline.** Introduce a standalone `--selection` CSS variable defined as `color-mix(in oklch, var(--primary) 10%, transparent)`. Dedicated token makes the intent self-documenting and gives us a single point to retune the tint later. Inline `bg-primary/10` would also work; the carrying cost of one extra line of CSS is negligible and clarity wins.
3. **Chip vs Badge.** Re-shape `Badge` in place. No new `Chip` component. Current soft-tone variants (`destructive`, `success`, `info`, `warning`) stay intact — only the container shape changes (`h-5 rounded-4xl px-2 py-0.5` → `h-4 rounded-[var(--radius-chip)] px-1.5 py-0` + `text-[11px] font-medium`). Callers need zero edits.
4. **Avatar sizing.** Add a new `xs` variant (16 px) to the existing `data-[size=...]` discriminator system. Current set: `sm` (24), `default` (32), `lg` (40). New set: `xs` (16), `sm` (24), `default` (32), `lg` (40). No breaking change; table call-sites opt in explicitly with `size="xs"`.
5. **Delivery unit.** Single feature branch `feat/twenty-aesthetic-clone`. One commit per phase (5 commits). One PR at the end after Phase 5 spot-check passes.

## System-Wide Impact

- **Interaction graph.** Every authenticated list page (`/customers/people`, `/customers/companies`, `/customers/deals`, `/tasks`) renders through `ListTable`; Phase 2's row-height/padding changes cascade automatically. Kanban surfaces on `/customers/deals` and `/tasks` (if board view) consume `kanban-board.tsx` and `deal-kanban-card.tsx`. Record drawers are shared across contacts, companies, deals, tasks via `record-drawer.tsx` + per-entity `*-drawer-content.tsx`. Badge is used broadly — CRM tables, kanban column chips, file-type indicators, task-status pills, dashboard metric tags.
- **Error propagation.** None — this is pure CSS/class-name edits. No runtime behavior changes.
- **State lifecycle risks.** None.
- **API surface parity.** Avatar gains a new `size` value. Callers that passed `size="default"` or omitted it keep rendering at 32 px. New `size="xs"` must be opted into. No caller breaks.
- **Integration test scenarios.** No backend tests affected. Existing component unit tests under `src/components/crm/record-drawer/__tests__/` and elsewhere should continue to pass since they test behavior, not pixel values. A manual spot-check on all five CRM routes + a record drawer is the validation gate.

## Acceptance Criteria

### Phase 1 — Tokens

- [ ] `app/globals.css` `--radius` updated from `0.35rem` to `0.5rem`.
- [ ] `app/globals.css` defines `--radius-chip: 0.25rem` (4 px) at `:root` and `.dark`.
- [ ] `app/globals.css` defines `--shadow-surface-light`, `--shadow-surface-strong`, `--shadow-surface-underline`, `--shadow-surface-menu` at `:root` and `.dark` with the mapping above.
- [ ] `app/globals.css` defines `--selection: color-mix(in oklch, var(--primary) 10%, transparent)` at `:root` and `.dark`.
- [ ] `app/globals.css` defines `--duration-hover: 100ms` and `--duration-select: 300ms` at `:root`.
- [ ] `@theme inline` block re-exports all new tokens so Tailwind arbitrary values (`rounded-[var(--radius-chip)]`, `shadow-[var(--shadow-surface-menu)]`) work.
- [ ] Dev server builds without Tailwind/PostCSS errors.
- [ ] `/customers/people` visually unchanged (tokens exist but no consumer yet).

### Phase 2 — List-table + row density

- [ ] `src/components/ui/list-table.tsx` `<th>` rows use `h-8 px-2` instead of `px-4 py-2.5`.
- [ ] `src/components/ui/list-table.tsx` `<td>` rows use `h-8 px-2` instead of `px-4 py-2.5`.
- [ ] Column header text drops `type-table-heading` in favor of `text-[13px] font-medium text-muted-foreground` (R9: mixed-case, not uppercase).
- [ ] Clickable row hover uses `transition-colors duration-[var(--duration-hover)]` (≈100 ms) + `hover:bg-app-hover/70`.
- [ ] Selected row uses `bg-[var(--selection)] transition-colors duration-[var(--duration-select)]` instead of `bg-app-hover/80`.
- [ ] Pinned-first-column selected state also uses `bg-[var(--selection)]` (not `bg-app-hover/80`).
- [ ] Skeleton row height drops to match (`h-3.5` stays; row is shorter now).
- [ ] `src/components/ui/table.tsx` hover + selected states match the above.
- [ ] Spot-check: `/customers/people` rows render at 32 px, cell contents vertically centered, no clipping, selection renders as faint teal tint.

### Phase 3 — Shared primitives

- [ ] `src/components/ui/badge.tsx` container utility changes from `h-5 ... rounded-4xl px-2 py-0.5 text-caption` to `h-4 ... rounded-[var(--radius-chip)] px-1.5 py-0 text-[11px] font-medium`.
- [ ] All existing badge variants (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, `success`, `info`, `warning`) visually render as 4 px chips.
- [ ] `src/components/ui/button.tsx` picks up the new 8 px radius automatically via `rounded-lg` (no edit needed unless the `min(var(--radius-md), 10px)` clamp in `xs`/`sm`/`icon-xs`/`icon-sm` sizes also needs bumping — verify visually).
- [ ] `src/components/ui/input.tsx` picks up new radius via `rounded-lg` (no edit needed).
- [ ] `src/components/ui/avatar.tsx` adds `data-[size=xs]:size-4` for 16 px avatars. Fallback text size scales to `group-data-[size=xs]/avatar:text-[10px]`.
- [ ] Call-sites in list-table column renderers (wherever an avatar appears in a CRM cell) pass `size="xs"`. Candidates: deal primary-column renderer, contact primary-column renderer, company primary-column renderer in `src/lib/crm/build-columns.tsx` and any per-entity column builder.
- [ ] Record-drawer header avatars explicitly pass `size="lg"` (already 40 px).
- [ ] `src/components/ui/skeleton.tsx` radius follows `--radius-chip` or `--radius` (whichever matches context) — light edit only if current `rounded-md` reads wrong after the cascade.
- [ ] Spot-check: a task-status badge on `/tasks` renders as a 16 px tall, 4 px radius chip. A primary CTA button renders at 8 px radius.

### Phase 4 — Kanban + record drawer

- [ ] `src/components/crm/kanban-board.tsx` `boardCardClassName` changes from `rounded-xl border ... px-3 py-3 transition hover:bg-app-hover/35 hover:shadow-sm` to `rounded-md border ... p-3 transition-all duration-[var(--duration-hover)] hover:bg-app-hover/35 hover:shadow-[var(--shadow-surface-light)]`.
- [ ] `src/components/crm/kanban-board.tsx` column-header chip (lines 183–188) uses `rounded-[var(--radius-chip)]` instead of `rounded`.
- [ ] `src/components/crm/deal-kanban-card.tsx` internal padding/avatars align with the new recipe (table-cell avatars go `xs`; any `size-5` blocks shrink to `size-4` where the design calls for a 16 px unit).
- [ ] `src/components/crm/record-drawer/record-detail-panel-shell.tsx` title input uses `rounded-md` (picks up the new 4 px `--radius-md`), tab bar retains underline but active-tab border uses `border-foreground` (already correct — verify no edits needed).
- [ ] Record-drawer field-label styling across `contact-drawer-content.tsx`, `company-drawer-content.tsx`, `deal-drawer-content.tsx`, `task-drawer-content.tsx`, `collapsible-field-group.tsx`, `drawer-section.tsx`: every field label renders `text-[13px] font-medium text-muted-foreground` and is mixed-case. Remove any `uppercase` or `.type-kicker` utility on field labels (spot-check with `grep -n "uppercase\|type-kicker" src/components/crm/record-drawer/`).
- [ ] `src/components/crm/quick-edit-cell.tsx` inline-edit `<Input className="h-7 type-control">` focus treatment changes from default `ring-3` to `focus-visible:border-primary focus-visible:shadow-[0_0_0_1px_var(--primary)] focus-visible:ring-0`. Only inline-edit cells — keep the base `Input` ring-3 treatment intact.
- [ ] Spot-check: open a deal in the record drawer. Kanban card renders at 8 px radius, card shadow appears on hover only. Field labels are mixed-case 13 px medium muted-foreground. Inline-editing a deal name shows a blue border + 1 px glow, not an outer 3 px ring.

### Phase 5 — Motion + ornament guard

- [ ] Global transition audit: search `grep -rn "transition-all\|transition-colors" src/components/ui/ src/components/crm/` and verify every match either has an explicit `duration-*` class or is paired with the new `duration-[var(--duration-hover)]`. Fix any stragglers that default to Tailwind's 150 ms.
- [ ] Ornament guard: `grep -rn "icon-flame\|icon-key\|icon-clock\|card-shimmer-sweep\|badge-shimmer" app/\(dashboard\)/ src/components/crm/ src/components/ui/` returns no CRM-surface matches. (`.badge-shimmer` in `src/components/landing/Pricing.tsx` is expected and allowed.)
- [ ] Empty state polish: `src/components/ui/empty-state.tsx` radii align with 8 px (icon wrapper stays circular — `rounded-full`). Verify visual consistency.
- [ ] Final spot-check of all 10 success criteria from the requirements doc:
  1. List-table rows render at 32 px with zero vertical padding.
  2. Status chips render at 16 px tall, 4 px radius, not pills.
  3. Selected rows render with a teal tint (not gray).
  4. Record-drawer field labels render mixed-case `text-[13px] font-medium text-muted-foreground`.
  5. Buttons render at 8 px radius.
  6. Inline-edit focus uses border + 1 px glow, not a 3 px outer ring.
  7. Table-cell avatars render at 16 px, record-drawer header at 40 px.
  8. No shimmer / wobble / spring animations on `/customers/*`, `/tasks`, or record drawers.
  9. Hover transitions at 100 ms, row-selection at 300 ms.
  10. Visual density recognizably matches Twenty on all five CRM surfaces.

## Success Metrics

- Subjective density parity with Twenty on the four list surfaces and one drawer. Reviewer ("is this tighter than before?") answers yes for all five phases.
- Zero TypeScript build errors. Zero Tailwind/PostCSS compile errors.
- Existing unit tests under `src/components/crm/record-drawer/__tests__/` continue to pass without modification.
- No regression reported on chat / landing / settings / auth surfaces after all five phases ship (these surfaces should be pixel-identical since no scoped changes touch them; the `--radius` bump is the one global token change and its effect on chat/landing/settings should be checked).

## Dependencies & Risks

- **Radius cascade side effects.** Bumping `--radius` from 0.35 rem to 0.5 rem affects every `rounded-lg`/`rounded-md`/`rounded-xl` consumer across the entire app. Landing, chat, settings, auth, modal dialogs — everything gets slightly rounder. Mitigation: spot-check a landing page, a chat thread, the login screen, and the settings page after Phase 1 lands. If anything looks wrong on a specific non-CRM surface, override locally with an arbitrary value (`rounded-[0.35rem]`) rather than reverting the token.
- **Button radius clamps.** `src/components/ui/button.tsx` has `rounded-[min(var(--radius-md),10px)]` on `xs`/`sm` sizes. With the new `--radius: 0.5rem`, `--radius-md` becomes 6 px (calc applied in globals.css:327), the `min()` picks 6 px. Previously it was `min(3.6px, 10px) = 3.6px`. So xs/sm buttons get slightly rounder. This is consistent with the goal.
- **Legacy `rounded-4xl` badge usages.** If any caller does `<Badge className="rounded-full">` to override the current pill (unlikely), the override still works. Inverse — callers wanting the old pill shape after Phase 3 — would need to opt back in explicitly. Grep the codebase for `rounded-4xl` to verify no caller depends on the old badge default.
- **Dark mode shadow visibility.** Twenty's shadow values are calibrated against pure-white gray12 canvas. Our light canvas is already white (`--app-canvas: oklch(1 0 0)`), so shadows read correctly. In dark mode, shadows are subtle (0.04 alpha) and may be invisible; this is consistent with how they read today. No action required unless a user surface flags it.
- **Phase 2's effect on existing screenshot tests.** None known — Sunder has no visual-regression suite. If one exists or is added, golden images must be regenerated after Phase 5.

## Implementation Phases

### Phase 1 — Tokens (`app/globals.css` only)

**Commit:** `feat(aesthetic-phase-1): token updates for Twenty-aesthetic clone`

**Files touched (1):**
- `app/globals.css`

**Exact edits:**

1. Line 52 (`:root`):
   ```diff
   - --radius: 0.35rem;
   + --radius: 0.5rem;
   ```

2. Inside `:root` (after line 119, before `.dark {`), add:
   ```css
   /* Twenty aesthetic: chip radius, selection tint, shadow roles, motion */
   --radius-chip: 0.25rem;
   --selection: color-mix(in oklch, var(--primary) 10%, transparent);
   --shadow-surface-light: var(--shadow-sm);
   --shadow-surface-strong: var(--shadow-lg);
   --shadow-surface-underline: 0 1px 0 0 hsl(225 27.7778% 14.1176% / 0.08);
   --shadow-surface-menu: var(--shadow-xl);
   --duration-hover: 100ms;
   --duration-select: 300ms;
   ```

3. Inside `.dark` (after line 194, before `}`), add the same block with dark-mode underline alpha:
   ```css
   --radius-chip: 0.25rem;
   --selection: color-mix(in oklch, var(--primary) 12%, transparent);
   --shadow-surface-light: var(--shadow-sm);
   --shadow-surface-strong: var(--shadow-lg);
   --shadow-surface-underline: 0 1px 0 0 hsl(0 0% 0% / 0.20);
   --shadow-surface-menu: var(--shadow-xl);
   ```
   (Duration tokens inherit from `:root` — no re-declaration needed.)

4. Inside `@theme inline {` block (around line 325), after `--shadow-2xl: var(--shadow-2xl);` (line 339), add:
   ```css
   --radius-chip: var(--radius-chip);
   --color-selection: var(--selection);
   --shadow-surface-light: var(--shadow-surface-light);
   --shadow-surface-strong: var(--shadow-surface-strong);
   --shadow-surface-underline: var(--shadow-surface-underline);
   --shadow-surface-menu: var(--shadow-surface-menu);
   ```

**Visual impact:** Radius bump affects every `rounded-md/lg/xl` site globally (~2 px difference). Nothing else visible until later phases consume the new tokens.

**Spot-check before commit:** Load `/customers/people`, landing page, login page, settings page. Nothing should break; everything should look marginally rounder.

### Phase 2 — List-table + row density

**Commit:** `feat(aesthetic-phase-2): 32px rows, zero vertical cell padding, accent-tinted selection`

**Files touched (2):**
- `src/components/ui/list-table.tsx`
- `src/components/ui/table.tsx`

**Exact edits in `list-table.tsx`:**

1. `<th>` className at line 214 — drop vertical padding, fix height:
   ```diff
   - "px-4 py-2.5 text-left",
   + "h-8 px-2 text-left text-[13px] font-medium text-muted-foreground",
   ```

2. Header sort button at line 222 — match new header text treatment:
   ```diff
   - "inline-flex items-center gap-1 transition-colors hover:text-foreground"
   + "inline-flex items-center gap-1 transition-colors duration-[var(--duration-hover)] hover:text-foreground"
   ```

3. Skeleton row `<td>` at line 258:
   ```diff
   - "px-4 py-2.5",
   + "h-8 px-2",
   ```

4. Data row `<tr>` at line 285:
   ```diff
   - onRowClick && "cursor-pointer transition-colors hover:bg-app-hover/70",
   - isSelected && "bg-app-hover/80",
   + onRowClick && "cursor-pointer transition-colors duration-[var(--duration-hover)] hover:bg-app-hover/70",
   + isSelected && "bg-[var(--selection)] transition-colors duration-[var(--duration-select)]",
   ```

5. Data `<td>` at line 319:
   ```diff
   - "px-4 py-2.5 text-meta text-foreground",
   + "h-8 px-2 text-meta text-foreground",
   ```

6. Pinned-first-column selected override at line 323:
   ```diff
   - isPinnedCell && isSelected && "bg-app-hover/80",
   + isPinnedCell && isSelected && "bg-[var(--selection)]",
   ```

7. `PINNED_FIRST_COL_CLASSES` at line 61 — replace group hover too:
   ```diff
   - "sticky left-0 z-10 bg-background group-hover/row:bg-app-hover/70";
   + "sticky left-0 z-10 bg-background transition-colors duration-[var(--duration-hover)] group-hover/row:bg-app-hover/70";
   ```

**Exact edits in `table.tsx`:** Apply the same hover/selection recipe where `TableRow` consumers render `hover:bg-app-hover/70` and `data-[state=selected]:bg-app-hover/80`. Swap `bg-app-hover/80` → `bg-[var(--selection)]`. Add `duration-[var(--duration-hover)]` and `duration-[var(--duration-select)]` where appropriate.

**Spot-check:**
1. Load `/customers/people`. Rows render at 32 px. Scroll — no vertical jitter.
2. Click a row. Selection renders as faint teal tint, transition ~300 ms.
3. Hover an unselected row. Gray wash, transition ~100 ms.
4. Repeat on `/customers/companies`, `/customers/deals`, `/tasks`.

### Phase 3 — Shared primitives (badge, button, input, avatar, skeleton)

**Commit:** `feat(aesthetic-phase-3): 4px chip badges, xs avatar, primitive radius cascade`

**Files touched (5–6):**
- `src/components/ui/badge.tsx`
- `src/components/ui/avatar.tsx`
- `src/lib/crm/build-columns.tsx` (or wherever table avatars are rendered — verify during implementation)
- `src/components/ui/button.tsx` (verify only; likely no edit)
- `src/components/ui/input.tsx` (verify only; no edit)
- `src/components/ui/skeleton.tsx` (verify only; likely no edit)

**Exact edits in `badge.tsx` (line 8):**

```diff
- "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-caption leading-none font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
+ "group/badge inline-flex h-4 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-chip)] border border-transparent px-1.5 py-0 text-[11px] leading-none font-medium whitespace-nowrap transition-all duration-[var(--duration-hover)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
```

Variants block stays unchanged — only the container recipe tightens.

**Exact edits in `avatar.tsx` (line 18):**

```diff
- "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
+ "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=xs]:size-4 data-[size=sm]:size-6 data-[size=lg]:size-10 dark:after:mix-blend-lighten",
```

`AvatarFallback` at line 50 — scale text for `xs`:
```diff
- "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
+ "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs group-data-[size=xs]/avatar:text-[10px]",
```

`AvatarGroupCount` at line 95 — scale for `xs` too (if avatar groups ever render in table cells):
```diff
- "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
+ "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=xs]/avatar-group:size-4 group-has-data-[size=sm]/avatar-group:size-6 group-has-data-[size=lg]/avatar-group:size-10 [&>svg]:size-4 group-has-data-[size=xs]/avatar-group:[&>svg]:size-2.5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5",
```

**Table-avatar opt-in:** Grep `src/lib/crm/` and `src/components/crm/` for `<Avatar` usage inside column builders. For every call-site that renders an avatar in a list-table cell, pass `size="xs"`. Do not change record-drawer header or card-header avatars (they stay at `default` = 32 px or `lg` = 40 px respectively).

**Button/Input/Skeleton:** Inherit new `--radius` automatically. Visually verify — no edit expected. If any button/input looks broken at the new 8 px radius, inspect the specific variant and decide locally.

**Spot-check:** A deal stage badge on `/customers/deals` renders as a 16 px × wrap-width chip with 4 px radius. A primary CTA button renders at 8 px radius. A table row's person avatar renders at 16 px. Record drawer header avatar stays at 40 px.

### Phase 4 — Kanban + record drawer

**Commit:** `feat(aesthetic-phase-4): 8px kanban cards, mixed-case record-drawer labels, inline-edit focus`

**Files touched (5–10):**
- `src/components/crm/kanban-board.tsx`
- `src/components/crm/deal-kanban-card.tsx`
- `src/components/crm/quick-edit-cell.tsx`
- `src/components/crm/record-drawer/record-detail-panel-shell.tsx`
- `src/components/crm/record-drawer/contact-drawer-content.tsx`
- `src/components/crm/record-drawer/company-drawer-content.tsx`
- `src/components/crm/record-drawer/deal-drawer-content.tsx`
- `src/components/crm/record-drawer/task-drawer-content.tsx`
- `src/components/crm/record-drawer/collapsible-field-group.tsx`
- `src/components/crm/record-drawer/drawer-section.tsx`

**Exact edits in `kanban-board.tsx`:**

1. `boardCardClassName` at line 110:
   ```diff
   - "group rounded-xl border border-app-border-subtle bg-app-surface px-3 py-3 transition hover:bg-app-hover/35 hover:shadow-sm";
   + "group rounded-md border border-app-border-subtle bg-app-surface p-3 transition-all duration-[var(--duration-hover)] hover:bg-app-hover/35 hover:shadow-[var(--shadow-surface-light)]";
   ```

2. Column header chip at line 183:
   ```diff
   - "inline-flex rounded px-2 py-0.5 text-caption font-medium",
   + "inline-flex rounded-[var(--radius-chip)] px-1.5 py-0 text-[11px] font-medium",
   ```

3. Drag overlay at line 303:
   ```diff
   - <KanbanCardShell className="shadow-lg">
   + <KanbanCardShell className="shadow-[var(--shadow-surface-strong)]">
   ```

4. Empty-lane placeholder at line 377 and 619 (duplicated):
   ```diff
   - <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-center type-empty-copy text-muted-foreground">
   + <p className="rounded-md border border-dashed border-border bg-muted/10 p-3 text-center text-[13px] text-muted-foreground">
   ```

**Exact edits in `deal-kanban-card.tsx`:** Review after implementing Phase 3 avatar changes. Any `h-5 w-5 rounded` colored-initial block in the card title row should shrink to `size-4` to match table-row avatar density. If card internal data rows use `pl-7`, consider `pl-6` to align with the new 16 px leading unit.

**Exact edits in `quick-edit-cell.tsx`:** Wrap every call to `<Input ... className="h-7 type-control">` (lines 399, 463) with an additional focus-treatment className:

```diff
- className="h-7 type-control"
+ className="h-7 type-control focus-visible:border-primary focus-visible:shadow-[0_0_0_1px_var(--primary)] focus-visible:ring-0"
```

Only inline-edit `<Input>` instances. Do not change the base `Input` primitive in `src/components/ui/input.tsx` — keep its `ring-3` for explicit forms.

**Exact edits in record-drawer content files:**

1. Grep `src/components/crm/record-drawer/` for any `uppercase` or `type-kicker` utility on field labels:
   ```bash
   grep -rn "uppercase\|type-kicker" src/components/crm/record-drawer/
   ```
2. Every field label wrapper should use `text-[13px] font-medium text-muted-foreground` (mixed-case, no uppercase). Current `text-xs text-muted-foreground` in several places (e.g., `record-detail-panel-shell.tsx:172`) is close — bump to `text-[13px] font-medium`. Verify per-file during edit.
3. `record-detail-panel-shell.tsx` title input at line 146 already uses `rounded-md` — cascades automatically. No edit.
4. `collapsible-field-group.tsx` and `drawer-section.tsx` — section headers should read `text-[13px] font-medium text-muted-foreground` (mixed-case). Inspect each and adjust.

**Spot-check:** Open a deal drawer. Field labels are mixed-case 13 px medium muted. Inline-editing a field shows blue border + 1 px glow. Kanban cards on `/customers/deals` render at 8 px radius with shadow only on hover.

### Phase 5 — Motion audit + ornament guard

**Commit:** `feat(aesthetic-phase-5): motion budget audit, ornament guard, empty-state polish`

**Files touched (varies — audit-driven):**
- `src/components/ui/*.tsx` (as needed for transition durations)
- `src/components/crm/*.tsx` (as needed)
- `src/components/ui/empty-state.tsx` (spot edit if radii off)

**Work:**

1. Run `grep -rn "transition-all\|transition-colors" src/components/ui/ src/components/crm/ | grep -v "duration-"` and add `duration-[var(--duration-hover)]` to every match. Skip matches where a specific duration is already set deliberately.
2. Run the ornament guard grep:
   ```bash
   grep -rn "icon-flame\|icon-key\|icon-clock\|card-shimmer-sweep\|badge-shimmer" \
     'app/(dashboard)/' src/components/crm/ src/components/ui/
   ```
   Expect zero matches. If any appear, remove the utility from the matching component (keep the `@keyframes` in globals.css untouched).
3. Visual pass on `src/components/ui/empty-state.tsx` — icon wrapper `rounded-full` stays; copy sizing stays. If the `h-14 w-14` wrapper looks off after the `--radius` cascade, verify the circle still reads as a circle (it should — `rounded-full` is independent of `--radius`).
4. Final end-to-end spot-check of all 10 success criteria (listed in Acceptance Criteria § Phase 5 above).

**Spot-check:** None new — this phase is the full acceptance gate.

**PR creation:** After Phase 5 commit lands, open a PR from `feat/twenty-aesthetic-clone` → `main`. Title: `feat: clone Twenty CRM aesthetics (tokens + component recipes)`. Body references the requirements doc and this plan. Include before/after screenshots of `/customers/people`, `/customers/deals` (kanban), and a record drawer.

## Alternative Approaches Considered

- **Full brand clone (match Twenty globally — swap teal→indigo, Figtree→Inter, paper→white).** Rejected at origin-ideation. Sunder's brand identity is a deliberate choice worth preserving; Twenty's leverage comes from proportions, not colors.
- **Tokens only, no component edits.** Rejected at origin-ideation. Bumping `--radius` alone leaves `rounded-4xl` badges pill-shaped; the work must include component recipe edits to be visible.
- **Two-phase split (tokens, then all components).** Rejected at origin-ideation. Bundles too many changes per commit; hard to visually inspect or revert.
- **One big PR.** Rejected at origin-ideation. Higher regression surface, harder diff review.
- **Per-component phases (10+ phases).** Rejected at origin-ideation. Too much ceremony for non-dependent work that sits naturally in subsystems.

## Sources & References

### Origin
- **Origin document:** [docs/product/ideations/2026-04-23-twenty-aesthetic-clone-requirements.md](../ideations/2026-04-23-twenty-aesthetic-clone-requirements.md)

Key decisions carried forward from origin:
- **Tokens-only clone, not brand clone** — Sunder colors/fonts/paper stay; spacing/radii/shadows/motion/row-heights adopt Twenty's values.
- **Component recipes update alongside tokens** — hard-coded utilities (`rounded-4xl`, `py-2.5`) get swapped; pure token changes would be invisible.
- **Five phases by subsystem, one commit per phase** — each phase independently shippable and inspectable.

### Internal References
- Drift analysis: [`roadmap docs/Sunder - Source of Truth/references/twenty-crm/crm-aesthetics-drift-analysis.md`](../../../roadmap%20docs/Sunder%20-%20Source%20of%20Truth/references/twenty-crm/crm-aesthetics-drift-analysis.md)
- Companion architecture doc: [`roadmap docs/Sunder - Source of Truth/references/twenty-crm/crm-ux-gold-standard-drift-analysis.md`](../../../roadmap%20docs/Sunder%20-%20Source%20of%20Truth/references/twenty-crm/crm-ux-gold-standard-drift-analysis.md)
- Current token definitions: `app/globals.css:1-340`
- Current list-table: `src/components/ui/list-table.tsx:200-370`
- Current badge: `src/components/ui/badge.tsx:7-33`
- Current button: `src/components/ui/button.tsx:7-42`
- Current avatar: `src/components/ui/avatar.tsx:6-24`
- Current kanban card recipe: `src/components/crm/kanban-board.tsx:107-112`
- Current record-drawer shell: `src/components/crm/record-drawer/record-detail-panel-shell.tsx:126-250`
- Current inline-edit cell: `src/components/crm/quick-edit-cell.tsx:391-490`

### External References
- Twenty CRM repo: `/Users/sethlim/Documents/twenty`
- Twenty theme tokens: `packages/twenty-ui/src/theme/constants/` (ThemeLight.ts, spacingValues.ts, BorderCommon.ts, BoxShadowLight.ts, FontCommon.ts)
- Twenty record-table: `packages/twenty-front/src/modules/object-record/record-table/`
- Twenty chip component: `packages/twenty-ui/src/components/chip/Chip.tsx`
- CLAUDE.md design-system rules: Flexoki semantic tokens only; no raw Tailwind palette classes; no `dark:` prefixes on accent colors
