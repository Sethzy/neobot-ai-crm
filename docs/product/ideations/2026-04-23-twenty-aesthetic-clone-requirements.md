---
date: 2026-04-23
topic: twenty-aesthetic-clone
---

# Clone Twenty CRM Aesthetics into Sunder (Tokens + Component Recipes)

## Problem Frame

Sunder's CRM surfaces (customers, tasks, record drawer, kanban) read as a generic shadcn dashboard rather than a dense, data-first enterprise CRM. Rows are ~40+ px tall, badges are full pills, radii are ~5.6 px, row selection tints gray, and decorative keyframes (icon wobble, card shimmer) bleed into the data plane. Twenty CRM — the open-source gold standard — gets its "Attio-level" feel from a tight 4 px spacing grid, 32 px rows with zero vertical padding, 4 px chip radii, blue-tinted row selection, minimal shadows, and two motion durations (100 / 300 ms).

We want Twenty's **tokens and component recipes** (spacing, radii, shadows, motion, row heights, chip/button/input/avatar/table sizing) applied to Sunder's components, while keeping Sunder's brand identity (teal primary, Figtree/Fraunces typography, warm-paper canvas) intact. Outcome: CRM surfaces *feel* like Twenty; chat, settings, landing, and auth keep Sunder's current warmth.

Reference doc: `roadmap docs/Sunder - Source of Truth/references/twenty-crm/crm-aesthetics-drift-analysis.md`.

## Requirements

- R1. **Spacing** — standardize on a 4 px grid. Base unit = 4 px. All CRM-surface paddings, gaps, row heights use multiples of 4. Cell padding goes to `0 8px` (zero vertical).
- R2. **Row height** — list-table data row = 32 px (`h-8`). List-table header row = 32 px. Kanban card line-height = 32 px minimum per field.
- R3. **Border radius** — `--radius` = 0.5 rem (8 px). Add `--radius-chip` = 0.25 rem (4 px). Apply: buttons + cards at 8 px, chips/badges at 4 px, inline cells at 4 px. Avatars stay circular. Modals keep large radius.
- R4. **Badge/chip recipe** — replace pill `h-5 rounded-4xl` with Twenty chip `h-4 rounded-[var(--radius-chip)] px-1.5 text-[11px] font-medium`. Soft-tone `bg-{color}/10 text-{color}` mapping stays. Applies to all status chips, stage chips, file-type chips, task-status chips.
- R5. **Shadow role tokens** — add four semantic shadow tokens (`--shadow-surface-light`, `-strong`, `-underline`, `-menu`) mapped onto existing scale. Use these four roles going forward for popover / modal / sticky-header / dropdown respectively. Kanban cards and rows stay shadow-free at rest.
- R6. **Motion budget (CRM surfaces)** — hover background = 100 ms, row selection = 300 ms, nothing else. No spring curves, no shimmer, no icon wobble on `/customers/*`, `/tasks`, and record drawers. Landing/login keep their entrance animations.
- R7. **Row selection color** — switch selected-row background from `bg-app-hover/80` (gray wash) to `bg-primary/10` or a dedicated `--selection` token (blue/accent tint at ~10%). Hover stays gray wash at ~6–7%.
- R8. **Avatar sizing** — table-cell avatars = 16 px (`size-4`). Record-drawer header avatar = 40 px (`size-10`). Kanban card avatars = 16 px.
- R9. **Field label treatment (record drawer)** — mixed-case, `text-[13px]`, `font-medium`, `text-muted-foreground`. Remove uppercase + `.type-kicker` class from field labels. Table column headers stay whatever we decide (default: match labels, no uppercase).
- R10. **Focus treatment (inline edit)** — replace 3 px focus ring on inline-edit cells with border-color change + 1 px inner glow. Keep the existing 3 px ring on explicit form inputs (accessibility).
- R11. **Kanban card recipe** — card gets `rounded-md border border-app-border-subtle bg-app-surface p-3 hover:bg-app-hover/35`. Remove `card-shimmer-sweep`. Column container keeps its current shell.
- R12. **Button recipe** — radius = 8 px (flows from R3). Keep current variants and the teal `bg-primary` default (brand identity). Sizes unchanged.
- R13. **Input recipe** — radius = 8 px (flows from R3). Keep 3 px focus ring (accessibility). Everything else unchanged.
- R14. **Component updates required** — tokens alone do not produce visible change. The following components must be edited to consume the new values: `badge.tsx`, `button.tsx`, `input.tsx`, `avatar.tsx`, `list-table.tsx`, `table.tsx`, `quick-edit-cell.tsx`, `kanban-board.tsx`, `deal-kanban-card.tsx`, record-drawer components (`record-detail-panel-shell.tsx`, `contact-drawer-content.tsx`, `company-drawer-content.tsx`, `deal-drawer-content.tsx`), `skeleton.tsx`, `empty-state.tsx`. Field-label utilities in `globals.css`.
- R15. **Ornament removal (CRM only)** — the utility classes `.icon-flame`, `.icon-key`, `.icon-clock`, `.badge-shimmer`, `.card-shimmer-sweep` must not appear on any element rendered inside `/customers/*`, `/tasks`, or record-drawer surfaces. `@keyframes` definitions stay in place because landing/login reuse them.

