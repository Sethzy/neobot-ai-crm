# Twenty CRM Reference — CRM UX Gold Standard and Sunder Drift

> **Purpose:** Source-of-truth reference for bringing Sunder CRM to an Attio-level / Twenty-level UX standard.
>
> **Reference repo:** `https://github.com/twentyhq/twenty` (local clone: `/Users/sethlim/Documents/twenty`)
>
> **Sunder repo:** `/Users/sethlim/Documents/sunder-next-migration-20260225`
>
> **Date:** 2026-04-23

---

## 1. Executive Summary

If we want Attio-level CRM UX, the gold standard is **not** "better tables" or "nicer cards". Twenty’s quality comes from a **coherent CRM surface architecture**:

1. A shared **record index shell** for every object list page.
2. A real **views system** with fields, filters, sorts, groups, dirty-state, and multiple view types.
3. A dedicated **record table subsystem** with keyboard behavior, inline editing, column management, and view-driven state.
4. A first-class **record show surface** with shared page layouts, tabs, and widgets.
5. **Navigation and favorites** driven by metadata rather than hardcoded sidebar links.
6. A serious **testing pyramid** around CRM UX, not just page smoke tests.

Sunder already has useful CRM pieces, but today it is still a set of object-specific pages using shared widgets. That is materially below Twenty’s standard.

The main conclusion:

- We should **copy Twenty’s CRM UX architecture with minimal drift**.
- The default should be **behavioral parity**.
- The only justified drifts are **stack translation** and **scope reduction**, not UX simplification.

---

## 2. What Twenty Actually Implements

DeepWiki review plus source inspection show that Twenty’s CRM UX is centered on a few major subsystems.

### 2.1 Record index shell

Twenty does not build people, companies, opportunities, and tasks as separate ad hoc pages. It builds a common object-index system and swaps object metadata into it.

Primary reference files:

- `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexContainer.tsx`
- `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexTableContainer.tsx`
- `packages/twenty-front/src/modules/object-record/record-index/hooks/useLoadRecordIndexStates.ts`
- `packages/twenty-front/src/modules/object-record/record-index/hooks/useOpenRecordFromIndexView.ts`

Key pattern:

- `RecordIndexContainer` owns the full page shell.
- It always renders a `ViewBar`.
- It switches between table / kanban / calendar from a shared state model.
- It applies effects that sync current view state into record fields, filters, sorts, filter groups, and other per-view UI state.

This is the core UX pattern we should copy.

### 2.2 Views are first-class product state

Twenty treats views as a full product primitive, not just a saved filter preset.

Primary reference files:

- `packages/twenty-front/src/modules/views/components/ViewBar.tsx`
- `packages/twenty-front/src/modules/views/components/ViewBarDetails.tsx`
- `packages/twenty-front/src/modules/views/components/UpdateViewButtonGroup.tsx`
- `packages/twenty-front/src/modules/views/hooks/useSaveCurrentViewFields.ts`
- `packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts`
- `packages/twenty-server/src/database/typeorm/core/migrations/common/1770818941843-add-view-field-group.ts`

Key pattern:

- The top bar is the view shell, not a generic filter row.
- Current state includes:
  - active view
  - visible fields / field order
  - filters
  - filter groups
  - sorts
  - grouping
  - view type
  - open-record behavior
  - calendar field / board grouping where relevant
- The UI exposes dirty-state and asks whether to update the current view or save a new view.

This is much closer to Attio than Sunder’s current `crm_views` design.

### 2.3 Table UX is its own subsystem

Twenty’s table UX is not a thin TanStack wrapper.

Primary reference files:

- `packages/twenty-front/src/modules/object-record/record-table/components/RecordTableWithWrappers.tsx`
- `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeader.tsx`
- `packages/twenty-front/src/modules/object-record/record-table/record-table-body/components/RecordTableBodyFocusKeyboardEffect.tsx`
- `packages/twenty-front/src/modules/object-record/record-table/__stories__/RecordTable.stories.tsx`

Key pattern:

- Table behavior is view-aware.
- Column rendering is driven by view fields and object metadata.
- Header interactions, inline edit cells, focus movement, selection, and open-record behavior are all part of the same system.
- This is where the UX polish actually comes from.

