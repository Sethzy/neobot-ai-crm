# CRM Aesthetic Overhaul — Confirmed Decisions

**Status:** In progress
**Date started:** 2026-03-10

Each decision is iterated on in conversation, then added here once approved.

---

## Decision 1: Sidebar Restructure

**Status:** APPROVED

### Summary

Add a new **CUSTOMERS** sidebar section between AGENT and DATABASE. Break CRM out of a single nav item with tabs into 3 direct nav items. Remove the CRM tab layout entirely.

### Sidebar structure (before → after)

```
BEFORE                               AFTER
──────                               ─────

AGENT                                AGENT
  Chat                                 Chat
  Mission Control                      Mission Control
  Tasks                                Tasks
  Automations                          Automations
  Memory                               Memory

DATABASE                             CUSTOMERS
  CRM → tabs: Contacts|Deals|Co.      People        (icon: contacts / TbUsersGroup)
  Knowledge                            Companies     (icon: building / TbBuilding)
  Workspace                            Deals         (icon: deals / TbCashBanknote)
  Channels
                                     DATABASE
SESSIONS                               Knowledge
  [threads]                            Workspace
                                       Channels

                                     SESSIONS
                                       [threads]
```

### Route migration

| Old route | New route | Action |
|-----------|-----------|--------|
| `/crm` | `/customers` | Redirect to `/customers/people` |
| `/crm/contacts` | `/customers/people` | Rename |
| `/crm/contacts/[contactId]` | `/customers/people/[contactId]` | Full page (was redirect to `?detail=`) |
| `/crm/deals` | `/customers/deals` | Rename |
| `/crm/deals/[dealId]` | `/customers/deals/[dealId]` | Full page (was redirect to `?detail=`) |
| `/crm/companies` | `/customers/companies` | Rename |
| `/crm/companies/[companyId]` | `/customers/companies/[companyId]` | Full page (was redirect to `?detail=`) |

Old `/crm/*` routes keep redirect stubs for backward compatibility.

### Code changes

- `src/components/layout/app-sidebar.tsx` — add `customersNavItems` array, remove CRM from `databaseNavItems`, render new CUSTOMERS section
- `app/(dashboard)/crm/layout.tsx` — **delete** (tab layout no longer needed)
- `app/(dashboard)/customers/` — new route group with `people/`, `companies/`, `deals/` pages
- `app/(dashboard)/crm/` — redirect stubs only

### What stays the same

- Tasks stays under AGENT
- SESSIONS section unchanged
- Footer (Settings, user) unchanged
- Sidebar collapse behavior unchanged

---

## Decision 2: People List Page

**Status:** PENDING APPROVAL

### Summary

Replace the current contacts list page (`/crm/contacts`) with a new People list page (`/customers/people`) that clones Open Mercato's people page pattern: `DataTable` wrapper with `FilterBar`, `FilterOverlay`, `RowActions`, server-side pagination, dictionary-style column rendering, and auto-truncation.

### ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  People                                    [↻ Refresh]  [+ New]     │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                      │
│  [🔎 Search...                              ] [🔽 Filter (2)]       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Status: Active ×   Source: Referral ×             Clear all  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Name ↑       Email          Status     Type    Source Updated │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │  Sarah Chen   sarah@x.co   ● Active    Buyer   Referral  3h  ⋯│  │
│  │  James Tan    james@y.sg   ● Lead      Seller  Website   1d  ⋯│  │
│  │  Wei Lin      —            ● Active    Buyer   Agent     2d  ⋯│  │
│  │  ...                                                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Showing 1 to 20 of 47 results         [Previous]  Page 1 of 3  [Next]│
└──────────────────────────────────────────────────────────────────────┘
```

**Filter overlay (slides in from left on filter button click):**
```
┌──────────────────────────┐
│  Filters            [Close]│
├──────────────────────────┤
│  [Clear]          [Apply]  │
├──────────────────────────┤
│                            │
│  Status                    │
│  [▼ — select —         ]   │
│                            │
│  Type                      │
│  [▼ — select —         ]   │
│                            │
│  Source                    │
│  [▼ — select —         ]   │
│                            │
│  Lifecycle Stage           │
│  [▼ — select —         ]   │
│                            │
│  Has Email                 │
│  [▼ — Yes/No/Any —    ]   │
│                            │
│  Has Phone                 │
│  [▼ — Yes/No/Any —    ]   │
│                            │
│  Created At                │
│  From: [    date    ]      │
│  To:   [    date    ]      │
│                            │
├──────────────────────────┤
│  [Clear]          [Apply]  │
└──────────────────────────┘
```

**Row actions dropdown (hover or click ⋯):**
```
┌────────────────┐
│  View          │
│  Open in Tab   │
│  Delete        │  ← red text
└────────────────┘
```

**Empty state (no contacts at all):**
```
┌──────────────────────────────────────────┐
│                                          │
│       👤  (contacts icon, large)         │
│                                          │
│       No people yet                      │
│       Your AI agent will create contacts │
│       as it processes conversations.     │
│                                          │
└──────────────────────────────────────────┘
```

**Empty state (filters active, no results):**
```
┌──────────────────────────────────────────┐
│                                          │
│       No results match your filters      │
│       Try adjusting or clearing filters. │
│                                          │
└──────────────────────────────────────────┘
```

---

### Open Mercato Reference Patterns

#### Pattern 1: `DataTable` (generic wrapper)

**Source:** `packages/ui/src/backend/DataTable.tsx` (~2063 lines)

The `DataTable` is a generic TanStack Table wrapper component. Key patterns:

- **Props:** `columns`, `data`, `title`, `actions` (top-right buttons), `refreshButton`, `pagination`, `isLoading`, `emptyState`, `rowActions`, `onRowClick`, `searchValue`/`onSearchChange`, `filters`/`filterValues`/`onFiltersApply`/`onFiltersClear`, `exporter`, `perspective`, `sortable`
- **Layout structure:**
  ```
  <div className="rounded-lg border bg-card">
    <div className="px-4 py-3 border-b">         ← header
      title + actions (flex row, space-between)
      <FilterBar />                                ← toolbar below title
    </div>
    <div className="overflow-auto">               ← table scroll wrapper
      <Table className="min-w-[640px]">           ← min-width for horizontal scroll
        <TableHeader> ... </TableHeader>
        <TableBody> ... </TableBody>
      </Table>
    </div>
    <div className="px-4 py-3 border-t">          ← pagination footer
      "Showing X to Y of Z results"  [Prev] Page N of M [Next]
    </div>
  </div>
  ```
- **Row click:** `className="cursor-pointer hover:bg-muted/50 transition-colors"`, calls `onRowClick(row.original)`
- **Row actions column:** Renders `<RowActions>` in a right-aligned `<TableCell>` with `data-actions-cell` attribute to prevent row click bubbling
- **Loading state:** Single row with `<Spinner>` + "Loading data..." centered text
- **Empty state:** Single row with centered muted text
- **Sorting:** Header buttons with `▲`/`▼` indicators
- **Date columns:** Auto-detected by `_at` suffix, formatted with `YYYY-MM-DD HH:mm`
- **Column truncation:** Auto-truncation with max-width per column type (name: 250px, status: 180px, dates: 120px, custom fields: 120px)

#### Pattern 2: `FilterBar`

**Source:** `packages/ui/src/backend/FilterBar.tsx` (162 lines)

- **Layout:** Flex row with search input (left/right-aligned), filter button, active filter chips
- **Search:** `h-9 rounded border pl-8 pr-2 text-sm`, debounced at 1000ms, with search icon
- **Filter button:** `variant="outline" h-9`, shows active count badge when filters are set
- **Chips:** Show `{label}: {value} ×` for each active filter, removable
- **Clear all:** Text button when any filters are active
- **Props:** `searchValue`, `onSearchChange`, `searchPlaceholder`, `filters`, `values`, `onApply`, `onClear`, `leadingItems`, `searchAlign`

#### Pattern 3: `FilterOverlay`

**Source:** `packages/ui/src/backend/FilterOverlay.tsx` (328 lines)

- **Layout:** Fixed full-screen overlay with left-side panel (`w-full sm:w-[380px]`)
- **Backdrop:** `bg-black/30`, click dismisses
- **Header:** Title + Close button
- **Actions bar:** Clear + Apply buttons (duplicated top and bottom)
- **Field types:** `text` (input), `select` (native select or multi-checkbox), `checkbox` (Yes/No/Any select), `dateRange` (from/to date inputs), `tags` (TagsInput)
- **Dynamic options:** Loads options asynchronously when overlay opens via `loadOptions`
- **State:** Internal `values` state, synced from `initialValues` prop

#### Pattern 4: `RowActions`

**Source:** `packages/ui/src/backend/RowActions.tsx` (158 lines)

- **Trigger:** `IconButton` with `⋯` character, `variant="ghost"`
- **Menu:** Portal-rendered, positioned relative to button via `getBoundingClientRect`
- **Direction:** Auto-detects up/down based on viewport space
- **Hover behavior:** Opens on pointer enter (non-touch), closes on pointer leave with 150ms delay
- **Items:** `Button variant="ghost"` or `<a>` for href items, destructive items get `text-red-600`
- **Click handling:** `event.stopPropagation()` on all interactions

#### Pattern 5: People page composition

**Source:** `packages/core/src/modules/customers/backend/customers/people/page.tsx` (647 lines)

- **Page wrapper:** `<Page><PageBody>` → `<DataTable>` (single child)
- **State management:** All state is local (`useState`) — page, pageSize, total, totalPages, search, filterValues, isLoading, rows, reloadToken
- **Data fetching:** `useEffect` + `apiCall()` triggered by `queryParams` changes (NOT TanStack Query for the list)
- **Dictionary rendering:** `DictionaryValue` component for status/source/lifecycle columns — renders icon + label from dictionary maps
- **Column definitions:** `ColumnDef<PersonRow>[]` with custom cell renderers per column type
- **Custom field columns:** Dynamically appended from `useCustomFieldDefs()`, prefixed with `cf_`
- **Filters:** 9 filter definitions (status, source, lifecycleStage, tags, createdAt, emailContains, hasEmail, hasPhone, hasNextInteraction)
- **Delete flow:** Confirm dialog → `apiCallOrThrow` DELETE → optimistic removal from `rows` state
- **Row click:** `router.push(/backend/customers/people/${row.id})`
- **Row actions:** View, Open in New Tab, Delete
- **Refresh:** Clears search + page + increments reloadToken

---

### File-by-File Reference Mapping

#### New Sunder components (copied from Open Mercato)

| New Sunder file | Open Mercato source | What to copy | Notes |
|---|---|---|---|
| `src/components/ui/data-table.tsx` | `packages/ui/src/backend/DataTable.tsx` | Component structure, layout classes, pagination, loading/empty states, row click, sorting, truncation | **Simplified**: Strip perspectives, injection system, export, bulk actions, i18n. Keep: title/actions header, FilterBar integration, table rendering, pagination, row actions column, column truncation |
| `src/components/ui/filter-bar.tsx` | `packages/ui/src/backend/FilterBar.tsx` | Full component (162 lines) | **Minimal drift**: Replace `useT()` with hardcoded English strings. Replace import paths. |
| `src/components/ui/filter-overlay.tsx` | `packages/ui/src/backend/FilterOverlay.tsx` | Full component (328 lines) | **Minimal drift**: Replace `useT()` with hardcoded English strings. Replace `TagsInput` with simpler implementation if needed. Replace `variant="muted"` with `variant="outline"`. |
| `src/components/ui/row-actions.tsx` | `packages/ui/src/backend/RowActions.tsx` | Full component (158 lines) | **Minimal drift**: Replace `useT()`. Replace `IconButton` import with local equivalent (ShadCN `Button size="icon" variant="ghost"`). |
| `app/(dashboard)/customers/people/page.tsx` | `packages/core/src/.../people/page.tsx` | Page composition pattern, column definitions, filter definitions, delete flow, row actions | **Key drift**: Use TanStack Query instead of raw `useEffect`+`apiCall`, use Supabase hooks, use `crm_config` for dynamic vocabularies instead of dictionary API |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/contacts/page.tsx` | Replace with redirect to `/customers/people` |
| `src/components/crm/contacts-table.tsx` | **Deprecate** — functionality moves into `DataTable` + page-level column definitions |
| `src/hooks/use-contacts.ts` | Add pagination support (page, pageSize params → Supabase `.range()`) |