## Success Criteria

A CRM surface is "converged" when all ten hold:

1. Any list-table data row renders at 32 px with zero vertical padding.
2. Any status chip / badge rendered on a CRM surface is ≤16 px tall with a 4 px radius, no pill shape.
3. Selected rows render with a blue/accent tint (not darker gray).
4. Record-drawer field labels are mixed-case `text-[13px] font-medium text-muted-foreground`.
5. Buttons across the app land on an 8 px radius.
6. Inline-edit cells show focus via border-color + inner glow, not a 3 px outer ring.
7. Table-cell avatars render at 16 px; record-drawer header avatars at 40 px.
8. Zero shimmer / wobble / spring animations on `/customers/*`, `/tasks`, or record drawers.
9. Hover transitions on CRM interactive elements run at 100 ms; row-selection at 300 ms.
10. Visual spot-check on `/customers/people`, `/customers/companies`, `/customers/deals`, `/tasks`, and a record drawer looks recognizably Twenty-like in density and chip treatment.

## Scope Boundaries

**In scope:**
- `app/globals.css` token updates (spacing aliases, radius, shadow roles, motion durations).
- CRM surface components listed in R14.
- Utility-class removals on CRM surfaces (R15).

**Out of scope / non-goals:**
- No brand color swap. Teal `--primary` stays. Flexoki palette stays.
- No font swap. Figtree + Fraunces + Geist Mono all stay loaded and applied.
- No canvas swap. Warm paper `hsl(48 100% 97%)` stays as the app canvas.
- No architecture work. Views system, record-index shell, page-layout system — all out of scope (see sibling doc `crm-ux-gold-standard-drift-analysis.md`).
- No chat / landing / settings / auth surface changes.
- No new dependencies. No Linaria, no Emotion, no Radix Colors package.
- No sidebar restructure (keep current shadcn sidebar).
- No dark-mode overhaul. Existing dark CSS-variable cascade continues to work.
- No animation keyframe removal — only utility-class removal on CRM surfaces.

## Key Decisions

