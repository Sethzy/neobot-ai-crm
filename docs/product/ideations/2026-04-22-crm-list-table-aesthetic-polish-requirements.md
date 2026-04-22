---
date: 2026-04-22
topic: crm-list-table-aesthetic-polish
---

# CRM List Table Aesthetic Polish

## Problem Frame

Sunder's CRM list tables (Companies, People, Deals, Tasks) are functionally complete but visually flat next to Attio — the reference the user keeps reaching for. The gap is pure aesthetics: uppercase caption headers with no icons, text-only rows with no identity marker, heavier dividers than Attio's, no pill tags on select/tags fields, and plain-text URLs where Attio shows soft blue links. Every fix lives in the shared `ListTable` + `field-renderers` primitives, so polishing once reskins all four pages.

**Explicitly out of scope:** no engine swap, no `nuqs`, no new state, no toolbar/views redesign (user chose "keep dropdown, just restyle it"). No favicon fetching — initials avatars only.

## Requirements

- **R1. Column headers in sentence case with leading icon.** Header text changes from `NAME` uppercase caption to `Name` sentence case. Each column can declare an optional lucide icon (Building2, Mail, Phone, Globe, CalendarClock, etc.) rendered at 14px before the label in `text-muted-foreground`. Renders for every page via the shared `ListTable`.

- **R2. Name cell gets a leading initials avatar.** `full_name` field renderer (Contacts, Companies, Deals) renders a 20px rounded-square initials avatar to the left of the name. Use existing `avatarColorFor()` for deterministic color. No network call — no favicons. Click-through to drawer still works.

- **R3. Select + tags fields render as Badge pills.** `select` and `tags` cell variants swap plain text for shadcn `Badge` with a deterministic pale tint per value (new `tagColorFor()` helper, Flexoki Layer 3 tokens only — no raw palette). Overflow renders as `+N` when more than one tag fits. Matches Attio's pale-pink / cream / blue category pills.

- **R4. URL fields render as underlined links in `text-primary`.** `url` cell variant becomes a blue-underline link, opens in a new tab, with an optional `+N` overflow indicator if a multi-URL field is later introduced. Matches Attio's domain-column treatment.

- **R5. Lighter row dividers and softer empty cells.** Row border drops from `border-app-border-subtle/80` to `/40`. `renderPrimitiveCellValue` removes the `—` em-dash fallback — empty cells render as blank whitespace (Attio pattern). Rationale: the em-dash reads as clutter at row density. Date cells stay right-aligned and muted (already correct in `formatCrmDate`, verify only).

- **R6. View picker pill restyle.** The `All People · 47 ▾` pill gets cleaner typography + a hover ring, tightens padding. Stays a dropdown per user's product decision — no tab-bar conversion.

## Success Criteria

- All four list pages (Companies, People, Deals, Tasks) ship the polish simultaneously via the shared primitives — no per-page forks.
- Side-by-side screenshot of Sunder Companies vs Attio Companies feels in the same visual family (not identical — Sunder keeps its dark-green accents and Flexoki rhythm).
- No existing CRM tests break. No new failing `grep` for raw Tailwind palette classes (`bg-amber-500`, `text-green-600`, etc.).
- User looks at the result and says "yes, that's what I wanted" — not "now it's uglier again."

## Scope Boundaries

- No toolbar refactor beyond the pill restyle (R6).
- No favicons, no external logo fetching, no company-branding pipeline.
- No column reorder / resize / pin UI (Attio has it; skip for now).
- No saved-views tab bar (user decision).
- No URL-synced filter state (explicitly vetoed: "I do not need nuqs").
- No changes to how data is fetched, cached, or mutated.
- No changes to `RecordDrawer`, `QuickEditCell`, or row actions — the polish layer sits *above* those.

## Key Decisions