### 2.4 Record detail pages are first-class, not just drawers

Twenty supports side panel opening and full record pages from the same index view system.

Primary reference files:

- `packages/twenty-front/src/modules/object-record/record-index/hooks/useOpenRecordFromIndexView.ts`
- `packages/twenty-front/src/pages/object-record/RecordShowPage.tsx`
- `packages/twenty-front/src/modules/object-record/record-show/components/PageLayoutRecordPageRenderer.tsx`

Key pattern:

- Opening a record preserves parent view context.
- Desktop can open in side panel.
- Mobile or configured behavior opens a full page.
- Record pages use shared page-layout definitions.

This is important: Twenty does **not** force a drawer-only interaction model.

### 2.5 Standard views and page layouts are seeded

Twenty ships opinionated defaults instead of making the user assemble the CRM from scratch.

Primary reference files:

- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/compute-standard-person-views.util.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/compute-standard-company-views.util.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/compute-standard-opportunity-views.util.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-person-page-layout.config.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-company-page-layout.config.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-opportunity-page-layout.config.ts`

Key pattern:

- Standard objects ship with default table / board views.
- Opportunity ships with an `All Opportunities` table view and `By Stage` kanban view.
- Record pages ship with default tabs like Home, Timeline, Tasks, Notes, Files, Emails, Calendar.

This matters because good CRM UX is heavily about defaults.

### 2.6 Navigation and favorites are part of the CRM system

DeepWiki confirms that navigation items, favorites, and object metadata collectively shape the sidebar and object UX.

Primary reference files:

- `packages/twenty-server/src/engine/workspace-manager/standard-objects-prefill-data/prefill-workspace-favorites.ts`
- DeepWiki-identified frontend files including:
  - `MainNavigationDrawerScrollableItems.tsx`
  - `FavoritesSectionDispatcher.tsx`
  - `FavoritesSection.tsx`
  - `WorkspaceSectionContainer.tsx`
  - `useWorkspaceNavigationMenuItems.ts`

Key pattern:

- The sidebar is not just a hardcoded menu.
- Objects, views, and favorites are represented as data.
- The system can expose favorites and workspace navigation dynamically.

That is a real product difference vs Sunder’s current sidebar.

### 2.7 The testing bar is much higher

Primary reference files:

- `packages/twenty-e2e-testing/tests/create-record.spec.ts`
- `packages/twenty-e2e-testing/tests/create-kanban-view.spec.ts`
- `packages/twenty-front/src/modules/object-record/record-table/__stories__/RecordTable.stories.tsx`

Key pattern:

- E2E tests validate actual user flows.
- Storybook/stories lock in table behavior and states.
- Backend metadata/view migrations are treated as real platform concerns.

---

## 3. Sunder Today

Sunder has meaningful CRM functionality, but the architecture is lighter and more page-specific.

### 3.1 CRM routes are page-by-page

Current pages:

- `app/(dashboard)/customers/people/page.tsx`
- `app/(dashboard)/customers/companies/page.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `app/(dashboard)/tasks/page.tsx`

Current shape:

- People and companies render a `PageHeader`, `FilterBar`, `ViewPicker`, `ListTable`, and `RecordDrawer`.
- Deals adds `ViewToggle` and `KanbanBoard`.
- Tasks adds `ViewToggle`, `KanbanBoard`, and `CrmTasksCalendar`.

This is functional, but it is not a unified record-index system.

### 3.2 Saved views are still a lightweight preset model

Current files:

- `src/hooks/use-crm-views.ts`
- `supabase/migrations/20260405000001_create_crm_views.sql`
- `src/lib/crm/view-filters.ts`
- `src/lib/crm/schemas.ts`
- `src/lib/managed-agents/tools/crm/manage-views.ts`

Current persistence model:

- one `crm_views` row per saved view
- `filters JSONB`
- `sort JSONB`
- no child tables for fields, field groups, filter groups, board groups, or layout-specific view state

That is enough for simple presets, but not for Twenty-grade CRM UX.

### 3.3 Table UX is shared but generic

Current files:

- `src/components/ui/list-table.tsx`
- `src/lib/crm/build-columns.tsx`
- `src/components/crm/quick-edit-cell.tsx`

