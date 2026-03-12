# CRM Visual Parity — Implementation Handover

## What this is

A focused UI polish pass to close the visual gap between Sunder's CRM pages and the Open Mercato reference. The data model, hooks, and routing are already done. This is purely about making the existing pages **look** like Mercato.

## How to work

1. Read this doc fully before touching code.
2. Open the reference screenshots in `docs/product/designs/screenshots/mercato-reference/`.
3. Open the running Sunder app side-by-side.
4. Work through the changes below in order. After each batch, use the agent browser to screenshot the result and compare against the Mercato reference screenshot — iterate until they match.
5. Commit after each batch.

**Do NOT:**
- Change data models, API routes, hooks, or schemas
- Add new pages or routes
- Refactor existing working logic
- Remove any existing functionality

**DO:**
- Copy Mercato patterns directly from the source code referenced below
- Use the agent browser to visually verify after every change
- Keep iterating per-page until the screenshot matches

---

## Reference Screenshots

| Page | Mercato Target | Sunder Current |
|------|---------------|----------------|
| People | `screenshots/mercato-reference/mercato-people.png` | Take screenshot of `/customers/people` |
| Companies | `screenshots/mercato-reference/mercato-companies.png` | Take screenshot of `/customers/companies` |
| Deals | `screenshots/mercato-reference/mercato-deals.png` | Take screenshot of `/customers/deals` |
| Pipeline | `screenshots/mercato-reference/mercato-pipeline.png` | Take screenshot of `/customers/deals/pipeline` |

---

## Open Mercato Source Code Reference

The Mercato codebase is at `/Users/sethlim/Documents/open-mercato/`. These are the exact files to read and copy patterns from:

### Core Visual Pattern: DictionaryValue (icon + text + colored dot)

**This is the #1 visual difference.** Mercato renders Status, Lifecycle Stage, and Source columns with an icon in a bordered box + label text + colored dot. We render plain text.

**Source file:** `/Users/sethlim/Documents/open-mercato/packages/core/src/modules/dictionaries/components/dictionaryAppearance.tsx`

Key exports to replicate:
- `renderDictionaryIcon(icon, className)` — Takes `"lucide:icon-name"` string, renders the Lucide icon component. Falls back to rendering emoji.
- `renderDictionaryColor(color, className)` — Takes hex color `"#10b981"`, renders a small colored dot `<span>`.
- `DictionaryValue` component — Renders the full `[icon-box] [label] [dot]` pattern.

```tsx
// The cell rendering pattern from Mercato's people page:
<DictionaryValue
  value={rawValue}
  map={dictionaryMaps[kind]}
  fallback={rawValue ? <span>{rawValue}</span> : noValue}
  className="text-sm"
  iconWrapperClassName="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card"
  iconClassName="h-4 w-4"
  colorClassName="h-3 w-3 rounded-full"
/>
```

The rendered HTML looks like:
```html
<span class="inline-flex items-center gap-2 text-sm">
  <span class="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card">
    <svg class="h-4 w-4" .../>  <!-- Lucide icon -->
  </span>
  <span>Active</span>
  <span class="inline-flex border border-border h-3 w-3 rounded-full" style="background-color: #10b981"/>
</span>
```

### Mercato Page Files (column definitions, layout, toolbar)

- **People page:** `/Users/sethlim/Documents/open-mercato/packages/core/src/modules/customers/backend/customers/people/page.tsx`
- **Companies page:** `/Users/sethlim/Documents/open-mercato/packages/core/src/modules/customers/backend/customers/companies/page.tsx`
- **Deals page:** `/Users/sethlim/Documents/open-mercato/packages/core/src/modules/customers/backend/customers/deals/page.tsx`
- **Pipeline page:** `/Users/sethlim/Documents/open-mercato/packages/core/src/modules/customers/backend/customers/deals/pipeline/page.tsx`

### Mercato Shared UI Components