#### Existing Sunder files reused (no changes)

| File | What it provides |
|---|---|
| `src/hooks/use-crm-config.ts` | Dynamic vocabulary options (contact types, statuses, sources, lifecycle stages) |
| `src/lib/crm/schemas.ts` | Zod validators, type definitions |
| `src/lib/crm/display.ts` | `formatContactFullName`, `formatCrmDate`, `formatCrmEnumLabel`, badge variants |
| `src/components/ui/button.tsx` | ShadCN Button (used by DataTable, FilterBar, RowActions) |
| `src/components/ui/table.tsx` | ShadCN Table/TableHeader/TableBody/TableRow/TableHead/TableCell |
| `src/components/icons/app-icons.tsx` | Icon registry (contacts, search icons) |

---

### Drift Analysis

#### Drift 1: i18n → Hardcoded English
- **Open Mercato:** Uses `useT()` translation function everywhere (`t('customers.people.list.title')`)
- **Sunder:** No i18n system. All strings hardcoded in English.
- **Justification:** Sunder is Singapore-only, English-only product. Adding i18n is unnecessary complexity.
- **Impact:** Every `t('...')` call becomes a literal string. No functional difference.

#### Drift 2: Data fetching → TanStack Query instead of raw fetch
- **Open Mercato:** Uses `useEffect` + `apiCall()` + local state (`setRows`, `setTotal`, etc.)
- **Sunder:** Uses TanStack Query hooks (`useContacts`, `useDeals`, etc.) for all data fetching.
- **Justification:** Sunder already has established TanStack Query patterns with cache invalidation, optimistic updates, and error handling. Switching to raw fetch would break consistency with the rest of the codebase.
- **Impact:** The page composition differs — instead of manual `queryParams` → `apiCall` → `setRows`, we use `useContacts({ search, type, page, pageSize })` which returns `{ data, isLoading, isError }`.

#### Drift 3: Dictionary rendering → `crm_config` vocabularies
- **Open Mercato:** Uses `fetchDictionaryEntries()` API to load DB-driven dictionaries with icons/colors per value. Renders via `<DictionaryValue>` component with icon wrapper + color dot.
- **Sunder:** Uses `crm_config` table with agent-configurable vocabularies. No icon/color per value — just string arrays.
- **Justification:** Sunder's vocabulary system is simpler by design (agent-configurable via `configure_crm` tool). Adding per-value icons/colors is a feature addition, not an aesthetic change.
- **Impact:** Status/type/source columns render as plain text or `<Badge>` instead of icon+label+color. We keep our existing `Badge` + `formatCrmEnumLabel()` pattern.

#### Drift 4: No perspectives/saved views
- **Open Mercato:** Full perspectives system — save/load column visibility, order, sorting, filters as named views per table. Cookie + localStorage persistence.
- **Sunder:** Not needed for v1.
- **Justification:** Perspectives are a power-user feature. Sunder's solo agent users don't need saved table views. Can add later.
- **Impact:** Strip all perspective-related code from DataTable. ~40% of DataTable code is perspectives.

#### Drift 5: No export
- **Open Mercato:** Export menu with CSV/Excel/PDF support, view vs full scope.
- **Sunder:** Not needed for v1.
- **Justification:** Export is a nice-to-have feature, not an aesthetic concern.

#### Drift 6: No injection system
- **Open Mercato:** Modular injection system for columns, row actions, bulk actions, filters from plugins.
- **Sunder:** Not a modular platform.
- **Justification:** Sunder is a single-tenant SaaS, not a plugin platform.

#### Drift 7: No bulk actions / row selection
- **Open Mercato:** Checkbox column + bulk action buttons.
- **Sunder:** Not needed for v1.

#### Drift 8: Custom field columns — deferred
- **Open Mercato:** Dynamically appends custom field columns from `useCustomFieldDefs()`.
- **Sunder:** Has `crm_config.custom_fields` but doesn't render them in table columns yet.
- **Justification:** Can add custom field columns later. The DataTable structure supports it — just append to the columns array.

#### Zero drift (copied exactly)
- **DataTable layout:** `rounded-lg border bg-card` container, `px-4 py-3 border-b` header, title + actions flex row
- **FilterBar:** Search input styling, filter button with count badge, active filter chips
- **FilterOverlay:** Left-side panel, backdrop, field renderers, clear/apply pattern
- **RowActions:** Portal menu, auto-positioning, hover behavior, destructive styling
- **Pagination:** `border-t` footer, "Showing X to Y of Z results", Previous/Next buttons, page info
- **Table styling:** `min-w-[640px]` for scroll, `cursor-pointer hover:bg-muted/50` rows, `data-actions-cell` click prevention
- **Loading state:** Centered spinner + loading text
- **Empty state:** Centered muted text in table cell
- **Sort indicators:** `▲`/`▼` text indicators
- **Column truncation:** Max-width per column type pattern

---

### Column Definitions (Sunder People table)

```
| Column          | Type     | Cell renderer                          | Sortable |
|-----------------|----------|----------------------------------------|----------|
| Name            | display  | Link to /customers/people/[id], font-medium hover:underline | Yes (localeCompare) |
| Email           | accessor | mailto link or muted "—"               | Yes      |
| Phone           | accessor | tel link or muted "—"                  | Yes      |
| Company         | display  | Company name text or muted "—"         | No       |
| Status          | accessor | Badge with enum label                  | Yes      |
| Type            | accessor | Badge with enum label + variant color  | Yes      |
| Source          | accessor | Plain text or muted "—"                | Yes      |
| Updated         | accessor | Relative/formatted date, muted text    | Yes (default desc) |
```

### Filter Definitions (Sunder People filters)

```
| Filter          | Type      | Options source                         |
|-----------------|-----------|----------------------------------------|
| Status          | select    | crm_config.contact_statuses            |
| Type            | select    | crm_config.contact_types               |
| Source          | select    | crm_config.contact_sources             |
| Lifecycle Stage | select    | crm_config.lifecycle_stages            |
| Has Email       | checkbox  | Yes/No/Any                             |
| Has Phone       | checkbox  | Yes/No/Any                             |
| Created At      | dateRange | From/To date pickers                   |
```

### Pagination

- Server-side via Supabase `.range(from, to)` + `.count('exact')`
- Default page size: 20
- `useContacts` hook gets `page` and `pageSize` params
- Returns `{ data, total, totalPages }`

### Testing

- Unit tests for `DataTable`, `FilterBar`, `FilterOverlay`, `RowActions` using Vitest + RTL
- Page-level test for People page verifying: renders table, search filters, empty states, row click navigation
- Follow existing test patterns in `src/components/crm/*.test.tsx`

### Implementation Order

1. `RowActions` component (standalone, no deps)
2. `FilterOverlay` component (standalone)
3. `FilterBar` component (depends on FilterOverlay)
4. `DataTable` component (depends on FilterBar, RowActions)
5. Update `useContacts` hook with pagination
6. `People` page (composes DataTable with columns/filters)
7. Redirect stub at old `/crm/contacts` route

## Decision 3: Person Detail Page

**Status:** PENDING APPROVAL

### Summary

Replace the current contact detail drawer (420px right-side Sheet) with a full-page detail view at `/customers/people/[contactId]`. Clones Open Mercato's person detail pattern: `PersonHighlights` header + `DetailTabsLayout` tabs + `DetailFieldsSection` grid + `TagsSection`.

### ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to People                                         [Delete]   │
│                                                                      │
│  Sarah Chen  ✏                                                       │
│                                                                      │
│  ┌─────────────────────────────────────────────────────┐             │
│  │ 🏢 Company                                          │             │
│  │ PropNex Realty Pte Ltd →                ✏            │             │
│  └─────────────────────────────────────────────────────┘             │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ Email        │ │ Phone        │ │ Status       │ │ Type       │  │
│  │ sarah@x.co ✏│ │ +65 9123.. ✏│ │ ● Active   ✏│ │ Buyer    ✏│  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────   │
│  Notes ─ Activities ─ Deals ─ Tasks                    [+ Add Note]  │
│  ─────────────────────────────────────────────────────────────────   │
│  │ Meeting with Sarah about Bishan condo              │              │
│  │ 2026-03-09 — Discussion about 3BR units            │              │
│  │                                                    │              │
│  │ Follow-up call scheduled                           │              │
│  │ 2026-03-07 — Confirmed budget range                │              │
│  │                                                    │              │
│                                                                      │
│  Details                                                             │
│  ─────────────────────────────────────────────────────────────────   │
│  ┌───────────────┬───────────────┬───────────────┐                   │
│  │ Display Name  │ First Name    │ Last Name     │                   │
│  │ Sarah Chen  ✏│ Sarah       ✏│ Chen        ✏│                   │
│  ├───────────────┼───────────────┼───────────────┤                   │
│  │ Lifecycle     │ Source        │ Department    │                   │
│  │ Opportunity ✏│ Referral    ✏│ —           ✏│                   │
│  ├───────────────┴───────────────┴───────────────┤                   │
│  │ Notes (full width)                            │                   │
│  │ Relocating from Toa Payoh, looking for...   ✏│                   │
│  └───────────────────────────────────────────────┘                   │
│                                                                      │
│  Custom Fields (if any)                                              │
│  ┌───────────────┬───────────────┐                                   │
│  │ Budget        │ Pre-approval  │                                   │
│  │ $1,850,000  ✏│ DBS $1.6M   ✏│                                   │
│  └───────────────┴───────────────┘                                   │
│                                                                      │
│  Tags                                                                │
│  [Buyer] [High Value] [Bishan Area] [+ Add tag]                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Loading state:**
```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    ⟳ Loading...                                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Error / not found state:**
```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│              Contact not found.                                      │
│              [← Back to People]                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Open Mercato Reference Patterns