This gives us a useful baseline, but it is not a dedicated CRM table architecture with view-driven field state, keyboard model, and column management.

### 3.4 Record detail UX is drawer-first and mostly drawer-only

Current files:

- `src/hooks/use-record-drawer.ts`
- `src/components/crm/record-drawer/record-drawer.tsx`
- `src/components/crm/record-drawer/contact-drawer-content.tsx`
- `src/components/crm/record-drawer/company-drawer-content.tsx`
- `src/components/crm/record-drawer/deal-drawer-content.tsx`
- `src/components/crm/record-drawer/task-drawer-content.tsx`
- `src/components/crm/record-drawer/record-detail-panel-shell.tsx`

Current behavior:

- list pages open the drawer
- there are not equivalent first-class show pages under `customers/*/[id]/page.tsx`

This is a major UX drift from Twenty.

### 3.5 CRM metadata is config-array based

Current files:

- `src/lib/crm/config.ts`
- `src/lib/crm/field-definitions.ts`
- `src/lib/crm/build-columns.tsx`

This is practical, but it is not yet the same class of metadata-driven system as Twenty’s object metadata + view metadata architecture.

### 3.6 Sidebar navigation is static

Current file:

- `src/components/layout/app-sidebar.tsx`

Current behavior:

- hardcoded `crmNavItems`
- no favorites
- no view-based sidebar affordances
- no navigation metadata layer

---

## 4. Drift Matrix

| Area | Twenty | Sunder Today | Severity | Default Position |
|---|---|---|---|---|
| Record index architecture | Shared object-index shell | Separate page implementations | High | Remove drift |
| View model | First-class fields/filters/groups/sorts/view type | Saved filter/sort presets | High | Remove drift |
| Table UX | Dedicated record-table subsystem | Generic `ListTable` | High | Remove drift |
| Record opening model | Side panel + full page | Drawer-first / mostly drawer-only | High | Remove drift |
| Record page layouts | Seeded layouts with tabs/widgets | Drawer content only, no page-layout system | High | Remove drift |
| Default seeded views | Standard object defaults | Partial object-specific defaults | Medium | Remove drift |
| Navigation/favorites | Metadata-driven | Hardcoded sidebar | Medium | Remove drift |
| Metadata system | Full object + field + view metadata | Config arrays plus JSONB custom fields | Medium | Reduce drift where needed |
| State tech | Apollo / Jotai / React Router / Linaria | TanStack Query / Next / Tailwind / local state | Low | Necessary drift |
| Backend platform | TypeORM metadata engine | Supabase + RLS + migrations | Low | Necessary drift |
| Testing | E2E + stories + metadata integration | page tests + unit tests | High | Remove drift |

---

## 5. Good Reasons to Drift

These are the real reasons to drift. They are valid, but they only justify **implementation translation**, not weaker UX.

### 5.1 Stack translation

Twenty stack:

- React Router
- Apollo GraphQL
- Jotai state atoms
- Linaria styling
- TypeORM-based metadata engine

Sunder stack:

- Next.js App Router
- TanStack Query
- Supabase + RLS
- Tailwind 4 + ShadCN + Flexoki tokens

This means:

- we should not copy Twenty source files literally line-for-line
- we **should** copy the module boundaries, state model, UI behavior, and seeded defaults very closely

### 5.2 Scope reduction

Twenty supports a larger generalized platform:

- broader object metadata platform
- app/plugin extension model
- more general workspace navigation concepts

Sunder does not need to ship the entire arbitrary-object platform immediately.

This means:

- we can scope the first pass to `contacts`, `companies`, `deals`, and `tasks`
- we do **not** need this as a reason to keep weak saved views or drawer-only records

### 5.3 Existing Sunder constraints

Some current Sunder concepts are already good local constraints:

- Supabase RLS and client isolation
- managed agent tooling around CRM views
- Flexoki semantic token design rules

These should shape translation, not force product drift.

---

## 6. No Good Reasons to Drift

We should treat these as unjustified drifts unless a concrete blocker appears.

1. **Drawer-only details**
   - Twenty already supports side-panel and full-page opening.
   - We should support both.

2. **Saved views as a single JSON blob**
   - This blocks field-level parity, grouped filters, per-view columns, and update-vs-save-new UX.

