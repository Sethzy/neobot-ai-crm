---
date: 2026-04-22
topic: click-to-expand-cell-editor-notes
---

# Attio-style Click-to-Expand Cell Editor — Existing Code Survey

The user flagged Attio's *click-a-cell → popover-shows-full-content-and-editor* pattern and said "I think we solved it in the side panel already — go take note of that code." This is research only; no implementation.

## Where the pattern already lives

**`src/components/crm/quick-edit-cell.tsx`** (603 lines) is the primary inline editor. It covers:

- **Types supported:** `text`, `number`, `select`, `date` (via `QuickEditCellType`).
- **Interaction model:** hover reveals copy + edit icons → click edit swaps the cell content to an input/select/popover → commit on blur or Enter → saved indicator for 1.5s.
- **Editors used:** shadcn `Input`, `Select`, `Popover` + `Calendar` for dates, `Command` + `CommandList` for searchable selects, `Dialog` as the mobile sheet.
- **Mobile variant:** automatically switches to a fullscreen `Dialog` via `useIsMobile()` — good pattern to keep.
- **Parser hook:** accepts an optional `parseValue` so callers can enforce field-specific rules before `onSave` fires. Also a `defaultParseValue` for number/date/text.
- **Display-mode content:** accepts `children` as the read-mode override (e.g. an `<a>` link, a Badge) so the cell can look rich without doubling up during edit mode.

**`src/components/crm/inline-edit-field.tsx`** (453 lines) is the heavier form-field variant used inside the record drawer (detail surface). Shares the same editor primitives but has a fuller label + description + validation layout — not the right fit for dense table cells.

## What's reusable for an Attio-style cell popover

The core pieces are already in `QuickEditCell`:
- The editor-per-type switch (lines ~250–450) is the same switch Attio needs.
- The `defaultParseValue` + `parseValue` hook is a clean seam for custom field handling.
- The `children`-as-read-mode pattern lets us keep the colored pill / link / avatar looking rich while clicking enters edit mode.

**What's missing for true Attio parity:**
1. **Click-anywhere-in-cell trigger.** Today the trigger is an explicit pencil icon on hover. Attio expands on a bare click anywhere in the cell. Change: expose an `activateOn: "icon" | "cellClick"` prop.
2. **"Expanded popover" for long text.** Attio pops a floating panel above the cell that shows the full content (see the user's screenshot — Stratechery's "About" popover). Today the editor swaps inline which clips long text. Fix: add a `mode: "inline" | "popover"` prop that renders the editor inside `Popover` with the cell as the trigger, matching the `Popover`-based date picker already used for dates.
3. **Open-from-any-cell, not just "edit" button.** Would need to lift the open state up so the row doesn't swallow clicks via `onRowClick` → drawer.

## Integration touch points

- `src/lib/crm/field-renderers.tsx` — this is where the cell value is rendered as a React node. An Attio-style wrapper component (`<EditableCell field={...} row={...}>`) would sit here, reusing `QuickEditCell` internally.
- `src/components/ui/list-table.tsx` — its `onRowClick` handler currently intercepts clicks and filters out `button`/`input`/`a`/`label`. A `data-editable-cell` attribute on the editor trigger would add a clean bail-out path.
- `app/(dashboard)/customers/companies/page.tsx` (and People, Deals) — column defs today wire `QuickEditCell` per cell via bespoke wrappers (`CompanyPhoneCell`, `CompanyEmailCell`, etc.). Migrating to a config-driven `renderFieldCell` → `<EditableCell>` would delete those wrappers in favour of one shared primitive.

## Recommendation (for later, not now)

1. Add a `mode="popover"` variant to `QuickEditCell` that uses `Popover` + a larger content area — matches Attio's "About" popover behavior for long text fields.
2. Extend `field-renderers.tsx` so `renderFieldCell` optionally returns an editable variant — `renderFieldCell(type, value, { editable: true, onSave })`.
3. After those exist, delete the per-field `CompanyPhoneCell`/`CompanyEmailCell`/etc. wrappers on each page.

**Estimated effort:** 4–6 hrs. Not in the aesthetic-polish scope — file a separate ideation before picking this up.

## Files to reference when implementing

- `src/components/crm/quick-edit-cell.tsx` — the editor
- `src/components/crm/inline-edit-field.tsx` — drawer variant (full form field)
- `src/components/ui/popover.tsx` — shadcn popover primitive already in use
- `src/components/ui/command.tsx` — for searchable select
- `src/components/ui/calendar.tsx` — for date picker