- **Stay on existing TanStack Table + `ListTable` primitive.** Three prior attempts (Dice UI / tablecn / kbastamow Data-table) confirmed there's no off-the-shelf package that ships Attio polish without breaking our design system.
- **Icons come from column metadata, not a hard-coded map in ListTable.** `FieldDefinition` gets an optional `icon?: LucideIcon` field; `buildColumnsFromConfig` forwards it to the header renderer. Keeps ListTable generic.
- **Initials avatars over favicons.** Favicons require a service (favicon.im / Google s2) + caching + fallback logic + CSP — far outside "purely aesthetic" budget. Deterministic-colored initials (already in `display.ts`) look Attio-grade for zero new infrastructure.
- **Flexoki tokens only.** No raw palette classes. `tagColorFor()` picks from existing Layer 3 tokens (e.g. `bg-stage-leads/10 text-stage-leads`), same pattern as `avatarColorFor`.
- **Saved views stay as a dropdown.** User chose "keep the dropdown, just restyle it."

## Ranked Execution TODO

Biggest visual lift first. Each step touches shared primitives so all four pages benefit at once.

1. **Column headers — sentence case + leading icon (R1)** · ~1 hr · highest visual lift
   - Add `icon?: LucideIcon` to `FieldDefinition` in `src/lib/crm/field-definitions.ts`
   - Populate icons in the default-field arrays (Building2 for name, Mail for email, Phone for phone, Globe for url, CalendarClock for date columns, etc.)
   - Wire through in `src/lib/crm/build-columns.ts` — header becomes `<HeaderCell icon={field.icon} label={field.label} />`
   - Update `ListTable` header rendering to drop `uppercase` + `type-table-heading` → new header typography (sentence case, `text-sm`, `font-medium`, muted icon)

2. **Name cell — leading initials avatar (R2)** · ~1 hr · huge row-identity win
   - Extend `full_name` variant in `src/lib/crm/field-renderers.tsx` — render `<Avatar size=20>` + name button in a flex row
   - Use existing `avatarColorFor()` / initials computation from `display.ts`
   - Keep `onClick` → drawer behavior intact

3. **Select + tags → Badge pills (R3)** · ~1 hr
   - Write `tagColorFor(value)` in `src/lib/crm/display.ts` — deterministic hash → Flexoki Layer 3 token map
   - Update `select` and `tags` variants in `field-renderers.tsx` to render shadcn `Badge` with that color class + `+N` overflow indicator for multi-value

4. **URL cell → blue underline link (R4)** · ~30 min
   - Update `url` variant in `field-renderers.tsx` — strip `https://`, render `<a target=_blank>` with `text-primary underline-offset-2 hover:underline`

5. **Lighter dividers + no em-dash empty (R5)** · ~30 min
   - In `ListTable`: change row border class from `border-app-border-subtle/80` → `/40`
   - Change `renderPrimitiveCellValue` — return `null` (renders as empty `<td>`) instead of `<span>—</span>` when value is empty/null
   - Verify date cells are right-aligned + muted (should already be)

6. **View picker pill restyle (R6)** · ~30 min
   - `src/components/crm/view-picker.tsx` — tighten padding, cleaner chevron, add hover ring, ensure it reads as a pill button not a chunky dropdown

**Total: ~4.5 hrs.** Fits the 4–8 hr budget with room for screenshot review + iteration.

## Dependencies / Assumptions

- `avatarColorFor()` already exists in `src/lib/crm/display.ts` (confirmed earlier in session).
- `lucide-react` already a dependency.
- Flexoki Layer 3 tokens (`stage-*`, `filetype-*`, etc.) already defined in `globals.css` — per CLAUDE.md quote.
- Shared `ListTable` is used by Companies, People, Deals, Tasks (confirmed — the refactor commit `e7fb76e7` introduced it project-wide).

## Outstanding Questions

None that block execution. `tagColorFor()`'s specific color mapping is a Phase-of-one-commit detail — happy to pick 5–6 tokens during implementation.

## Next Steps

→ Execute the ranked TODO above, step by step. Take a screenshot after step 2 and step 5 for mid-progress review.