3. **Static CRM sidebar**
   - This blocks favorites, dynamic saved views, and a more serious CRM shell.

4. **Per-page composition instead of a shared record-index module**
   - This guarantees drift across objects over time.

5. **Treating table, kanban, and calendar as disconnected widgets**
   - Twenty treats them as modes of the same view system.

---

## 7. Near-Zero-Drift Implementation Program

The default should be to copy Twenty’s behavior and module responsibilities as closely as our stack allows.

### Task 1 — Introduce a shared `record-index` subsystem

**Outcome**

Replace page-specific CRM list composition with a common Sunder record-index shell for people, companies, deals, and tasks.

**Twenty files to copy/reference**

- `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexContainer.tsx`
- `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexTableContainer.tsx`
- `packages/twenty-front/src/modules/object-record/record-index/hooks/useLoadRecordIndexStates.ts`

**Sunder files to touch**

- create `src/components/crm/record-index/record-index-container.tsx`
- create `src/components/crm/record-index/record-index-table-container.tsx`
- create `src/components/crm/record-index/use-load-record-index-state.ts`
- refactor:
  - `app/(dashboard)/customers/people/page.tsx`
  - `app/(dashboard)/customers/companies/page.tsx`
  - `app/(dashboard)/customers/deals/page.tsx`
  - `app/(dashboard)/tasks/page.tsx`

**Testing/docs to check**

- existing page tests under `app/(dashboard)/customers/**/__tests__`
- this reference doc
- `crm-configurability-reference.md`
- `calendar-view.md`

**Drift**

- Necessary: Next + TanStack Query implementation
- Not acceptable: keeping different UX shells per object

### Task 2 — Replace `FilterBar` + `ViewPicker` with a real `ViewBar`

**Outcome**

Make views the primary list-page control surface.

**Twenty files to copy/reference**

- `packages/twenty-front/src/modules/views/components/ViewBar.tsx`
- `packages/twenty-front/src/modules/views/components/ViewBarDetails.tsx`
- `packages/twenty-front/src/modules/views/components/UpdateViewButtonGroup.tsx`
- `packages/twenty-front/src/modules/views/hooks/useSaveCurrentViewFields.ts`
- `packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts`

**Sunder files to touch**

- create `src/components/crm/view-bar/view-bar.tsx`
- create `src/components/crm/view-bar/view-bar-details.tsx`
- create `src/components/crm/view-bar/update-view-button-group.tsx`
- either delete or demote:
  - `src/components/ui/filter-bar.tsx`
  - `src/components/crm/view-picker.tsx`
- integrate into:
  - `src/components/crm/record-index/record-index-container.tsx`

**Testing/docs to check**

- page tests
- `src/hooks/__tests__/use-crm-views.test.tsx`

**Drift**

- Necessary: adapt to Flexoki/Tailwind and our URL conventions
- Not acceptable: staying with "view picker + separate filter bar + no dirty-state"

### Task 3 — Normalize CRM view persistence

**Outcome**

Upgrade saved views from presets to first-class view entities.

**Twenty files to copy/reference**

- `packages/twenty-server/src/database/typeorm/core/migrations/common/1770818941843-add-view-field-group.ts`
- `packages/twenty-front/src/modules/views/hooks/useSaveCurrentViewFields.ts`
- `packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts`

**Sunder files to touch**

- add Supabase migrations for at least:
  - `crm_view_fields`
  - `crm_view_filters`
  - `crm_view_filter_groups`
  - `crm_view_groups`
  - optional: `crm_view_field_groups`
- refactor:
  - `supabase/migrations/20260405000001_create_crm_views.sql`
  - `src/lib/crm/schemas.ts`
  - `src/lib/crm/view-filters.ts`
  - `src/hooks/use-crm-views.ts`
  - `src/lib/managed-agents/tools/crm/manage-views.ts`
  - regenerate `src/types/database.ts`

**Testing/docs to check**

- add migration coverage
- add hook tests for composite view state

**Drift**

- Necessary: Supabase tables instead of Twenty TypeORM entities
- Not acceptable: keeping view columns/groups/filter groups buried in JSON blobs