#### Pattern 1: Person Detail Page composition

**Source:** `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx` (907 lines)

Page structure (top to bottom):
```
<Page>
  <PageBody className="space-y-8">
    <PersonHighlights ... />          ← header: back link, name, company card, 4-col highlight grid
    <DetailTabsLayout ... >           ← tab bar with section action button
      {activeTab content}             ← Notes | Activities | Deals | Addresses | Tasks
    </DetailTabsLayout>
    <div className="space-y-6">       ← bottom section
      <DetailFieldsSection ... />     ← 3-col grid of inline-editable fields
      <CustomDataSection ... />       ← custom fields form
      <TagsSection ... />             ← tag chips with add/remove
    </div>
  </PageBody>
</Page>
```

Key patterns:
- **Data fetching:** `useEffect` + `readApiResultOrThrow` → `setData(PersonOverview)` (all related data in one payload)
- **Saving:** `savePerson(patch, apply)` — sends PUT with patch, then optimistically applies transform to local state
- **Tab state:** `useState<SectionKey>` initialized from `?tab=` search param
- **Section action:** Each tab can register a contextual action button (e.g., "+ Add Note") via `onActionChange` callback
- **Delete flow:** Confirm dialog → DELETE → redirect to list
- **Loading/error:** Full-page centered spinner / error message with back link

#### Pattern 2: PersonHighlights

**Source:** `packages/core/src/modules/customers/components/detail/PersonHighlights.tsx` (429 lines)

Structure:
```
<div className="space-y-6">
  <FormHeader                          ← back link + title (InlineTextEditor) + [History] [Delete]
    mode="detail"
    backHref="/backend/customers/people"
    title={<InlineTextEditor ... />}
    onDelete={...}
  />
  {companyPanel}                       ← rounded-lg border bg-muted/30 p-3, clickable → company detail
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <InlineTextEditor label="Email" ... />
    <InlineTextEditor label="Phone" ... />
    <InlineDictionaryEditor label="Status" ... />
    <InlineNextInteractionEditor ... />   ← date + name + icon + color
  </div>
</div>
```

Key patterns:
- **Company card:** `rounded-lg border bg-muted/30 p-3`, `cursor-pointer hover:bg-muted/50`, renders company name with edit pencil (hover-visible), click navigates to company detail
- **Company editing:** Inline toggle — click pencil → shows CompanySelectField + Save/Cancel/Clear buttons
- **Highlight grid:** `grid gap-4 md:grid-cols-2 xl:grid-cols-4` — each cell is an `InlineTextEditor` or `InlineDictionaryEditor`
- **All fields inline-editable:** Click field → edit mode, saves via callback

#### Pattern 3: DetailTabsLayout

**Source:** `packages/core/src/modules/customers/components/detail/DetailTabsLayout.tsx` (84 lines)

```tsx
<div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <nav role="tablist" className="flex flex-wrap items-center gap-3 text-sm">
      {tabs.map(tab => (
        <Button
          variant="ghost" size="sm" role="tab"
          className={cn(
            "h-auto rounded-none border-b-2 px-0 py-1",
            active ? "border-primary text-foreground"
                   : "border-transparent text-muted-foreground hover:text-foreground hover:bg-transparent"
          )}
        />
      ))}
    </nav>
    {sectionAction && <Button size="sm">{sectionAction.label}</Button>}
  </div>
  <div>{children}</div>
</div>
```

Key patterns:
- **Tab style:** Underline via `border-b-2`, ghost button with no background
- **Active:** `border-primary text-foreground`
- **Inactive:** `border-transparent text-muted-foreground`
- **Section action:** Right-aligned button with `Plus` icon, disabled when no action registered

#### Pattern 4: DetailFieldsSection

**Source:** `packages/ui/src/backend/detail/DetailFieldsSection.tsx` (163 lines)

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
  {fields.map(field => {
    if (field.kind === 'text') return <InlineTextEditor ... />
    if (field.kind === 'multiline') return <InlineMultilineEditor ... />
    if (field.kind === 'select') return <InlineSelectEditor ... />
    if (field.kind === 'custom') return field.render()
  })}
</div>
```

Key patterns:
- **Grid:** `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`
- **Field config:** Declarative array of `DetailFieldConfig` objects with `key`, `kind`, `label`, `value`, `onSave`, `validator`
- **Editor variants:** `default`, `muted` (bg-muted/30 background), `plain` (no background)
- **Activate on click:** All fields default to `activateOnClick: true`
- **Multiline fields** can span full width via `gridClassName: "sm:col-span-2 xl:col-span-3"`

#### Pattern 5: Tab content sections

**Source:** Person detail page lines 773-871

Each tab renders a specialized section component:
- **Notes tab:** `NotesSection` — chronological notes list with add form, markdown support, deal linking
- **Activities tab:** `ActivitiesSection` — timeline with typed interactions
- **Deals tab:** `DealsSection` — linked deal cards
- **Tasks tab:** `TasksSection` — linked task list with add dialog

All section components follow the pattern:
- Accept `entityId`, `emptyLabel`, `addActionLabel`, `emptyState`, `onActionChange` (registers "+ Add" button)
- Self-contained data fetching
- Optional loading/empty states

---

### File-by-File Reference Mapping

#### New Sunder components (cloned from Open Mercato)

| New Sunder file | Open Mercato source | What to copy | Notes |
|---|---|---|---|
| `src/components/crm/detail/person-highlights.tsx` | `PersonHighlights.tsx` (429 lines) | Header layout, company card, 4-col highlight grid | **Drift**: No dictionary editors, use Sunder's `InlineEditField`. No version history. No `InlineNextInteractionEditor`. Simplified company panel (no CompanySelectField — use existing Sunder Select). |
| `src/components/crm/detail/detail-tabs-layout.tsx` | `DetailTabsLayout.tsx` (84 lines) | **Near-exact copy.** Tab bar with underline style, section action button | **Minimal drift**: Remove `useT`, replace import paths |
| `src/components/crm/detail/detail-fields-section.tsx` | `DetailFieldsSection.tsx` (163 lines) | 3-col grid of inline-editable fields | **Drift**: Use Sunder's existing `InlineEditField` instead of Open Mercato's `InlineTextEditor`/`InlineMultilineEditor`/`InlineSelectEditor`. Same grid layout. |
| `src/components/crm/detail/notes-section.tsx` | N/A (new) | Chronological notes list, wraps existing `ContactTimeline` | **Sunder-specific**: We reuse `ContactTimeline` which already exists. Add simple note form (textarea + submit). |
| `src/components/crm/detail/activities-section.tsx` | N/A (new) | Activity timeline, wraps existing `ContactTimeline` | Thin wrapper — `ContactTimeline` already renders interactions. |
| `src/components/crm/detail/linked-deals-section.tsx` | N/A (new) | Linked deals cards | Reuses `useContactDeals` hook. Card layout: address + stage badge. |
| `src/components/crm/detail/linked-tasks-section.tsx` | N/A (new) | Linked tasks list | Reuses existing task hooks. |
| `src/components/crm/detail/tags-section.tsx` | Open Mercato's `TagsSection` pattern | Tag chips with add/remove | Sunder doesn't have tags yet — **deferred to later**. Render empty placeholder. |
| `src/components/crm/detail/custom-data-section.tsx` | N/A | Custom fields in grid | Reuses existing `CustomFieldEditors` from drawer, but in grid layout instead of stacked. |
| `app/(dashboard)/customers/people/[contactId]/page.tsx` | `people/[id]/page.tsx` (907 lines) | Page composition pattern | **Key drift**: TanStack Query via `useContact(id)`, Sunder's `InlineEditField`, `useUpdateContact` for saves |

#### Existing Sunder files reused (no changes needed)

| File | What it provides |
|---|---|
| `src/components/crm/inline-edit-field.tsx` | Existing inline editor (text, textarea, select, date, number) — replaces Open Mercato's `InlineTextEditor` / `InlineMultilineEditor` / `InlineSelectEditor` |
| `src/components/crm/contact-timeline.tsx` | Existing timeline component — used in Notes and Activities tabs |
| `src/components/crm/stage-badge.tsx` | Deal stage badge — used in Deals tab |
| `src/components/crm/record-drawer/custom-field-editors.tsx` | Custom field editors — reused in custom data section |
| `src/hooks/use-contacts.ts` → `useContact(id)` | Fetches single contact with company join + Realtime subscription |
| `src/hooks/use-update-contact.ts` | Mutation hook for updating contact fields |
| `src/hooks/use-contact-relations.ts` | `useContactDeals(contactId)` — linked deals |
| `src/hooks/use-crm-config.ts` | Dynamic vocabulary options for select fields |
| `src/lib/crm/display.ts` | Formatting helpers |
| `src/lib/crm/schemas.ts` | Contact type + validators |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/contacts/[contactId]/page.tsx` | Replace redirect with redirect to `/customers/people/[contactId]` |
| `src/components/crm/record-drawer/contact-drawer-content.tsx` | **No changes** — drawer stays as fallback, just no longer primary interaction path |

---

### Drift Analysis

#### Drift 1: Inline editors → Sunder's `InlineEditField`
- **Open Mercato:** Has separate `InlineTextEditor`, `InlineMultilineEditor`, `InlineSelectEditor`, `InlineDictionaryEditor`, `InlineNextInteractionEditor` — each with label, empty state, variant styling, activate-on-click, hover pencil trigger
- **Sunder:** Has one `InlineEditField` component supporting text, textarea, select, date, number — with label, onSave, auto-focus, Enter/Escape keyboard shortcuts, save indicator
- **Justification:** Sunder already has a working inline editor. Rewriting 5 separate editors to match Open Mercato exactly adds complexity with no functional benefit. We use our single component and may incrementally add features (variants, hover pencil) in polish passes.
- **Impact:** Fields work the same way (click → edit → save) but the visual micro-interactions differ slightly (Sunder: edit icon always visible vs OM: opacity-0 hover reveal). Can align styling later.

#### Drift 2: Data fetching → TanStack Query
- **Open Mercato:** `useEffect` + `readApiResultOrThrow` + `setData(PersonOverview)` — fetches all related data in one API call
- **Sunder:** `useContact(id)` via TanStack Query + separate hooks for related data (`useContactDeals`, etc.)
- **Justification:** Consistent with Sunder codebase patterns. TanStack Query gives us caching, Realtime subscriptions, and optimistic updates for free.
- **Impact:** Data shape differs — Sunder has flat Contact type vs OM's nested PersonOverview. We compose from multiple hooks.

#### Drift 3: Save pattern → `useUpdateContact` mutation
- **Open Mercato:** `savePerson(patch, apply)` — custom function that sends PUT then applies optimistic transform
- **Sunder:** `useUpdateContact(id).mutateAsync(patch)` — TanStack mutation with automatic cache invalidation
- **Justification:** Sunder's mutation hooks handle cache invalidation and Realtime sync automatically.

#### Drift 4: No version history / send message
- **Open Mercato:** `VersionHistoryAction` button + `SendObjectMessageDialog` in header
- **Sunder:** Neither feature exists.
- **Justification:** Not in v1 scope.