- **DataTable:** `/Users/sethlim/Documents/open-mercato/packages/ui/src/backend/DataTable.tsx`
- **FilterBar:** `/Users/sethlim/Documents/open-mercato/packages/ui/src/backend/FilterBar.tsx`
- **FilterOverlay:** `/Users/sethlim/Documents/open-mercato/packages/ui/src/backend/FilterOverlay.tsx`
- **RowActions:** `/Users/sethlim/Documents/open-mercato/packages/ui/src/backend/RowActions.tsx`
- **TruncatedCell:** `/Users/sethlim/Documents/open-mercato/packages/ui/src/backend/TruncatedCell.tsx`

### Our Files to Modify

- **People page:** `app/(dashboard)/customers/people/page.tsx`
- **Companies page:** `app/(dashboard)/customers/companies/page.tsx`
- **Deals page:** `app/(dashboard)/customers/deals/page.tsx`
- **Pipeline page:** `app/(dashboard)/customers/deals/pipeline/page.tsx`
- **DataTable:** `src/components/ui/data-table.tsx`
- **FilterBar:** `src/components/ui/filter-bar.tsx`
- **Kanban Board:** `src/components/crm/kanban-board.tsx`

---

## Batch 1 — DictionaryValue Cell Pattern (CRITICAL)

This single change accounts for ~70% of the visual gap.

### Step 1: Create the DictionaryValue utility

Create `src/components/crm/dictionary-value.tsx` by copying the pattern from Mercato's `dictionaryAppearance.tsx`. Our version is simpler because we don't have a dictionary API — we hardcode the icon/color maps for our known CRM field values.

**What to build:**

```tsx
// src/components/crm/dictionary-value.tsx
// Utility for rendering CRM field values with icon + label + colored dot,
// matching the Open Mercato visual pattern.

import { type LucideIcon } from "lucide-react"
// Import only the icons we actually need (see maps below)

// 1. LUCIDE_ICON_MAP — Record<string, LucideIcon>
//    Map slug strings to Lucide components. Only include icons we use.

// 2. renderIcon(icon: string | null, className?: string) → ReactNode
//    If icon starts with "lucide:", look up in LUCIDE_ICON_MAP.
//    Otherwise render as emoji <span>.

// 3. renderColorDot(color: string | null, className?: string) → ReactNode
//    Renders: <span class="inline-flex border border-border {className}" style={{ backgroundColor: color }} />

// 4. DictionaryValue component
//    Props: { value, map, fallback?, className? }
//    Renders: [icon-box] [label] [colored-dot]
//    Copy the exact class names from Mercato (see pattern above).
```

### Step 2: Define value maps for our CRM fields

We need icon + color mappings for each value our CRM fields can have. Look at what's visible in the Mercato screenshots and match it:

**Contact/Person Status:**
| Value | Icon | Color | Label |
|-------|------|-------|-------|
| `active` | `lucide:users` | `#3b82f6` (blue) | Active |
| `inactive` | `lucide:user-check` | `#6b7280` (gray) | Inactive |

**Lifecycle Stage:**
| Value | Icon | Color | Label |
|-------|------|-------|-------|
| `prospect` | `lucide:sparkles` | `#f97316` (orange) | Prospect |
| `customer` | `lucide:briefcase` | `#10b981` (green) | Customer |
| `lead` | `lucide:target` | `#eab308` (yellow) | Lead |
| `opportunity` | `lucide:trophy` | `#8b5cf6` (purple) | Opportunity |

**Contact Source:**
| Value | Icon | Color | Label |
|-------|------|-------|-------|
| `customer_referral` | `lucide:thumbs-up` | `#10b981` (green) | Customer referral |
| `partner_referral` | `lucide:handshake` | `#3b82f6` (blue) | Partner referral |
| `industry_event` | `lucide:calendar` | `#f97316` (orange) | Industry event |
| `outbound_campaign` | `lucide:megaphone` | `#eab308` (yellow) | Outbound campaign |
| `website` | `lucide:globe` | `#6366f1` (indigo) | Website |
| `direct` | `lucide:phone` | `#14b8a6` (teal) | Direct |