### Task 4 — Replace `ListTable` with a CRM `record-table` subsystem

**Outcome**

Promote the table from a shared utility to a CRM product surface.

**Twenty files to copy/reference**

- `packages/twenty-front/src/modules/object-record/record-table/components/RecordTableWithWrappers.tsx`
- `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeader.tsx`
- `packages/twenty-front/src/modules/object-record/record-table/record-table-body/components/RecordTableBodyFocusKeyboardEffect.tsx`
- `packages/twenty-front/src/modules/object-record/record-table/__stories__/RecordTable.stories.tsx`

**Sunder files to touch**

- create `src/components/crm/record-table/record-table.tsx`
- create `src/components/crm/record-table/record-table-header.tsx`
- create `src/components/crm/record-table/record-table-keyboard-effects.tsx`
- create `src/components/crm/record-table/record-table-cell-renderers.tsx`
- demote or replace:
  - `src/components/ui/list-table.tsx`
- integrate with:
  - `src/lib/crm/build-columns.tsx`
  - `src/components/crm/quick-edit-cell.tsx`

**Testing/docs to check**

- new stories or preview harness for header/menu/scroll/focus states
- list-page tests
- `inline-cell-editing.md`

**Drift**

- Necessary: TanStack Table implementation details
- Not acceptable: generic table behavior that cannot express view state cleanly

### Task 5 — Add first-class record show pages and shared page layouts

**Outcome**

Support both side-panel open and full-page record navigation, backed by the same content system.

**Twenty files to copy/reference**