#### Drift 5: No dictionary editors with icons/colors
- **Open Mercato:** `InlineDictionaryEditor` renders dictionary values with icon wrapper + color dot, lazy-loads dictionary entries
- **Sunder:** Select dropdowns with plain text options from `crm_config` vocabularies
- **Justification:** Sunder's vocabulary system doesn't have per-value icons/colors. The select dropdown functionality is identical.

#### Drift 6: No addresses tab
- **Open Mercato:** Has an Addresses tab with address CRUD
- **Sunder:** No address model in CRM. Skip this tab.

#### Drift 7: Tags section → deferred
- **Open Mercato:** Full tags system with add/remove/search
- **Sunder:** No tags table yet. Render placeholder "Tags coming soon" or skip entirely.
- **Justification:** Tags are a data model addition, not an aesthetic change.

#### Drift 8: Notes section → simplified
- **Open Mercato:** Full `NotesSection` with markdown editor, deal linking, viewer attribution, icon/color annotations
- **Sunder:** Wraps existing `ContactTimeline` (reads from `interactions` table). Simple textarea for adding notes via existing agent interaction flow.
- **Justification:** Sunder's interaction model is different — interactions are created by the agent. We show them read-only with optional manual note-add via the `notes` field on the contact.

#### Zero drift (copied exactly)
- **Page composition:** `space-y-8` between PersonHighlights, DetailTabsLayout, and Details/Custom/Tags sections
- **DetailTabsLayout:** Tab bar with `border-b-2 border-primary` active, `border-transparent text-muted-foreground` inactive, section action button with `Plus` icon
- **DetailFieldsSection:** `grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3` with full-width fields via `gridClassName`
- **Company card:** `rounded-lg border bg-muted/30 p-3`, `cursor-pointer hover:bg-muted/50`, click → company detail
- **Highlight grid:** `grid gap-4 md:grid-cols-2 xl:grid-cols-4`
- **Loading state:** Centered spinner + loading text in 50vh container
- **Error state:** Centered error message + back link
- **Delete flow:** Confirm dialog → delete → redirect to list
- **Page container:** `overflow-auto px-4 py-6 md:px-12 md:py-10`, `max-w-5xl mx-auto`

---

### Person Highlight Fields (4-col grid)

| Cell | Field | Editor type | Source |
|------|-------|-------------|--------|
| 1 | Email | InlineEditField (text, type="email") | `contact.email` |
| 2 | Phone | InlineEditField (text, type="tel") | `contact.phone` |
| 3 | Status | InlineEditField (select) | `crm_config.contact_statuses` |
| 4 | Type | InlineEditField (select) | `crm_config.contact_types` |

### Person Detail Fields (3-col grid)

| Field | Kind | Source |
|-------|------|--------|
| Display Name | text | `formatContactFullName(contact)` |
| First Name | text | `contact.first_name` |
| Last Name | text | `contact.last_name` |
| Lifecycle Stage | select | `crm_config.lifecycle_stages` |
| Source | select | `crm_config.contact_sources` |
| Notes | textarea (full width) | `contact.notes` |

### Tab Definitions

| Tab | Content | Data source |
|-----|---------|-------------|
| Notes | Contact timeline (interactions) | `ContactTimeline` component (existing) |
| Activities | Same timeline, different filter? | `ContactTimeline` component (existing) |
| Deals | Linked deal cards (address, stage, price) | `useContactDeals(contactId)` |
| Tasks | Linked task list | Task hooks (existing, deferred if not ready) |

### Responsive Behavior

- **Desktop (≥1024px):** Full layout. Highlight grid 4 columns. Detail fields 3 columns.
- **Tablet (768-1023px):** Highlight grid 2 columns. Detail fields 2 columns.
- **Mobile (<768px):** Everything stacks to 1 column. Tabs scroll horizontally.

### Navigation Flow

```
/customers/people (list) → click row → /customers/people/[contactId] (full page)
                                        ← "Back to People" link returns to list
                                        → click company card → /customers/companies/[companyId]
                                        → click linked deal → /customers/deals/[dealId]
```

### Testing

- Unit tests for `PersonHighlights`, `DetailTabsLayout`, `DetailFieldsSection`
- Page-level test: renders loading → data → tabs switch → inline edit save
- Follow existing test patterns in `src/components/crm/__tests__/`

### Implementation Order

1. `DetailTabsLayout` (standalone, 84-line component)
2. `DetailFieldsSection` (standalone, wraps `InlineEditField`)
3. `PersonHighlights` (depends on `InlineEditField`, company data)
4. Tab content sections (Notes, Deals, Tasks — thin wrappers around existing components)
5. Person detail page (composes all above)
6. Route redirect at old `/crm/contacts/[contactId]`

## Decision 4: Companies List Page

**Status:** PENDING APPROVAL

### Summary

Replace the current companies list page (`/crm/companies`) with a new Companies list page (`/customers/companies`) using the same shared `DataTable`, `FilterBar`, `FilterOverlay`, and `RowActions` components from Decision 2. The only differences are companies-specific column definitions, filter definitions, and data hooks.

### ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Companies                                    [↻ Refresh]  [+ New]   │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                      │
│  [🔎 Search...                              ] [🔽 Filter (1)]       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Industry: Property Agency ×                        Clear all  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Name ↑       Industry       Phone      Website  Contacts Deals│  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │  PropNex      Property Ag.   +65 62..  propnex.com   12    5  ⋯│  │
│  │  DBS Bank     Banking        +65 63..  dbs.com.sg     3    2  ⋯│  │
│  │  Lee & Lee    Law Firm       —         leelee.sg      1    0  ⋯│  │
│  │  ...                                                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Showing 1 to 20 of 8 results           [Previous]  Page 1 of 1  [Next]│
└──────────────────────────────────────────────────────────────────────┘
```

**Filter overlay (same shell as Decision 2, companies-specific filters):**
```
┌──────────────────────────┐
│  Filters            [Close]│
├──────────────────────────┤
│  [Clear]          [Apply]  │
├──────────────────────────┤
│                            │
│  Industry                  │
│  [▼ — select —         ]   │
│                            │
│  Has Email                 │
│  [▼ — Yes/No/Any —    ]   │
│                            │
│  Has Phone                 │
│  [▼ — Yes/No/Any —    ]   │
│                            │
│  Created At                │
│  From: [    date    ]      │
│  To:   [    date    ]      │
│                            │
├──────────────────────────┤
│  [Clear]          [Apply]  │
└──────────────────────────┘
```

**Row actions dropdown (same as Decision 2):**
```
┌────────────────┐
│  View          │
│  Open in Tab   │
│  Delete        │  ← red text
└────────────────┘
```

**Empty state (no companies at all):**
```
┌──────────────────────────────────────────┐
│                                          │
│       🏢  (building icon, large)         │
│                                          │
│       No companies yet                   │
│       Your AI agent will create          │
│       companies as it processes          │
│       conversations.                     │
│                                          │
└──────────────────────────────────────────┘
```

**Empty state (filters active, no results):**
```
┌──────────────────────────────────────────┐
│                                          │
│       No results match your filters      │
│       Try adjusting or clearing filters. │
│                                          │
└──────────────────────────────────────────┘
```

---

### Open Mercato Reference Pattern

**Source:** `packages/core/src/modules/customers/backend/customers/companies/page.tsx` (630 lines)

Structurally identical to the people page (Decision 2 Pattern 5). Same composition:
- `<Page><PageBody>` → `<DataTable<CompanyRow> ... />`
- Same DataTable props: `title`, `refreshButton`, `actions`, `columns`, `data`, `searchValue`/`onSearchChange`, `filters`/`filterValues`/`onFiltersApply`/`onFiltersClear`, `onRowClick`, `rowActions`, `pagination`, `isLoading`
- Same row actions (View, Open in New Tab, Delete)
- Same delete flow (confirm dialog → DELETE → optimistic removal)
- Same filter application and clearing pattern

Key differences from people page:
- **Columns:** name (link), email, status (dictionary), lifecycleStage (dictionary), nextInteraction (compound cell with icon+date+name+color), source (dictionary) + dynamic custom field columns
- **Filters:** Same 9 filter types as people (status, source, lifecycleStage, tags, createdAt, emailContains, hasEmail, hasPhone, hasNextInteraction)
- **Row type:** `CompanyRow` (id, name, description, email, phone, status, lifecycleStage, nextInteraction*, source)

**Note:** Open Mercato's company model has `status`, `lifecycleStage`, `source`, and `nextInteraction` fields — all dictionary-driven. Sunder's company model is simpler (only `industry` as a vocabulary field). This is the main structural difference.

---

### File-by-File Reference Mapping

#### New Sunder files

| New Sunder file | Source | What to create | Notes |
|---|---|---|---|
| `app/(dashboard)/customers/companies/page.tsx` | Open Mercato `companies/page.tsx` + Sunder pattern | Page composing `DataTable` with companies-specific columns, filters, hooks | Uses `useCompanies(filters)` TanStack Query hook. Column definitions for Name, Industry, Phone, Website, Contacts (count), Deals (count), Updated. |

#### Shared components reused from Decision 2 (no changes)

| Component | Created in |
|---|---|
| `src/components/ui/data-table.tsx` | Decision 2 |
| `src/components/ui/filter-bar.tsx` | Decision 2 |
| `src/components/ui/filter-overlay.tsx` | Decision 2 |
| `src/components/ui/row-actions.tsx` | Decision 2 |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/companies/page.tsx` | Replace with redirect to `/customers/companies` |
| `src/hooks/use-companies.ts` | Add pagination support (page, pageSize params → Supabase `.range()`) and additional filter fields (hasEmail, hasPhone, createdAt range) |

#### Existing Sunder files reused (no changes)

| File | What it provides |
|---|---|
| `src/hooks/use-companies.ts` → `useCompanies(filters)` | Company list query with relation counts + Realtime |
| `src/hooks/use-company-relations.ts` | `fetchCompanyRelationCounts()` for contact/deal counts per company |
| `src/hooks/use-crm-config.ts` | `company_industries` vocabulary options |
| `src/lib/crm/schemas.ts` | `Company` type (company_id, name, industry, website, phone, email, address, notes, custom_fields) |
| `src/lib/crm/display.ts` | `formatCrmEnumLabel()` for industry display |
| `src/components/crm/companies-table.tsx` | **Deprecate** — functionality moves into DataTable + page-level column definitions |

---

### Drift Analysis

#### Drift 1: Simpler data model — no status/lifecycle/source/nextInteraction
- **Open Mercato:** Company has `status`, `lifecycleStage`, `source`, `nextInteraction*` fields — all dictionary-driven with icons/colors
- **Sunder:** Company has `industry` as the only vocabulary field. No status, lifecycle, source, or next interaction on companies.
- **Justification:** Sunder's company model was designed simpler. Adding status/lifecycle/source to companies is a data model change, not an aesthetic change.
- **Impact:** Fewer columns and fewer filters than Open Mercato. Companies table shows: Name, Industry, Phone, Website, Contacts (count), Deals (count), Updated. This matches Sunder's current table but with the new DataTable styling.

