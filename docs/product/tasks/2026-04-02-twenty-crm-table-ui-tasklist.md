# Twenty CRM Table UI Redesign

**PR:** Out-of-plan — UI polish (CRM list pages to match Twenty CRM reference)
**Decisions:** FOUND-05 (App Router + TanStack), UX design reference
**Goal:** Redesign the CRM list pages (People, Companies, Deals) to visually match the Twenty CRM table UI style.

**Reference image:** The user provided a screenshot of Twenty CRM's Companies page. The reference repo is at `/Users/sethlim/Documents/twenty reference repo`. Key visual elements: "All X" view dropdown toolbar, Filter/Sort/Options text buttons, row checkboxes, column header icons, "+ Add New" row, "Calculate" aggregation footer, subtle vertical borders between columns.

**Tech Stack:** React, TanStack Table, Tailwind CSS, Lucide React icons, ShadCN Checkbox

---

## Current State (Session 2026-04-02)

### Changes already made (uncommitted, on `main` branch):

The following files have been modified with the core structural changes. **All changes compile with no new TypeScript errors.** They have NOT been visually verified in the browser (Playwright MCP crashed mid-session).

**Modified files:**

1. **`src/lib/crm/build-columns.ts`** — Added `meta: { fieldType, fieldKey }` to each generated column definition so DataTable can resolve column header icons.

2. **`src/components/ui/filter-bar.tsx`** — Added `viewLabel` prop. When set, renders a Twenty-style toolbar layout:
   - Left: `≡ {viewLabel} ▾` dropdown button (uses `List` + `ChevronDown` icons)
   - Right: Inline search input + "Filter" / "Sort" / "Options" text buttons
   - Falls back to the existing "Filters | Perspectives | Search" layout when `viewLabel` is not set (backward-compatible).

3. **`src/components/ui/data-table.tsx`** — Major additions:
   - **Column header icons:** Two-level icon resolution (`fieldKeyIconMap` → `fieldTypeIconMap`). Icons render as 3.5×3.5 Lucide components left of the header label. Maps: `name→User`, `emails/email→Mail`, `phones/phone→Phone`, `company_id→Building2`, `type/stage/industry→Tag`, `updated_at/created_at→Calendar`, `website/linkedin→Link`, `address/city→MapPin`, `amount→DollarSign`, `job_title→Type`. Also has fallback map by field type (`full_name→User`, `currency→DollarSign`, `number→Hash`, etc.).
   - **Row checkboxes:** New `showCheckboxes` prop. Prepends a `__checkbox` column with ShadCN `Checkbox` components. Header checkbox toggles select-all. State managed via `selectedRows` Set.
   - **"+ Add New" row:** New `onAddNew` prop. Renders a clickable row with `Plus` icon + "Add New" text below the data rows.
   - **"Calculate" footer:** New `showCalculateRow` prop. Renders a `<tfoot>` with a "Calculate ▾" button.
   - **Vertical borders:** Added `border-r border-border/40` to both `<th>` and `<td>` cells (excluded on checkbox, actions, and last columns).
   - **Softer styling:** Changed border opacity from `border-border` to `border-border/40` for rows, `border-border/60` for header/footer. Hover changed to `hover:bg-muted/30`.
   - **New props:** `viewLabel`, `onAddNew`, `showCheckboxes`, `showCalculateRow` — all optional, all backward-compatible.

4. **`app/(dashboard)/customers/people/page.tsx`** — Updated to use all new props:
   - Added `headerActions` to `CrmListPageShell` with a `+ New record` outline button.
   - Passes `viewLabel="All People"`, `showCheckboxes`, `showCalculateRow`, `onAddNew` to `DataTable`.
   - Both "+ New record" and "+ Add New" currently show `toast.info("Create contact coming soon")` — functionality deferred.

---

## Remaining Work

### Task 1: Visual verification and styling iteration

**Priority: HIGH — Must be done first**

**Files:**
- Modify: `src/components/ui/data-table.tsx`
- Modify: `src/components/ui/filter-bar.tsx`

**Step 1: Launch browser and navigate to People page**
Open http://localhost:3000/customers/people in the browser (via Playwright MCP or manually).
Take a screenshot.

**Step 2: Compare against reference image**
Reference: Twenty CRM Companies page (screenshot provided by user, original at `/Users/sethlim/Documents/twenty reference repo`).

Key things to verify:
- Toolbar layout: "All People ▾" left, "Filter Sort Options" right — correct positioning?
- Column header icons display correctly next to each column name
- Row checkboxes render and are clickable
- "+ Add New" row visible at bottom of data
- "Calculate ▾" footer visible below "+ Add New"
- Vertical borders between columns are subtle but visible
- Row hover states look correct
- "+ New record" button in page header
- Overall spacing and typography match the reference feel

**Step 3: Fix any visual bugs found**
Common issues to check:
- Checkbox column width — should be narrow (~40px), not stretching
- Column icon alignment — icons should be vertically centered with header text
- Search input in toolbar — may need padding/width adjustments
- Border colors — should be barely visible, warm gray tone
- Row height — should be compact (~32-36px per row)
- "+ Add New" and "Calculate" rows should span the full width correctly (colSpan math)

**Step 4: Iterate until it matches the reference**
Take another screenshot after each fix. Compare side by side. Repeat.

---

### Task 2: Fix `hasToolbar` check for `viewLabel`

**Priority: HIGH — Bug**

**Files:**
- Modify: `src/components/ui/data-table.tsx` (line ~334)

**Problem:** The `hasToolbar` variable in DataTable doesn't account for `viewLabel`. If a page passes `viewLabel` but no `onSearchChange` or `filters`, the toolbar won't render.