**Company Industry** — keep as colored badge (already works).

**Deal Status:**
| Value | Icon | Color | Label |
|-------|------|-------|-------|
| `open` | `lucide:circle` | `#3b82f6` (blue) | Open |
| `in_progress` | `lucide:zap` | `#f97316` (orange) | In progress |
| `won` | `lucide:trophy` | `#10b981` (green) | Won |
| `lost` | `lucide:flag` | `#ef4444` (red) | Lost |

> **Important:** Check `src/lib/crm/config.ts` or equivalent for the actual values our CRM uses. The maps above are based on the Mercato screenshots — adjust values/labels to match our schema.

### Step 3: Update column definitions in each page

Replace the plain-text cell renderers in People, Companies, and Deals pages with `<DictionaryValue>` for Status, Lifecycle Stage, and Source columns.

**People page** (`app/(dashboard)/customers/people/page.tsx`):
- Read Mercato's people page columns at the path above — copy the `renderDictionaryCell` pattern.
- Apply to: `type` → Status, and add Lifecycle Stage + Source columns if not present.

**Companies page** (`app/(dashboard)/customers/companies/page.tsx`):
- Same pattern for Industry (already a badge — keep), add Status if applicable.

**Deals page** (`app/(dashboard)/customers/deals/page.tsx`):
- Apply to Stage column — replace `<StageBadge>` with `<DictionaryValue>` for consistency with the Mercato pattern.

### Step 4: Verify

Use agent browser to screenshot each page. Compare against reference screenshots. The table cells should now show icon + label + colored dot instead of plain text.

---

## Batch 2 — Toolbar Parity (Filters + Search Layout)

### What the reference shows

Mercato's toolbar layout (visible in all 4 reference screenshots):
```
[Filters button] [Perspectives button]                    [🔍 Search input (narrow, right-aligned)]
```

Our current layout:
```
[🔍 Search input (full width)]                                              [Filter button]
```

### Changes needed

**In `src/components/ui/filter-bar.tsx`:**

1. **Move search to the right, shrink it.** The search input should be `sm:ml-auto sm:w-auto sm:min-w-[180px] sm:max-w-[240px]` instead of full width. Copy the exact layout from Mercato's `FilterBar.tsx`:

   ```tsx
   // Mercato's search positioning:
   <div className={`relative w-full sm:w-auto sm:min-w-[180px] sm:max-w-[240px] ${searchAlign === 'right' ? 'sm:ml-auto' : ''}`}>
   ```

2. **Move Filters button to the left.** The Filters button should appear first (left-aligned), before search.

3. **Add a Perspectives button** next to Filters. This is a non-functional placeholder for now — just render the button with the sliders icon and "Perspectives" text. It visually completes the toolbar to match Mercato.

   ```tsx
   // Perspectives placeholder (no functionality):
   <Button variant="outline" className="h-9">
     <SlidersHorizontal className="h-4 w-4 opacity-80" />
     Perspectives
   </Button>
   ```

**In `src/components/ui/data-table.tsx`:**

4. **Add Export button** to the action bar. In Mercato, "Export" appears next to the refresh icon and "New [Entity]" button. Add a non-functional outline button:

   ```tsx
   <Button variant="outline">Export</Button>
   ```

5. **Refresh button → icon only.** Change from text "Refresh" to just the `<RefreshCw>` icon, matching Mercato's circular arrow icon.

6. **Add three-dot overflow menu (⋯)** between Refresh and Export. Non-functional placeholder.

### Verify

Screenshot the toolbar area. It should match:
```
[🔃] [⋯] [Export] [New Person]     ← action bar (top right)
[⫏ Filters] [⊞ Perspectives]        [🔍 Search people...]     ← toolbar
```

---

## Batch 3 — Kanban Parity

### Reference: `screenshots/mercato-reference/mercato-pipeline.png`