#### Drift 2: Relation count columns (Sunder-specific)
- **Open Mercato:** No contact/deal count columns in the companies table.
- **Sunder:** Shows "Contacts" (count) and "Deals" (count) columns — valuable for a CRM where you want to see company importance at a glance.
- **Justification:** These columns already exist in Sunder's current companies table and use the existing `fetchCompanyRelationCounts()` infrastructure. Keeping them adds value.
- **Impact:** Two extra columns compared to Open Mercato. No new data fetching — `useCompanies` already returns `CompanyWithCounts` (contact_count, deal_count).

#### Drift 3: Fewer filters
- **Open Mercato:** 9 filters (status, source, lifecycleStage, tags, createdAt, emailContains, hasEmail, hasPhone, hasNextInteraction)
- **Sunder:** 4 filters (Industry, Has Email, Has Phone, Created At) — matching the available company fields
- **Justification:** Can only filter on fields that exist. Sunder's company model doesn't have status/source/lifecycle/tags/nextInteraction.

#### Drifts inherited from Decision 2 (same justifications apply)
- i18n → hardcoded English
- Data fetching → TanStack Query
- No perspectives/saved views
- No export
- No injection system
- No bulk actions / row selection
- Custom field columns — deferred

#### Zero drift (same as Decision 2)
- DataTable layout, styling, pagination, loading/empty states
- FilterBar: search input, filter button with count badge, active chips
- FilterOverlay: left-side panel, backdrop, field renderers, clear/apply
- RowActions: portal menu, auto-positioning, hover behavior, destructive styling
- Row click → navigate to `/customers/companies/[companyId]`

---

### Column Definitions (Sunder Companies table)

```
| Column          | Type     | Cell renderer                          | Sortable |
|-----------------|----------|----------------------------------------|----------|
| Name            | display  | Link to /customers/companies/[id], font-medium hover:underline | Yes (localeCompare) |
| Industry        | accessor | Badge with enum label or muted "—"     | Yes      |
| Phone           | accessor | tel link or muted "—"                  | Yes      |
| Website         | accessor | External link (truncated) or muted "—" | Yes      |
| Contacts        | computed | Number badge (contact_count)           | Yes (numeric) |
| Deals           | computed | Number badge (deal_count)              | Yes (numeric) |
| Updated         | accessor | Relative/formatted date, muted text    | Yes (default desc) |
```

### Filter Definitions (Sunder Companies filters)

```
| Filter          | Type      | Options source                         |
|-----------------|-----------|----------------------------------------|
| Industry        | select    | crm_config.company_industries          |
| Has Email       | checkbox  | Yes/No/Any                             |
| Has Phone       | checkbox  | Yes/No/Any                             |
| Created At      | dateRange | From/To date pickers                   |
```

### Pagination

Same as Decision 2:
- Server-side via Supabase `.range(from, to)` + `.count('exact')`
- Default page size: 20
- `useCompanies` hook gets `page` and `pageSize` params
- Returns `{ data, total, totalPages }`

### Testing

- Page-level test for Companies page verifying: renders table, search filters, empty states, row click navigation
- Shared components (DataTable, FilterBar, etc.) already tested via Decision 2
- Follow existing test patterns in `src/components/crm/*.test.tsx`

### Implementation Order

1. Update `useCompanies` hook with pagination + additional filters
2. `Companies` page (composes DataTable with columns/filters — shared components already built in Decision 2)
3. Redirect stub at old `/crm/companies` route

## Decision 5: Company Detail Page

**Status:** PENDING APPROVAL

### Summary

Replace the current company detail drawer (420px right-side Sheet) with a full-page detail view at `/customers/companies/[companyId]`. Follows the same pattern as Decision 3 (Person Detail): `CompanyHighlights` header + `DetailTabsLayout` tabs + `DetailFieldsSection` grid. Reuses shared components from Decision 3.

### ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Companies                                     [Delete]    │
│                                                                      │
│  PropNex Realty Pte Ltd  ✏                                           │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ Industry     │ │ Phone        │ │ Email        │ │ Website    │  │
│  │ Property   ✏│ │ +65 6223.. ✏│ │ info@pro.. ✏│ │ propnex  ✏│  │
│  │ Agency       │ │              │ │              │ │ .com        │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────   │
│  Contacts ─ Deals                                                    │
│  ─────────────────────────────────────────────────────────────────   │
│  │                                                    │              │
│  │  Sarah Chen          Buyer     Active     3h ago   │              │
│  │  James Tan           Seller    Lead       1d ago   │              │
│  │  Wei Lin             Buyer     Active     2d ago   │              │
│  │                                                    │              │
│                                                                      │
│  Details                                                             │
│  ─────────────────────────────────────────────────────────────────   │
│  ┌───────────────┬───────────────┐                                   │
│  │ Name          │ Address       │                                   │
│  │ PropNex     ✏│ 480 Lorong ✏│                                   │
│  ├───────────────┴───────────────┤                                   │
│  │ Notes (full width)            │                                   │
│  │ Top 5 property agency in... ✏│                                   │
│  └───────────────────────────────┘                                   │
│                                                                      │
│  Custom Fields (if any)                                              │
│  ┌───────────────┬───────────────┐                                   │
│  │ Region        │ License No.   │                                   │
│  │ Central     ✏│ CEA-123     ✏│                                   │
│  └───────────────┴───────────────┘                                   │
│                                                                      │
│  Tags                                                                │
│  [Property Agency] [Premium] [+ Add tag]   ← deferred               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Loading / error states:** Same as Decision 3 (centered spinner in 50vh / error message + back link).

---

### Open Mercato Reference Patterns

#### Pattern 1: Company Detail Page composition

**Source:** `packages/core/src/modules/customers/backend/customers/companies/[id]/page.tsx` (946 lines)

Structurally identical to person detail page (Decision 3 Pattern 1):
```
<Page>
  <PageBody>
    <div className="space-y-8">
      <CompanyHighlights ... />          ← header: back link, name, 4-col highlight grid
      <DetailTabsLayout ... >           ← tab bar: Notes | Activities | Deals | People | Addresses | Tasks
        {activeTab content}
      </DetailTabsLayout>
      <div className="space-y-6">       ← bottom section
        <DetailFieldsSection ... />     ← 3-col grid of 11 fields
        <CustomDataSection ... />
        <TagsSection ... />
      </div>
    </div>
  </PageBody>
</Page>
```