**Step 1: Fix the hasToolbar check**

In `src/components/ui/data-table.tsx`, find:
```ts
const hasToolbar =
    Boolean(onSearchChange) || filters.length > 0 || Boolean(onFiltersApply) || Boolean(onFiltersClear)
```

Change to:
```ts
const hasToolbar =
    Boolean(viewLabel) || Boolean(onSearchChange) || filters.length > 0 || Boolean(onFiltersApply) || Boolean(onFiltersClear)
```

**Step 2: Verify toolbar renders when only viewLabel is set**

---

### Task 3: Apply new props to Companies page

**Priority: MEDIUM**

**Files:**
- Modify: `app/(dashboard)/customers/companies/page.tsx`

**Step 1: Add imports**
Add `Plus` from `lucide-react`, `Button` from `@/components/ui/button`.

**Step 2: Add headerActions to CrmListPageShell**
```tsx
<CrmListPageShell
  icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
  title="Companies"
  headerActions={
    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-sm" onClick={() => toast.info("Create company coming soon")}>
      <Plus className="h-3.5 w-3.5" />
      New record
    </Button>
  }
>
```

**Step 3: Add new DataTable props**
Add these props to the `<DataTable>` usage:
```tsx
viewLabel="All Companies"
showCheckboxes
showCalculateRow
onAddNew={() => toast.info("Create company coming soon")}
```

**Step 4: Verify visually** — Navigate to /customers/companies, take screenshot, compare to reference.

---

### Task 4: Apply new props to Deals page (table view)

**Priority: MEDIUM**

**Files:**
- Modify: `app/(dashboard)/customers/deals/page.tsx`

**Step 1: Add imports**
Add `Plus` from `lucide-react`, `Button` from `@/components/ui/button` (if not already imported).

**Step 2: Add headerActions to CrmListPageShell**
Same pattern as Companies — `+ New record` button.

**Step 3: Add new DataTable props to the table view**
The Deals page has both table and board (kanban) views. Only the table view `<DataTable>` should get the new props:
```tsx
viewLabel="All Deals"
showCheckboxes
showCalculateRow
onAddNew={() => toast.info("Create deal coming soon")}
```

**Step 4: Verify visually** — Navigate to /customers/deals, ensure table view has the new layout and board view is unaffected.

---

### Task 5: Wire up "+ New record" and "+ Add New" functionality

**Priority: LOW (can be deferred)**

**Files:**
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`

Currently both buttons show a toast placeholder. To wire them up:

**For People:** Call `open()` on the record drawer with a "new" sentinel, or create a new contact via Supabase mutation and then open the drawer for it.

**For Companies:** Same pattern — create a new company record and open the drawer.

**For Deals:** Same pattern — create a new deal record.

This depends on the record drawer supporting a "create new" mode, which may not exist yet. If not, defer this to a future PR.

---

### Task 6: Make "Sort" and "Options" buttons functional

**Priority: LOW (can be deferred)**

**Files:**
- Modify: `src/components/ui/filter-bar.tsx`

Currently the "Sort" and "Options" buttons in the new toolbar are non-functional placeholders. To make them work:

**Sort:** Open a popover/dropdown listing the available columns. Clicking a column applies ascending sort (click again for descending). This can integrate with TanStack Table's `onSortingChange`.

**Options:** Open a dropdown with table configuration options like "Hide columns", "Row height", "Export CSV". This is a larger feature and should be a separate PR.

---

### Task 7: Implement Calculate aggregation row logic

**Priority: LOW (can be deferred)**

**Files:**
- Modify: `src/components/ui/data-table.tsx`

Currently the "Calculate ▾" button is a non-functional placeholder. To match Twenty CRM:

**When clicked:** Show a dropdown with aggregation options per column (Count, Sum, Average, Min, Max, Empty, Not empty).

**When configured:** Display calculated values inline in the footer row, one per column (e.g., "Max of Employees: 8,000", "Empty of Linkedin: 100%", "Not empty of Address: 5").

This requires:
- A state for per-column aggregation selections
- Computing aggregations from the current page data
- Rendering values aligned to their columns in the footer

This is a significant feature and should be a separate PR.

---

## Relevant Files

### Modified (changes already applied, uncommitted)
- `src/lib/crm/build-columns.ts` — meta with fieldType/fieldKey on column defs
- `src/components/ui/filter-bar.tsx` — viewLabel prop, new toolbar layout
- `src/components/ui/data-table.tsx` — icons, checkboxes, add-new row, calculate footer, styling
- `app/(dashboard)/customers/people/page.tsx` — new props passed to DataTable + header button

### To modify (remaining work)
- `app/(dashboard)/customers/companies/page.tsx` — apply same new props
- `app/(dashboard)/customers/deals/page.tsx` — apply same new props (table view only)

### Reference
- Twenty CRM reference repo: `/Users/sethlim/Documents/twenty reference repo`
- Key Twenty components to study: `packages/twenty-front/src/modules/object-record/record-table/`

---

## Notes

- All changes are backward-compatible — the new DataTable props default to `false`/`undefined`, so Companies and Deals pages continue working with the old layout until explicitly updated.
- The `selectedRows` state for checkboxes is local to each DataTable instance (no global selection store needed for now).
- Column icon mapping lives in DataTable as static maps (`fieldKeyIconMap`, `fieldTypeIconMap`). If more icons are needed, just add entries to these maps.
- The FilterBar falls back to the old layout (Filters | Perspectives | Search) when `viewLabel` is not provided, so existing consumers are unaffected.