The Mercato pipeline has a distinctly different look from ours.

**Read the Mercato pipeline source:**
`/Users/sethlim/Documents/open-mercato/packages/core/src/modules/customers/backend/customers/deals/pipeline/page.tsx`

### Changes to `src/components/crm/kanban-board.tsx`:

1. **Stage headers** — Mercato shows clean text headers ("Opportunity", "Deals: 0") without colored pill badges or colored top borders. Our version uses colored badge pills with thick colored top borders.

   Change: Remove the colored badge pills for stage names. Render stage name as plain `text-sm font-semibold` text, with "Deals: N" below in `text-xs text-muted-foreground`. Remove the `border-t-[2.5px]` colored top borders.

2. **Column containers** — Mercato uses `rounded-lg border border-border bg-card shadow-sm` per column. Match this.

3. **Empty state** — Change from "No items" to "No deals in this stage yet." in `text-sm text-muted-foreground`, centered in the column area.

4. **Page title area** — Update to match Mercato:
   - Title: "Sales Pipeline"
   - Subtitle: "Track deals by pipeline stage and drag them between lanes to update progress."
   - Remove "Back to Deals" link, replace with breadcrumb or keep as-is
   - Add pipeline selector tab if easy, otherwise skip

5. **Sort dropdown** — Mercato shows "Sort by" + "Probability (high to low)" dropdown. We have "Filter, Sort, Options" text links. Replace with a proper dropdown matching Mercato.

### Verify

Screenshot the pipeline. Compare column headers, empty states, and overall card styling.

---

## Batch 4 — Column Additions (if data supports it)

Check our existing data/hooks to see if we can add these columns that Mercato shows but we're missing. **Only add columns where the data already exists** in our hooks/queries — do not create new API endpoints.

### People page — possible additions:
- **Lifecycle Stage** column (if our contacts have a `lifecycle_stage` or equivalent field)
- **Source** column (if our contacts have a `source` field)
- **Next interaction** column (if we have this data)

### Deals page — possible additions:
- **Probability** column (if our deals have a `probability` field)
- **Expected close** column (if we have `expected_close_date` or equivalent)
- **Companies** column (if we already link deals to companies in the query)

### Companies page — possible additions:
- **Status** column with DictionaryValue
- **Lifecycle Stage** column

Check `src/hooks/use-contacts.ts`, `src/hooks/use-deals.ts`, `src/hooks/use-companies.ts` for what fields are already returned by our queries.

---

## Batch 5 — Final Polish

1. **Pagination footer** — Verify format matches: "Showing 1 to N of N results" on left, "Previous | Page X of Y | Next" on right. Should already be close.

2. **Row hover states** — Verify `hover:bg-muted/50` on table rows.

3. **Column header text** — Should be sentence case, `text-xs uppercase tracking-wide text-muted-foreground`. Compare against Mercato.

4. **Row actions menu (⋯)** — Verify positioning and styling match. Our `RowActions` component is already similar to Mercato's — just compare.

5. **Empty states** — When tables have no data, verify the empty state matches Mercato's clean centered pattern.

---

## Iteration Loop

For each batch:

```
1. Make the code changes
2. Open agent browser → navigate to the page
3. Take a screenshot
4. Open the corresponding Mercato reference screenshot
5. Compare side-by-side
6. If gaps remain, adjust and repeat from step 2
7. When the page matches, move to the next batch
```

Do NOT move to the next batch until the current one looks right in the browser.

---

## Success Criteria

When you're done, a side-by-side comparison of our pages vs the Mercato screenshots should show:

- [ ] Table cells with icon + label + colored dot (Status, Lifecycle, Source)
- [ ] Filters + Perspectives buttons left-aligned, search right-aligned and narrow
- [ ] Export button in action bar
- [ ] Refresh as icon-only button
- [ ] Kanban columns with clean text headers (no colored badges)
- [ ] Kanban empty state text matching Mercato
- [ ] Overall table layout, spacing, and typography matching