- **Tokens-only clone, not brand clone.** User selected this explicitly: match Twenty's sizing/density/motion values, keep Sunder's color/font/paper identity. Rationale: Sunder's brand is a deliberate product identity worth preserving; Twenty's aesthetic leverage comes from the sizing grid, not its indigo/Inter/white palette.
- **Component recipes update alongside tokens.** User selected "Update components to consume new tokens". Rationale: changing `--radius` alone does nothing if `badge.tsx` hard-codes `rounded-4xl`. The density feel comes from row heights, cell padding, and chip shapes — all component-level.
- **Five phases by subsystem, one commit per phase.** User selected this. Rationale: each phase is independently shippable and visually inspectable; no big-bang risk.
- **Phase ordering = by visual impact per unit of work.** Token scaffolding first (invisible but foundational), then list-table (highest-impact surface), then shared component recipes, then kanban + drawer, then motion polish.
- **Row-selection color becomes accent-tinted.** Explicit departure from Sunder's current gray-wash selection. Justified because gray hover + gray selection gives no visual distinction; Twenty's accent-tint selection is a functional improvement, not just cosmetic.
- **CRM-only ornament removal.** Keyframe declarations stay in globals.css (landing page reuses them); only the utility-class bindings on CRM surface components get stripped.

## Dependencies / Assumptions

- Tailwind 4 `@theme` block in `app/globals.css` is the source of truth for CSS variables. Changes propagate automatically.
- `rounded-4xl` is still the current badge radius utility; confirm during implementation.
- No Storybook or visual-regression test suite exists for CRM components. Spot-check in the browser is the validation mechanism per phase.
- Dev server at `pnpm dev` (or `npm run dev`) is the inspection environment. No staging environment required.
- Each phase commit uses the CLAUDE.md convention (`feat(aesthetic-clone-phase-N): ...` or similar).
- Dark mode coverage is inherited from the CSS-variable cascade; no per-phase dark-mode audit required unless a phase touches a `dark:` prefixed utility directly.

## Implementation Phases (for planning reference)

Exact file-by-file work is `/plan`'s job. Below is the phase shape the plan should expand.

- **Phase 1 — Tokens (`app/globals.css` only).** Set `--radius` = 0.5 rem. Add `--radius-chip` = 0.25 rem. Add four semantic shadow-role tokens. Optionally add a `--selection` token. Zero component edits, zero visible change. Foundation for phases 2–5.
- **Phase 2 — List-table + row density.** `list-table.tsx`, `table.tsx`, `quick-edit-cell.tsx`. 32 px rows, zero vertical cell padding, mixed-case header, new hover/selection colors, 100 / 300 ms durations, 16 px avatar variant for table cells. Highest visible impact.
- **Phase 3 — Shared primitives (badge, button, input, avatar).** `badge.tsx` → 4 px chip recipe. `button.tsx` + `input.tsx` inherit new radius. `avatar.tsx` gets a `size="xs"` variant (16 px). No behavior change.
- **Phase 4 — Kanban + record drawer.** `kanban-board.tsx`, `deal-kanban-card.tsx`, record-drawer components. New card recipe, mixed-case field labels, inline-edit focus treatment, 40 px header avatar, ornament-class removal on CRM kanban cards.
- **Phase 5 — Motion polish + ornament strip.** Audit CRM-surface utility classes for `.icon-flame`, `.icon-key`, `.icon-clock`, `.card-shimmer-sweep`, `.badge-shimmer`. Remove from CRM surfaces only. Confirm transition durations (100 / 300 ms) landed correctly. Spot-check all ten success criteria against a running dev server.

## Outstanding Questions

None. All blocking product decisions resolved during ideation.

### Deferred to Planning

- [Affects R5][Technical] Exact mapping from the four new shadow-role tokens onto the existing 8-tier `--shadow-*` scale — concrete values belong in `/plan`.
- [Affects R7][Technical] Whether to introduce a standalone `--selection` variable or inline `bg-primary/10`; small call, resolve in `/plan`.
- [Affects R14][Technical] Whether to add a new `Chip` component alongside `Badge`, or re-shape `Badge` in place. Preference: re-shape in place (no new component), but confirm in `/plan`.
- [Affects R8][Technical] Whether `Avatar` gets a new `size="xs"` variant in the data attribute system, or inline sizing at the call site. Lean: new variant (single source of truth).
- [Affects all] Decide per-phase whether a commit or a PR is the delivery unit. Default: commit per phase on a single feature branch, one PR at the end.

## Next Steps

→ `/plan` for structured implementation planning.