Key differences from person detail:
- **CompanyHighlights** instead of PersonHighlights — no company card (companies don't link to other companies)
- **People tab** instead of — shows linked contacts (the reverse of person detail's "Deals" tab)
- **Detail fields:** 11 fields (displayName, legalName, brandName, description, lifecycleStage, source, domain, industry, sizeBucket, annualRevenue, websiteUrl) vs person's 9

#### Pattern 2: CompanyHighlights

**Source:** `packages/core/src/modules/customers/components/detail/CompanyHighlights.tsx` (165 lines)

Simpler than PersonHighlights — no company card section:
```
<div className="space-y-6">
  <FormHeader                          ← back link + InlineTextEditor title + [History] [Delete]
    mode="detail"
    backHref="/backend/customers/companies"
    title={<InlineTextEditor ... />}
    onDelete={...}
  />
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <InlineTextEditor label="Primary email" ... />
    <InlineTextEditor label="Primary phone" ... />
    <InlineDictionaryEditor label="Status" ... />
    <InlineNextInteractionEditor label="Next interaction" ... />
  </div>
</div>
```

Key patterns:
- **No company card** (unlike PersonHighlights which has the company panel)
- **Same highlight grid:** `grid gap-4 md:grid-cols-2 xl:grid-cols-4`
- **Same FormHeader:** back link + editable title + delete button

---

### File-by-File Reference Mapping

#### New Sunder components

| New Sunder file | Open Mercato source | What to copy | Notes |
|---|---|---|---|
| `src/components/crm/detail/company-highlights.tsx` | `CompanyHighlights.tsx` (165 lines) | Header layout, 4-col highlight grid | **Drift**: Simpler than OM — highlight grid shows Industry (select), Phone (text), Email (text), Website (text) instead of email/phone/status/nextInteraction. No dictionary editors. Uses Sunder's `InlineEditField`. |
| `src/components/crm/detail/linked-contacts-section.tsx` | N/A (new) | Linked contacts list for company detail | Reuses `useCompanyContacts(companyId)` hook. Card layout: name + type badge + status. |
| `app/(dashboard)/customers/companies/[companyId]/page.tsx` | `companies/[id]/page.tsx` (946 lines) | Page composition pattern | **Key drift**: TanStack Query via `useCompany(id)`, Sunder's `InlineEditField`, `useUpdateCompany` for saves. Much simpler field set. |

#### Shared components reused from Decisions 2-3 (no changes)

| Component | Created in |
|---|---|
| `src/components/crm/detail/detail-tabs-layout.tsx` | Decision 3 |
| `src/components/crm/detail/detail-fields-section.tsx` | Decision 3 |
| `src/components/crm/detail/linked-deals-section.tsx` | Decision 3 |
| `src/components/crm/detail/tags-section.tsx` | Decision 3 (deferred) |
| `src/components/crm/detail/custom-data-section.tsx` | Decision 3 |

#### Existing Sunder files reused (no changes)

| File | What it provides |
|---|---|
| `src/components/crm/inline-edit-field.tsx` | Existing inline editor (text, textarea, select, date, number) |
| `src/hooks/use-companies.ts` → `useCompany(companyId)` | Fetches single company + Realtime subscription |
| `src/hooks/use-update-company.ts` | Mutation hook for updating company fields |
| `src/hooks/use-company-relations.ts` | `useCompanyContacts(companyId)`, `useCompanyDeals(companyId)` |
| `src/hooks/use-crm-config.ts` | `company_industries` vocabulary for industry select |
| `src/lib/crm/schemas.ts` | `Company` type |
| `src/lib/crm/display.ts` | `formatCrmEnumLabel()`, `formatContactFullName()` |
| `src/components/crm/stage-badge.tsx` | Deal stage badge — used in Deals tab |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/companies/[companyId]/page.tsx` | Replace with redirect to `/customers/companies/[companyId]` |
| `src/components/crm/record-drawer/company-drawer-content.tsx` | **No changes** — drawer stays as fallback |

---

### Drift Analysis

#### Drift 1: Simpler data model — no status/lifecycle/source/nextInteraction/profile fields
- **Open Mercato:** Company has a rich two-table model: base entity (displayName, email, phone, status, lifecycleStage, source, nextInteraction*) + profile (legalName, brandName, domain, websiteUrl, industry, sizeBucket, annualRevenue). CompanyHighlights shows email/phone/status/nextInteraction. Detail fields: 11 fields.
- **Sunder:** Company is a single table with: name, industry, website, phone, email, address, notes, custom_fields. No status, lifecycle, source, next interaction, legal name, brand name, domain, size, or annual revenue.
- **Justification:** Sunder's company model was designed simpler for a solo real estate agent. The agent creates companies as lightweight records. Adding status/lifecycle/source is a data model change outside this aesthetic overhaul scope.
- **Impact:** CompanyHighlights shows Industry/Phone/Email/Website instead of email/phone/status/nextInteraction. Detail fields section has only 3 fields (Name, Address, Notes) instead of 11.

#### Drift 2: Fewer tabs — Contacts + Deals only
- **Open Mercato:** 6 tabs (Notes, Activities, Deals, People, Addresses, Tasks)
- **Sunder:** 2 tabs (Contacts, Deals)
- **Justification:** Sunder has no notes/activities/addresses/tasks linked to companies. Contacts and deals are the only company relations (via `company_id` FK). Matches the design doc spec: "Company tabs: Contacts | Deals".
- **Impact:** Much simpler tab section. Can add more tabs later when data relationships expand.

#### Drift 3: Highlight grid content — Industry instead of Status
- **Open Mercato:** 4-col grid: Email, Phone, Status (dictionary), Next Interaction (compound)
- **Sunder:** 4-col grid: Industry (select), Phone (text), Email (text), Website (text)
- **Justification:** Sunder companies don't have status or next interaction fields. Industry and Website are the most useful at-a-glance fields for a real estate CRM.

#### Drifts inherited from Decision 3 (same justifications)
- Inline editors → Sunder's `InlineEditField`
- Data fetching → TanStack Query (`useCompany`, `useUpdateCompany`)
- Save pattern → `useUpdateCompany` mutation
- No version history / send message
- No dictionary editors with icons/colors
- Tags section → deferred

#### Zero drift (same as Decision 3)
- **Page composition:** `space-y-8` between CompanyHighlights, DetailTabsLayout, and Details/Custom/Tags sections
- **DetailTabsLayout:** Tab bar with `border-b-2 border-primary` active, `border-transparent text-muted-foreground` inactive
- **DetailFieldsSection:** `grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3`
- **Highlight grid:** `grid gap-4 md:grid-cols-2 xl:grid-cols-4`
- **Loading state:** Centered spinner + loading text in 50vh container
- **Error state:** Centered error message + back link
- **Delete flow:** Confirm dialog → delete → redirect to list
- **Page container:** `overflow-auto px-4 py-6 md:px-12 md:py-10`, `max-w-5xl mx-auto`

---

### Company Highlight Fields (4-col grid)

| Cell | Field | Editor type | Source |
|------|-------|-------------|--------|
| 1 | Industry | InlineEditField (select) | `crm_config.company_industries` |
| 2 | Phone | InlineEditField (text, type="tel") | `company.phone` |
| 3 | Email | InlineEditField (text, type="email") | `company.email` |
| 4 | Website | InlineEditField (text, type="url") | `company.website` |

### Company Detail Fields (3-col grid)

| Field | Kind | Source |
|-------|------|--------|
| Name | text | `company.name` |
| Address | text | `company.address` |
| Notes | textarea (full width, `sm:col-span-2 md:col-span-3`) | `company.notes` |

### Tab Definitions

| Tab | Content | Data source |
|-----|---------|-------------|
| Contacts | Linked contact cards (name, type, status) | `useCompanyContacts(companyId)` |
| Deals | Linked deal cards (address, stage, price) | `useCompanyDeals(companyId)` |

### Responsive Behavior

Same as Decision 3:
- **Desktop (≥1024px):** Full layout. Highlight grid 4 columns. Detail fields 3 columns.
- **Tablet (768-1023px):** Highlight grid 2 columns. Detail fields 2 columns.
- **Mobile (<768px):** Everything stacks to 1 column. Tabs scroll horizontally.

### Navigation Flow

```
/customers/companies (list) → click row → /customers/companies/[companyId] (full page)
                                           ← "Back to Companies" link returns to list
                                           → click linked contact → /customers/people/[contactId]
                                           → click linked deal → /customers/deals/[dealId]
```

### Testing

- Unit test for `CompanyHighlights`
- Page-level test: renders loading → data → tabs switch → inline edit save
- Follow existing test patterns

### Implementation Order

1. `CompanyHighlights` (simpler than PersonHighlights — no company card)
2. `LinkedContactsSection` (new thin wrapper around `useCompanyContacts`)
3. Company detail page (composes all shared + company-specific components)
4. Route redirect at old `/crm/companies/[companyId]`

## Decision 6: Deals List Page

**Status:** PENDING APPROVAL

### Summary

Replace the current deals list page (`/crm/deals`) with a new Deals list page (`/customers/deals`) using the shared `DataTable`, `FilterBar`, `FilterOverlay`, and `RowActions` from Decision 2. **Table-only** — matches Open Mercato's pattern. Pipeline/kanban view moves to a separate route (`/customers/deals/pipeline`).

### ASCII Layout — Deals List

```
┌──────────────────────────────────────────────────────────────────────┐
│  Deals                          [Pipeline →]  [↻ Refresh]  [+ New]   │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                      │
│  [🔎 Search...                              ] [🔽 Filter (1)]       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Stage: Negotiation ×                               Clear all  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Address ↑    Stage        Price    Contact   Company  Updated │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │  123 Bis..   Negotiation  $1.8M    Sarah C.  PropNex   3h    ⋯│  │
│  │  456 Orcha.. Viewing      $2.3M    James T.  —         1d    ⋯│  │
│  │  789 Toa..   Closed       $950K    Wei Lin   DBS       2d    ⋯│  │
│  │  ...                                                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Showing 1 to 20 of 12 results          [Previous]  Page 1 of 1  [Next]│
└──────────────────────────────────────────────────────────────────────┘
```

**Filter overlay (same shell as Decision 2, deals-specific filters):**
```
┌──────────────────────────┐
│  Filters            [Close]│
├──────────────────────────┤
│  [Clear]          [Apply]  │
├──────────────────────────┤
│                            │
│  Stage                     │
│  [▼ — select —         ]   │
│                            │
│  Created At                │
│  From: [    date    ]      │
│  To:   [    date    ]      │
│                            │
├──────────────────────────┤
│  [Clear]          [Apply]  │
└──────────────────────────┘
```

**Row actions, empty states:** Same pattern as Decision 2 (View / Open in Tab / Delete; icon + message empty states).

---

### Open Mercato Reference Pattern

**Source:** `packages/core/src/modules/customers/backend/customers/deals/page.tsx` (1046 lines)

The deals page is the most complex Open Mercato list page:
- Same `DataTable` composition as people/companies
- **10 columns:** title, status (dictionary), pipelineStage (dictionary), pipeline (lookup), value (currency formatted), probability (%), expectedClose (date), companies (association chips), people (association chips), updatedAt
- **2 filters:** people (tags with async search), companies (tags with async search) — both use complex lookup/ingestion system for entity-to-label mapping
- **Delete flow:** Same confirm → delete → optimistic removal pattern
- **Row actions:** Edit, Open in New Tab, Delete

Key difference from people/companies: The deals page has a much more complex filtering system with async entity lookups (people, companies) that search the API and maintain label ↔ id mappings. This is significantly over-engineered for Sunder's needs.

---

### File-by-File Reference Mapping

#### New Sunder files

| New Sunder file | Source | What to create | Notes |
|---|---|---|---|
| `app/(dashboard)/customers/deals/page.tsx` | Open Mercato `deals/page.tsx` + existing Sunder deals page | Page composing `DataTable` only (table view). Uses `useDeals(filters)` TanStack Query hook. Link to pipeline page in actions. |
| `app/(dashboard)/customers/deals/pipeline/page.tsx` | Existing Sunder kanban components | Separate kanban page reusing existing `KanbanBoard` + `DealKanbanCard`. Simple wrapper — no OM complexity. |

#### Shared components reused from Decision 2 (no changes)

| Component | Created in |
|---|---|
| `src/components/ui/data-table.tsx` | Decision 2 |
| `src/components/ui/filter-bar.tsx` | Decision 2 |
| `src/components/ui/filter-overlay.tsx` | Decision 2 |
| `src/components/ui/row-actions.tsx` | Decision 2 |

#### Existing Sunder components reused (no changes)

| Component | What it provides |
|---|---|
| `src/components/crm/kanban-board.tsx` | Generic kanban board with columns, cards, summary |
| `src/components/crm/deal-kanban-card.tsx` | Deal card for kanban view |
| `src/components/crm/stage-badge.tsx` | Stage badge with color |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/deals/page.tsx` | Replace with redirect to `/customers/deals` |
| `src/hooks/use-deals.ts` | Add pagination support (page, pageSize params → Supabase `.range()`) and additional filter fields (stage select, createdAt range) |

#### Existing Sunder files deprecated

| File | Change |
|---|---|
| `src/components/crm/deals-table.tsx` | **Deprecate** — functionality moves into DataTable + page-level column definitions |
| `src/components/crm/view-toggle.tsx` | **Deprecate** — no longer needed, pipeline is a separate route |

---

### Drift Analysis

#### Drift 1: Pipeline as separate route (matches OM pattern)
- **Open Mercato:** Deals list is table-only. Pipeline/kanban is a separate page (`deals/pipeline/page.tsx`) — but massively over-engineered (700 lines, multiple pipeline entities, stage ID lookups, separate API calls).
- **Sunder:** Split to match OM's route structure. Deals list = `DataTable` only. Pipeline/kanban = separate `/customers/deals/pipeline` route reusing existing `KanbanBoard` + `DealKanbanCard` components. Dead simple — columns from `crm_config.deal_stages`, drag-and-drop to update stage, search input. No ViewToggle needed.
- **Justification:** Clean separation matches OM pattern. Keeps deals list page structurally identical to people/companies. Existing kanban components already work well — just need a page wrapper.
- **Impact:** Deals list page is simpler (no conditional rendering). Pipeline page is ~50 lines (vs OM's 700).

#### Drift 2: Simpler data model — no status/pipeline/probability/expectedClose
- **Open Mercato:** Deal has title, status (dictionary), pipelineStage (dictionary), pipeline (lookup), value (amount + currency), probability (%), expectedClose (date), linked people (many), linked companies (many).
- **Sunder:** Deal has address (≈ title), stage (vocabulary), price (integer), notes, company_id (single FK), deal_contacts (join table). No status, pipeline, probability, expected close date.
- **Justification:** Sunder's deal model was designed for Singapore real estate — deals are identified by property address, have a single stage, and a price. The simplified model matches the product scope.
- **Impact:** Fewer columns (6 vs OM's 10) and fewer filters (2 vs OM's complex entity lookup filters).

#### Drift 3: Simpler filters — no async entity lookups
- **Open Mercato:** Complex filter system for people/companies with async search, UUID ↔ label mapping, ingestion, URL sync.
- **Sunder:** Simple select filter for `stage` + date range for `createdAt`. No entity lookup filters.
- **Justification:** Sunder has far fewer deals per client (solo agent). Simple stage filtering is sufficient. Entity lookup filters can be added later.

#### Drift 4: "Pipeline" link in DataTable actions
- **Open Mercato:** DataTable has `actions` prop for top-right buttons. Separate nav sidebar link to pipeline page.
- **Sunder:** Add a "Pipeline" link button in the DataTable `actions` slot (alongside refresh + "+ New") that navigates to `/customers/deals/pipeline`.
- **Justification:** No sidebar nav item for pipeline — it's a secondary view, not a primary section. A link from the deals page is sufficient.

#### Drifts inherited from Decision 2 (same justifications)
- i18n → hardcoded English
- Data fetching → TanStack Query
- No perspectives/saved views
- No export
- No injection system
- No bulk actions / row selection
- Custom field columns — deferred

#### Zero drift (same as Decision 2)
- DataTable layout, styling, pagination, loading/empty states
- FilterBar, FilterOverlay, RowActions patterns
- Row click → navigate to `/customers/deals/[dealId]`
- Delete flow → confirm dialog → delete → optimistic removal

---

### Column Definitions (Sunder Deals table view)

```
| Column          | Type     | Cell renderer                          | Sortable |
|-----------------|----------|----------------------------------------|----------|
| Address         | accessor | Link to /customers/deals/[id], font-medium hover:underline | Yes (localeCompare) |
| Stage           | accessor | StageBadge component (existing)        | Yes      |
| Price           | accessor | formatCrmPrice(), tabular-nums         | Yes (numeric) |
| Contact         | computed | Primary contact name or muted "—"      | No       |
| Company         | computed | Company name or muted "—"              | No       |
| Updated         | accessor | Relative/formatted date, muted text    | Yes (default desc) |
```

### Filter Definitions (Sunder Deals filters)

```
| Filter          | Type      | Options source                         |
|-----------------|-----------|----------------------------------------|
| Stage           | select    | crm_config.deal_stages                 |
| Created At      | dateRange | From/To date pickers                   |
```

### Pagination

Same as Decisions 2/4:
- Server-side via Supabase `.range(from, to)` + `.count('exact')`
- Default page size: 20

### Pipeline Page (`/customers/deals/pipeline`)

Simple page wrapper around existing kanban components:
- Title bar: "Pipeline" + search input
- `KanbanBoard` with columns from `crm_config.deal_stages`
- `DealKanbanCard` for each deal card
- Drag-and-drop to update stage (existing behavior)
- Column summary row with total value (existing behavior)
- Back link to deals list
- ~50 lines of page code — no OM complexity

### Testing

- Deals list page test: renders DataTable with data, search filters, empty states, row click navigation
- Pipeline page test: renders kanban, drag-and-drop
- Shared components already tested via Decision 2

### Implementation Order

1. Update `useDeals` hook with pagination + stage/date filters
2. Deals list page (DataTable only)
3. Pipeline page (existing kanban in new route wrapper)
4. Redirect stub at old `/crm/deals` route

## Decision 7: Deal Detail Page

**Status:** PENDING APPROVAL

### Summary

Replace the current deal drawer (`DealDrawerContent`) with a full-page detail view at `/customers/deals/[dealId]`. Follows the **same single-column pattern** as Decisions 3 (Person) and 5 (Company) — NOT Open Mercato's 2-column layout.

**Why not follow OM's 2-column deal layout?** Open Mercato's deal detail uses a 2-column grid (`2fr | 1.1fr`) with a full `DealForm` sidebar — justified by their complex deal model (title, status, pipeline, pipelineStage, value+currency, probability, expectedClose, owner, source, linked people, linked companies). Sunder's deal has only 5 editable fields (address, stage, price, company, notes). A sidebar form for 5 fields wastes half the page. The single-column layout with inline editing (matching person/company pages) is the right fit.

### ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Deals                                          [Delete]   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  123 Bishan Street 13 #08-42  ✏                                     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 🏢 Company                                              │        │
│  │ PropNex Realty Pte Ltd →                                 │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ Stage        │ │ Price        │ │ Company      │ │ Contact    │ │
│  │ ● Negotiation│ │ $1,850,000   │ │ PropNex      │ │ Sarah Chen │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                      │
│  Contacts ─ Activity                                [+ Add Contact] │
│  ─────────────────────────────────────────────────────────────────── │
│  │                                                                │  │
│  │  ┌────────────────────────────┐ ┌────────────────────────────┐ │  │
│  │  │ Sarah Chen                 │ │ James Tan                  │ │  │
│  │  │ Buyer (Primary)          → │ │ Co-buyer                 → │ │  │
│  │  └────────────────────────────┘ └────────────────────────────┘ │  │
│  │                                                                │  │
│                                                                      │
│  Details                                                            │
│  ┌──────────────┬──────────────┬──────────────┐                     │
│  │ Address      │ Stage        │ Price        │                     │
│  │ 123 Bis.. ✏│ Negotiat.  ✏│ $1,850K    ✏│                     │
│  ├──────────────┴──────────────┴──────────────┤                     │
│  │ Notes (full width)                         │                     │
│  │ Client is relocating from Toa Payoh...  ✏│                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  Custom Fields (if any)                                             │
│  ┌──────────────┬──────────────┐                                    │
│  │ Commission % │ Agent Ref    │                                    │
│  │ 2.5%       ✏│ AG-2026-01 ✏│                                    │
│  └──────────────┴──────────────┘                                    │
│                                                                      │
│  Tags                                                               │
│  [Bishan] [HDB Resale] [+ Add tag]   ← deferred                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Loading / error states:** Same as Decisions 3/5 (centered spinner in 50vh / error message + back link).

---

### Open Mercato Reference Patterns

#### Pattern 1: Deal Detail Page composition (for reference — NOT followed)

**Source:** `packages/core/src/modules/customers/backend/customers/deals/[id]/page.tsx` (691 lines)

Open Mercato uses a **different layout** from person/company:
```
<Page>
  <PageBody>
    <div className="space-y-8">
      <FormHeader ... />                    ← back link, title (NOT editable), delete
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1.1fr)]">
        <div className="space-y-8">         ← LEFT column
          <div className="rounded-lg border bg-card p-6">  ← Highlights card (inline, not extracted)
            <div className="grid gap-4 sm:grid-cols-2">     ← value, probability, status, pipeline, expected close
          </div>
          <div className="space-y-4">       ← Notes/Activities tabs (inline tab bar)
          <div className="grid gap-4 md:grid-cols-2">  ← People & Companies cards
        </div>
        <div className="space-y-6">         ← RIGHT column
          <DealForm ... />                  ← Full edit form for all deal fields
        </div>
      </div>
    </div>
  </PageBody>
</Page>
```

Key observations:
- **No DealHighlights component** — highlights are inline JSX (unlike person/company which have extracted Highlights components)
- **2-column layout** — highlights + tabs left, full DealForm right
- **FormHeader title NOT editable** — "Edit deal details" button scrolls to the form
- **Only 2 tabs:** notes, activities (no deals/people/tasks tabs — people/companies shown as cards below tabs)

**Decision:** We do NOT follow this pattern. Sunder's deal has too few fields for a sidebar form. We use the same single-column layout as person/company detail pages.

---

### File-by-File Reference Mapping

#### New Sunder components

| New Sunder file | Open Mercato source | What to copy | Notes |
|---|---|---|---|
| `src/components/crm/detail/deal-highlights.tsx` | N/A — OM has no extracted component | New component following PersonHighlights/CompanyHighlights pattern | Header: back link + editable address title + delete. Company card (same as PersonHighlights). 4-col grid: Stage (select), Price (text), Company (read-only), Primary Contact (read-only). |
| `src/components/crm/detail/linked-contacts-section.tsx` | Already created in Decision 5 | Reuse — same component, fed with `deal_contacts` data | Render contact cards with name + role badge. Click navigates to `/customers/people/[contactId]`. |
| `app/(dashboard)/customers/deals/[dealId]/page.tsx` | OM's `deals/[id]/page.tsx` (691 lines) — layout NOT copied | Page composition following person/company pattern | Single-column: DealHighlights → DetailTabsLayout (Contacts, Activity) → DetailFieldsSection → CustomDataSection → TagsSection |

#### Shared components reused from Decisions 2-3 (no changes)

| Component | Created in |
|---|---|
| `src/components/crm/detail/detail-tabs-layout.tsx` | Decision 3 |
| `src/components/crm/detail/detail-fields-section.tsx` | Decision 3 |
| `src/components/crm/detail/activities-section.tsx` | Decision 3 |
| `src/components/crm/detail/tags-section.tsx` | Decision 3 (deferred) |
| `src/components/crm/detail/custom-data-section.tsx` | Decision 3 |

#### Existing Sunder files reused (no changes)

| File | What it provides |
|---|---|
| `src/components/crm/inline-edit-field.tsx` | Existing inline editor (text, textarea, select, date, number) |
| `src/components/crm/interaction-timeline.tsx` | Existing timeline — used in Activity tab |
| `src/components/crm/stage-badge.tsx` | Stage badge with color — used in highlights |
| `src/components/crm/record-drawer/custom-field-editors.tsx` | Custom field editors — reused in custom data section |
| `src/hooks/use-deals.ts` → `useDeal(id)` | Fetches single deal with deal_contacts + company join + Realtime |
| `src/hooks/use-update-deal.ts` | Mutation hook for updating deal fields |
| `src/hooks/use-contact-relations.ts` → `useDealInteractions(dealId)` | Interactions for deal activity tab |
| `src/hooks/use-crm-config.ts` | Dynamic vocabulary options (deal_stages, deal_contact_roles) |
| `src/lib/crm/display.ts` | `formatCrmPrice`, `formatContactFullName`, `buildCrmSelectOptions` |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/deals/[dealId]/page.tsx` | Replace with redirect to `/customers/deals/[dealId]` |

#### Existing Sunder files deprecated

| File | Change |
|---|---|
| `src/components/crm/record-drawer/deal-drawer-content.tsx` | **Deprecate** — functionality moves to full-page detail. Keep in codebase (drawers not deleted per design doc). |

---

### Drift Analysis

#### Drift 1: Single-column layout (vs OM's 2-column with sidebar form)
- **Open Mercato:** 2-column grid (`2fr | 1.1fr`) — highlights + tabs left, full DealForm right
- **Sunder:** Single-column layout matching person/company detail pages — highlights → tabs → detail fields grid → custom fields → tags
- **Justification:** Sunder's deal model has 5 editable fields (address, stage, price, company_id, notes). A sidebar form for 5 fields wastes half the page. Inline editing in the detail fields grid is more space-efficient and consistent with other entity pages.
- **Impact:** All three detail pages (person, company, deal) share the same structural pattern. Code reuse is maximized.

#### Drift 2: Editable title (vs OM's read-only title)
- **Open Mercato:** Deal title is NOT inline-editable in the header. There's an "Edit deal details" button that scrolls to the DealForm sidebar.
- **Sunder:** Deal address (≈ title) IS inline-editable in the header, matching person/company highlights pattern.
- **Justification:** Consistency with person/company pages. No sidebar form to scroll to.

#### Drift 3: Company card in highlights (OM has none for deals)
- **Open Mercato:** Deal detail has no company card — companies shown as linked cards below tabs.
- **Sunder:** Include company card in DealHighlights (same pattern as PersonHighlights) since deals have a single `company_id` FK.
- **Justification:** Company is a primary relationship for deals. Showing it prominently in the header (clickable link to company detail) is more useful than burying it in a tab.

#### Drift 4: Contacts tab (vs OM's inline cards)
- **Open Mercato:** People/companies shown as linked cards in the left column below tabs — NOT inside a tab.
- **Sunder:** Contacts shown in a "Contacts" tab using `LinkedContactsSection` (reused from Decision 5).
- **Justification:** Consistency with the tab-based pattern used in person/company pages. Contacts tab shows name + role + primary badge.

#### Drift 5: Simpler data model
- **Open Mercato:** Deal has title, status, pipelineStage, pipeline, value (amount + currency), probability, expectedClose, owner, source, linked people (many), linked companies (many).
- **Sunder:** Deal has address, stage, price, notes, company_id (single FK), deal_contacts (join table). No status, pipeline, probability, expected close, owner, source.
- **Justification:** Sunder's deal model designed for Singapore real estate. Deals identified by property address, single stage, integer price.
- **Impact:** Fewer highlight fields (4 vs OM's 5), fewer detail fields (4 vs OM's 10+), only 2 tabs (Contacts, Activity) vs OM's 2 inline sections.

#### Drifts inherited from Decision 3 (same justifications)
- i18n → hardcoded English
- No version history
- No injection system
- Tags section deferred

#### Zero drift (same as Decision 3)
- Page structure: highlights → tabs → detail fields → custom fields → tags
- DetailTabsLayout styling: underline tabs, section action button
- DetailFieldsSection: 3-col responsive grid with inline editing
- Delete flow: confirm dialog → delete → navigate to list
- Loading/error states
- Responsive behavior: 4-col → 2-col → 1-col highlights grid

---

### Highlight Fields (4-col grid)

```
| Field           | Type       | Source                                    |
|-----------------|------------|-------------------------------------------|
| Stage           | select     | deal.stage, options from crm_config.deal_stages |
| Price           | text       | formatCrmPrice(deal.price), read-only display |
| Company         | read-only  | deal.companies?.name or "—"               |
| Contact         | read-only  | Primary deal_contact name or "—"          |
```

### Detail Fields (3-col grid)

```
| Field           | Kind       | Editable | Grid span                    |
|-----------------|------------|----------|------------------------------|
| Address         | text       | Yes      | 1 col                        |
| Stage           | select     | Yes      | 1 col                        |
| Price           | text       | Yes      | 1 col                        |
| Notes           | multiline  | Yes      | Full width (sm:col-span-2 md:col-span-3) |
```

### Tab Definitions

```
| Tab             | Content                                  | Data source                    |
|-----------------|------------------------------------------|--------------------------------|
| Contacts        | Contact cards with name + role badge      | deal.deal_contacts (from useDeal) |
| Activity        | InteractionTimeline                      | useDealInteractions(dealId)    |
```

### Navigation Flow

```
/customers/deals (list) → click row → /customers/deals/[dealId] (full page)
                                       ← "Back to Deals" link returns to list
                                       → click contact card → /customers/people/[contactId]
                                       → click company card → /customers/companies/[companyId]
```

### Testing

- Unit test for `DealHighlights`
- Page-level test: renders loading → data → tabs switch → inline edit save
- Follow existing test patterns

### Implementation Order

1. `DealHighlights` (follows PersonHighlights/CompanyHighlights pattern — address title, company card, 4-col grid)
2. Deal detail page (composes all shared + deal-specific components)
3. Route redirect at old `/crm/deals/[dealId]`

## Decision 8: Customers Dashboard Landing

**Status:** PENDING APPROVAL

### Summary

Replace the current `/crm` redirect (which just redirects to `/crm/contacts`) with a proper dashboard landing page at `/customers`. Shows at-a-glance summaries: stat cards, recent activity, upcoming interactions, and pipeline overview.

**Open Mercato reference:** OM has a full widget-based dashboard system (widget registry, settings hydration/dehydration, per-widget API routes, feature flags, configurable page sizes). We do NOT follow this pattern. It's massively over-engineered for a solo-agent product. We build a simple, hardcoded dashboard page with inline TanStack Query hooks.

### ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Customers                                                           │
│                                                                      │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌──────────┐│
│  │ People        │ │ Deals         │ │ Tasks         │ │ Due      ││
│  │      47       │ │      12       │ │    8 open     │ │   3      ││
│  │ +3 this week  │ │ $2.1M total   │ │ 2 overdue     │ │  today   ││
│  └───────────────┘ └───────────────┘ └───────────────┘ └──────────┘│
│                                                                      │
│  ┌─────────────────────────┐ ┌──────────────────────────────────────┐│
│  │ Recent Activity         │ │ Pipeline Overview                    ││
│  │                         │ │                                      ││
│  │ • Call with Sarah Chen  │ │  Leads     Viewing    Negotiation    ││
│  │   Today 10:30 AM        │ │  ████░░░   ██████░░   ████░░░░░     ││
│  │                         │ │  4 deals   3 deals    2 deals       ││
│  │ • Email to James Tan    │ │  $890K     $1.2M      $650K         ││
│  │   Yesterday 3 PM        │ │                                      ││
│  │                         │ │  Offer     Closed                    ││
│  │ • Viewing logged        │ │  ██░░░░░   ████████                  ││
│  │   Mar 8                 │ │  1 deal    4 deals                   ││
│  │                         │ │  $380K     $2.1M                     ││
│  │ [View all →]            │ │                                      ││
│  └─────────────────────────┘ └──────────────────────────────────────┘│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Stat Cards (4-col grid)

```
| Card     | Primary metric       | Secondary metric          | Data source                       |
|----------|----------------------|---------------------------|-----------------------------------|
| People   | Total count          | New this week             | contacts table count + date filter |
| Deals    | Total count          | Total price sum           | deals table count + sum(price)     |
| Tasks    | Open count           | Overdue count             | crm_tasks where status != done     |
| Due      | Due today count      | —                         | crm_tasks where due_date = today   |
```

Each stat card: `rounded-xl border bg-card p-6 shadow-sm`. Primary metric in `text-3xl font-bold`. Secondary in `text-sm text-muted-foreground`. Click navigates to the relevant list page.

### Recent Activity

- Last 5 interactions across all contacts, ordered by `occurred_at DESC`
- Each row: interaction type icon + contact name + summary + relative time
- Click navigates to contact detail page
- "View all" link (optional — can link to contacts page)
- New hook: `useRecentInteractions(limit: number)` — simple Supabase query on `interactions` table

### Pipeline Overview

- Horizontal stacked bar or segmented display showing deals grouped by stage
- Each stage: label + deal count + total price sum
- Data from `useDeals({})` — group client-side by `stage`, sum `price` per group
- Stage colors from `StageBadge` color map
- Click on a stage navigates to deals list filtered by that stage

### No "Upcoming Interactions" Widget

The original design doc proposed an "Upcoming Interactions" widget, but Sunder has no `next_interaction` or `scheduled_at` field on interactions. Interactions are past events logged by the agent. We drop this widget — recent activity is sufficient.

---

### File-by-File Reference Mapping

#### New Sunder files

| New Sunder file | What to create | Notes |
|---|---|---|
| `app/(dashboard)/customers/page.tsx` | Dashboard page composing StatCards + RecentActivity + PipelineOverview | Replaces redirect. Uses inline TanStack Query hooks for counts. |
| `src/components/crm/dashboard/stat-card.tsx` | Reusable stat card (icon, label, primary metric, secondary metric, href) | Simple presentational component, ~30 lines |
| `src/components/crm/dashboard/recent-activity.tsx` | Recent interactions list | Uses `useRecentInteractions` hook. Renders interaction rows with type icon + contact name + time. |
| `src/components/crm/dashboard/pipeline-overview.tsx` | Pipeline stage summary | Uses `useDeals({})` grouped by stage. Horizontal bars with count + price sum. |
| `src/hooks/use-recent-interactions.ts` | New hook: fetches latest N interactions globally | Simple Supabase query: `interactions` table, order by `occurred_at DESC`, limit N, join contact name. |
| `src/hooks/use-dashboard-stats.ts` | New hook: fetches counts for stat cards | Parallel Supabase count queries (contacts, deals + sum, tasks open/overdue/due today). Returns all in one hook. |

#### Existing Sunder files modified

| File | Change |
|---|---|
| `app/(dashboard)/crm/page.tsx` | Replace redirect target from `/crm/contacts` to `/customers` |

#### Existing Sunder files reused (no changes)

| File | What it provides |
|---|---|
| `src/components/crm/stage-badge.tsx` | Stage colors for pipeline overview |
| `src/lib/crm/display.ts` | `formatCrmPrice` for price sums |
| `src/hooks/use-deals.ts` | Deal data for pipeline grouping |

---

### Drift Analysis

#### Drift 1: No widget system (vs OM's full widget registry)
- **Open Mercato:** Full widget system — registry, settings schemas, hydration/dehydration, per-widget API routes, feature flags, configurable page sizes, drag-and-drop layout.
- **Sunder:** Hardcoded dashboard page with inline components. No widget registry, no settings, no per-widget API routes.
- **Justification:** Solo-agent product with one tenant. No need for configurable dashboards. A simple page with 3 sections (stats, activity, pipeline) is sufficient. YAGNI.

#### Drift 2: No upcoming interactions widget
- **Original design doc:** Proposed an "Upcoming Interactions" widget.
- **Decision:** Dropped. Sunder's `interactions` table records past events (agent-logged calls, emails, viewings). There's no `scheduled_at` or `next_interaction` field. Recent activity covers the use case.

#### Drift 3: Pipeline overview is read-only summary (not interactive kanban)
- **Open Mercato:** Full kanban board in pipeline page with drag-and-drop.
- **Sunder dashboard:** Pipeline section is a read-only summary (deal counts + price sums per stage). For the interactive kanban, users go to `/customers/deals/pipeline` (Decision 6).
- **Justification:** Dashboard is for at-a-glance overview, not interaction. Keep it simple.

#### Zero drift
- Stat card layout and styling (follows standard card patterns)
- Recent activity list pattern (icon + name + time)
- Responsive grid behavior (4-col → 2-col → 1-col for stat cards)

---

### Responsive Behavior

- **Desktop (>= 1024px):** Stat cards in 4-col grid. Activity + Pipeline side by side (`grid-cols-2`).
- **Tablet (768-1023px):** Stat cards in 2-col grid. Activity + Pipeline stack vertically.
- **Mobile (< 768px):** Everything stacks to 1 column.

### Testing

- Page-level test: renders stat cards with mock data, recent activity list, pipeline bars
- Individual component tests for StatCard, RecentActivity, PipelineOverview
- Follow existing test patterns

### Implementation Order

1. `use-dashboard-stats.ts` hook (count queries)
2. `use-recent-interactions.ts` hook (global interactions query)
3. `StatCard` component
4. `RecentActivity` component
5. `PipelineOverview` component
6. Dashboard page (composes all)
7. Update old `/crm` redirect