- `packages/twenty-front/src/modules/object-record/record-index/hooks/useOpenRecordFromIndexView.ts`
- `packages/twenty-front/src/pages/object-record/RecordShowPage.tsx`
- `packages/twenty-front/src/modules/object-record/record-show/components/PageLayoutRecordPageRenderer.tsx`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-person-page-layout.config.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-company-page-layout.config.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-opportunity-page-layout.config.ts`

**Sunder files to touch**

- create:
  - `app/(dashboard)/customers/people/[contactId]/page.tsx`
  - `app/(dashboard)/customers/companies/[companyId]/page.tsx`
  - `app/(dashboard)/customers/deals/[dealId]/page.tsx`
- create `src/components/crm/record-show/page-layout-record-page-renderer.tsx`
- create `src/lib/crm/default-page-layouts.ts`
- refactor:
  - `src/hooks/use-record-drawer.ts`
  - `src/components/crm/record-drawer/*`

**Testing/docs to check**

- existing drawer tests
- `files-tab-reference.md`
- `timeline-audit-log-reference.md`
- `company-object-reference.md`

**Drift**

- Necessary: Next route segments instead of React Router
- Not acceptable: keeping drawer content as the only record-detail surface

### Task 6 — Seed standard views for every CRM object

**Outcome**

Ship opinionated defaults the same way Twenty does.

**Twenty files to copy/reference**

- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/compute-standard-person-views.util.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/compute-standard-company-views.util.ts`
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view/compute-standard-opportunity-views.util.ts`

**Sunder files to touch**

- create `src/lib/crm/default-views.ts`
- add seed/bootstrap path for new clients
- update managed-agent view creation to respect seeded metadata shape

**Testing/docs to check**

- hook tests for default selection
- board/calendar parity tests
- `calendar-view.md`

**Drift**

- Necessary: object names and our specific vocabulary
- Not acceptable: letting each page hand-roll its own default state forever

### Task 7 — Move CRM navigation toward metadata + favorites

**Outcome**

Stop treating CRM navigation as a hardcoded sidebar list.

**Twenty files to copy/reference**

- `packages/twenty-server/src/engine/workspace-manager/standard-objects-prefill-data/prefill-workspace-favorites.ts`
- DeepWiki-identified navigation/favorites modules:
  - `useWorkspaceNavigationMenuItems.ts`
  - `FavoritesSection.tsx`
  - `WorkspaceSectionContainer.tsx`

**Sunder files to touch**

- refactor `src/components/layout/app-sidebar.tsx`
- add a navigation metadata source, likely:
  - `crm_navigation_items`
  - `crm_favorites`
  - or a lighter consolidated schema if we need to scope down
- optionally expose favorite views and favorite objects separately

**Testing/docs to check**

- sidebar interaction tests
- future E2E coverage

**Drift**

- Necessary: a lighter schema may be enough at first
- Not acceptable: freezing CRM nav as static code if we want Twenty-class ergonomics

### Task 8 — Upgrade CRM UX testing to Twenty’s standard

**Outcome**

Treat CRM UX as a product system that needs regression protection.

**Twenty files to copy/reference**

- `packages/twenty-e2e-testing/tests/create-record.spec.ts`
- `packages/twenty-e2e-testing/tests/create-kanban-view.spec.ts`
- `packages/twenty-front/src/modules/object-record/record-table/__stories__/RecordTable.stories.tsx`

**Sunder files to touch**

- create Playwright specs under `tests/e2e/crm/`
- add focused tests for:
  - create record
  - edit inline
  - save new view
  - update current view
  - switch table/board/calendar
  - open in drawer vs page
  - column visibility/order
- keep existing unit tests but demote them from being the primary safety net

**Testing/docs to check**

- all CRM reference docs in this folder

**Drift**

- Necessary: our actual test harness and auth setup
- Not acceptable: relying on page unit tests for a CRM UX rewrite

---

## 8. What We Can Copy Almost Exactly

These should be copied very closely, with only stack-level translation.

1. **Module boundaries**
   - `record-index`
   - `views`
   - `record-table`
   - `record-show`
   - seeded `default-views`
   - seeded `default-page-layouts`

2. **View concepts**
   - active view
   - dirty-state
   - update current view vs save new view
   - per-view columns
   - filter groups
   - group-by / board state
   - open-record preference

3. **Open-record behavior**
   - preserve parent view context
   - side panel on desktop when appropriate
   - full page when needed

4. **Seeded defaults**
   - standard table view
   - standard board view for deals
   - standard page tabs and widgets

5. **Testing philosophy**
   - interaction-first E2E coverage
   - stateful view coverage
   - component/story coverage for table behavior

---

## 9. What Must Be Translated, Not Literally Copied

These are implementation details, not product drift.

1. **Routing**
   - Twenty React Router routes become Next App Router segments.

2. **State**
   - Twenty Jotai atoms become local state, TanStack Query state, and focused client stores where necessary.

3. **Data fetching**
   - Twenty GraphQL/Apollo patterns become Supabase/TanStack Query hooks.

4. **Persistence**
   - Twenty TypeORM entities and migrations become Supabase migrations and generated types.

5. **Styling**
   - Twenty Linaria components become Tailwind + Flexoki semantic tokens.

The rule should be:

- **copy behavior**
- **translate plumbing**

---

## 10. Recommended Build Order

If this becomes an implementation program, the order should be:

1. Normalize saved view persistence.
2. Build `record-index` + `ViewBar`.
3. Replace `ListTable` with CRM `record-table`.
4. Add full record show pages + shared layouts.
5. Seed standard views and page layouts.
6. Move sidebar toward navigation metadata + favorites.
7. Add Playwright CRM UX coverage.

Reason:

- Twenty’s UX quality depends on the view model first.
- If we postpone the view model, every UI layer above it becomes temporary.

---

## 11. Related Sunder Reference Docs

This doc is the umbrella reference. Use it with the narrower Twenty-derived docs already in this folder:

- `crm-configurability-reference.md`
- `company-object-reference.md`
- `inline-cell-editing.md`
- `calendar-view.md`
- `files-tab-reference.md`
- `timeline-audit-log-reference.md`

Use this document to decide **system architecture and drift policy**.
Use the narrower docs to decide **implementation details for specific CRM surfaces**.

---

## 12. Final Position

If the goal is an Attio-level CRM UX, Sunder should converge on Twenty’s architecture, not just borrow isolated widgets.

The strongest recommendation is:

- copy Twenty’s CRM UX system shape closely
- keep drift limited to stack translation and deliberate scope cuts
- reject drift that weakens the product surface

The main gap today is not polish. It is that Sunder still lacks the same **system-level CRM shell**:

- unified record index
- real views model
- first-class show pages
- metadata-backed navigation
- serious UX regression coverage

That is the work required to move from "AI CRM with decent UI" to a credible traditional CRM UX standard.
