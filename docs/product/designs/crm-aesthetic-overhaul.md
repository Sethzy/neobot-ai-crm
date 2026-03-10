# CRM Aesthetic Overhaul — Design Doc

**Status:** Draft
**Date:** 2026-03-10
**Scope:** Pure visual/layout changes. No new data models, API routes, or agent tool changes.
**Reference:** Open Mercato CRM UI (`/Users/sethlim/Documents/open-mercato/`)

---

## Goals

1. Replace cramped 420px drawer detail views with full-page layouts
2. Upgrade list page polish (tables, filters, empty states)
3. Add a proper CRM dashboard landing with summary widgets
4. Keep all existing functionality — no regressions, no new features

## Non-goals

- No new database tables or migrations
- No changes to agent tools, runner, or system prompt
- No custom fields engine refactor (rendering improvements only)
- No i18n, injection system, or module registry
- No new CRUD operations or API routes

---

## Phasing

| Phase | Scope | Files touched |
|-------|-------|---------------|
| **1** | Detail pages (contact, deal, company, task) | New route pages, new detail components, deprecate drawers |
| **2** | List pages (tables, filters, controls bar) | Existing page files, table components |
| **3** | Dashboard landing | New dashboard page, new widget components |

---

## Phase 1: Full-Page Detail Views

### What changes

**Before:** Click a row → 420px right-side `Sheet` opens over the list. All fields stacked vertically. No tabs. Limited space for notes, activities, deals.

**After:** Click a row → navigate to `/crm/contacts/[id]`. Full-page layout with:

1. **Header bar** — Back link + action buttons (History, Delete)
2. **Highlights section** — Name (editable), company card, 4-col grid (email, phone, status, type/next interaction)
3. **Tabs section** — Notes | Activities | Deals | Tasks (each with contextual "+ Add" button)
4. **Details section** — 2-3 column grid of all fields with inline editing
5. **Tags section** — Tag chips with add/remove

### Layout spec

```
┌──────────────────────────────────────────────────────┐
│  ← Back to Contacts              [History] [Delete]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Sarah Chen  ✏                                       │
│                                                      │
│  ┌─────────────────────────────────────────┐         │
│  │ 🏢 Company                              │         │
│  │ PropNex Realty Pte Ltd →                 │         │
│  └─────────────────────────────────────────┘         │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Email    │ │ Phone    │ │ Status   │ │ Type    │ │
│  │ sarah@.. │ │ +65 91.. │ │ ● Active │ │ Buyer   │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                      │
│  Notes ─ Activities ─ Deals ─ Tasks     [+ Add Note] │
│  ─────────────────────────────────────────────────── │
│  │ Note content area...                             │ │
│  │ Chronological notes list                         │ │
│  │                                                  │ │
│                                                      │
│  Details                                             │
│  ┌──────────────┬──────────────┬──────────────┐      │
│  │ Display Name │ First Name   │ Last Name    │      │
│  │ Sarah Chen   │ Sarah        │ Chen         │      │
│  ├──────────────┼──────────────┼──────────────┤      │
│  │ Lifecycle    │ Source       │ Department   │      │
│  │ Opportunity  │ Referral     │ —            │      │
│  ├──────────────┴──────────────┴──────────────┤      │
│  │ Notes (full width)                         │      │
│  │ Relocating from Toa Payoh...               │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  Custom Fields (if any)                              │
│  ┌──────────────┬──────────────┐                     │
│  │ Budget       │ Pre-approval │                     │
│  │ $1,850,000   │ DBS $1.6M    │                     │
│  └──────────────┴──────────────┘                     │
│                                                      │
│  Tags                                                │
│  [Buyer] [High Value] [Bishan Area] [+ Add tag]     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### New routes

| Route | Page |
|-------|------|
| `/crm/contacts/[contactId]` | Contact detail (currently redirects to `?detail=`) |
| `/crm/deals/[dealId]` | Deal detail |
| `/crm/companies/[companyId]` | Company detail |
| `/crm/tasks/[taskId]` | Task detail (from `/tasks` section) |

The existing redirect pages at these paths already exist — they just need to become real pages instead of redirecting to query params.

### New components

| Component | Location | Purpose |
|-----------|----------|---------|
| `RecordHighlights` | `src/components/crm/detail/record-highlights.tsx` | Shared highlights header (name, company, 4-col grid). Props vary per entity type. |
| `DetailTabsLayout` | `src/components/crm/detail/detail-tabs-layout.tsx` | Tab bar with active state + contextual action button. Cloned from Open Mercato pattern. |
| `DetailFieldsGrid` | `src/components/crm/detail/detail-fields-grid.tsx` | 2-3 col grid of inline-editable fields. Wraps existing `InlineEditField`. |
| `NotesSection` | `src/components/crm/detail/notes-section.tsx` | Contact notes/comments list with add form. |
| `ActivitiesSection` | `src/components/crm/detail/activities-section.tsx` | Activity timeline (wraps existing `ContactTimeline`/`InteractionTimeline`). |
| `LinkedDealsSection` | `src/components/crm/detail/linked-deals-section.tsx` | Deals list for contact/company detail. |
| `LinkedTasksSection` | `src/components/crm/detail/linked-tasks-section.tsx` | Tasks list for contact/deal detail. |
| `TagsSection` | `src/components/crm/detail/tags-section.tsx` | Tag chips with add/remove. |
| `ContactDetailPage` | `app/(dashboard)/crm/contacts/[contactId]/page.tsx` | Full page composing the above. |
| `DealDetailPage` | `app/(dashboard)/crm/deals/[dealId]/page.tsx` | Same for deals. |
| `CompanyDetailPage` | `app/(dashboard)/crm/companies/[companyId]/page.tsx` | Same for companies. |

### Existing components reused (not rewritten)

- `InlineEditField` — already supports text, textarea, select, date, number
- `CustomFieldEditors` — already renders custom fields from config
- `ContactTimeline` / `InteractionTimeline` — already exist, just need wider layout
- `StageBadge`, `TaskStatusBadge` — no changes
- All TanStack Query hooks for data fetching — no changes

### What happens to drawers

Keep them working but deprioritize. Row click navigates to the full page. The drawer components stay in the codebase (no deletion) but are no longer the primary interaction path. We can remove them in a later cleanup pass.

### Styling spec

All new components follow existing Sunder patterns:

- **Backgrounds:** `bg-card` for cards, `bg-muted/30` for subtle panels (company card, highlight cells)
- **Borders:** `border border-border/40` (existing table/card pattern)
- **Rounded corners:** `rounded-xl` for cards, `rounded-lg` for highlight cells
- **Shadows:** `shadow-sm` on cards (existing pattern)
- **Hover:** `hover:bg-muted/50` on interactive cards (company card, deal cards)
- **Inline edit icon:** `opacity-0 group-hover:opacity-100 transition-opacity` (existing `InlineEditField` pattern)
- **Tab bar:** Underline style matching existing CRM layout tabs — `border-b-2 border-foreground text-foreground` active, `border-transparent text-muted-foreground` inactive
- **Section headers:** `text-sm font-semibold` (existing drawer section pattern)
- **Page container:** `overflow-auto px-4 py-6 md:px-12 md:py-10` (existing page pattern)
- **Max content width:** `max-w-5xl mx-auto` for the detail content (prevents ultra-wide readability issues)

### Tab content per entity

**Contact tabs:**
| Tab | Content | Data source |
|-----|---------|-------------|
| Notes | Chronological notes list | `interactions` table filtered by contact |
| Activities | Timeline with icons per type | `interactions` table, existing `ContactTimeline` |
| Deals | Linked deal cards (address, stage, price) | `deal_contacts` join |
| Tasks | Task list with status + due date | `crm_tasks` linked to contact |

**Deal tabs:**
| Tab | Content | Data source |
|-----|---------|-------------|
| Notes | Deal-specific notes | `interactions` filtered by deal |
| Activities | Timeline | `interactions` table, existing `InteractionTimeline` |
| Contacts | Linked contact cards (name, type, role) | `deal_contacts` join |
| Tasks | Linked tasks | `crm_tasks` linked to deal |

**Company tabs:**
| Tab | Content | Data source |
|-----|---------|-------------|
| Contacts | Contact cards linked to company | `contacts` where `company_id` matches |
| Deals | Deal cards linked to company | `deals` where `company_id` matches |

### Highlight fields per entity

**Contact highlights (4-col grid):**
`Email` | `Phone` | `Status` | `Type`

**Deal highlights (4-col grid):**
`Stage` | `Price` | `Company` | `Expected Close`

**Company highlights (4-col grid):**
`Industry` | `Phone` | `Website` | `Contact count`

### Responsive behavior

- **Desktop (>= 1024px):** Full layout as shown. Highlights grid is 4 columns. Detail fields 3 columns.
- **Tablet (768-1023px):** Highlights grid is 2 columns. Detail fields 2 columns.
- **Mobile (< 768px):** Highlights grid stacks to 1 column. Detail fields 1 column. Tabs scroll horizontally.

### Navigation flow

```
/crm/contacts (list) → click row → /crm/contacts/[id] (full page)
                                     ← "Back to Contacts" link returns to list
                                     → click linked deal → /crm/deals/[dealId]
                                     → click company card → /crm/companies/[companyId]
```

---

## Phase 2: List Page Polish

### What changes

Upgrade the existing list pages (contacts, deals, companies, tasks) with better visual polish. No new functionality — same data, same filters, same sorting.

### Changes

1. **Table chrome upgrade**
   - Add subtle row hover highlight with left border accent: `hover:border-l-2 hover:border-l-foreground/20`
   - Improve header styling: slightly bolder separator, sticky header on scroll
   - Add row action menu (three-dot icon) with: View, Open in New Tab, Delete

2. **Controls bar upgrade**
   - Unified height for all controls (h-9 instead of mixed h-12/h-8)
   - Pill-style filter chips below the controls bar showing active filters
   - "Clear all" link when filters are active

3. **Empty states**
   - Replace plain text with illustrated empty state (icon + title + description + CTA button)
   - Different message when filtered ("No results match your filters") vs truly empty ("No contacts yet")

4. **Loading states**
   - Replace `animate-pulse` blocks with skeleton table rows that match column widths
   - Add subtle shimmer effect

5. **Kanban polish** (deals + tasks)
   - Column header counts as small badge
   - Card hover elevation: `hover:shadow-md hover:-translate-y-px transition-all`
   - Stage summary row at bottom of each column (total value for deals)

### Files modified

| File | Change |
|------|--------|
| `src/components/crm/contacts-table.tsx` | Row actions, hover style, sticky header |
| `src/components/crm/deals-table.tsx` | Same |
| `src/components/crm/companies-table.tsx` | Same |
| `src/components/crm/crm-tasks-table.tsx` | Same |
| `src/components/crm/kanban-board.tsx` | Card hover, column summary |
| `src/components/crm/deal-kanban-card.tsx` | Hover elevation |
| `src/components/crm/task-kanban-card.tsx` | Hover elevation |
| `app/(dashboard)/crm/contacts/page.tsx` | Controls bar, empty state, filter chips |
| `app/(dashboard)/crm/deals/page.tsx` | Same |
| `app/(dashboard)/crm/companies/page.tsx` | Same |
| `app/(dashboard)/tasks/page.tsx` | Same |

### New shared components

| Component | Purpose |
|-----------|---------|
| `RowActionsMenu` | Three-dot dropdown with view/delete actions |
| `FilterChips` | Active filter pills with remove button |
| `EmptyState` | Icon + title + description + optional CTA |

---

## Phase 3: Dashboard Landing

### What changes

Replace the current CRM hub (which just redirects to `/crm/contacts`) with a proper dashboard at `/crm` showing at-a-glance summaries.

### Layout spec

```
┌─────────────────────────────────────────────────────┐
│  CRM Dashboard                                      │
│                                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────┐ │
│  │ Contacts  │ │ Deals     │ │ Tasks     │ │ Due │ │
│  │    47     │ │    12     │ │    8 open │ │  3  │ │
│  │ +3 this wk│ │ $2.1M val│ │ 2 overdue │ │today│ │
│  └───────────┘ └───────────┘ └───────────┘ └─────┘ │
│                                                     │
│  ┌─────────────────────┐ ┌────────────────────────┐ │
│  │ Recent Activity     │ │ Upcoming Interactions  │ │
│  │                     │ │                        │ │
│  │ • Call with Sarah   │ │ Mar 12 — Sarah Chen    │ │
│  │   Today 10:30 AM    │ │   Follow-up call       │ │
│  │                     │ │                        │ │
│  │ • Email to James    │ │ Mar 14 — James Tan     │ │
│  │   Yesterday 3 PM    │ │   Property viewing     │ │
│  │                     │ │                        │ │
│  │ • Viewing logged    │ │ Mar 15 — Wei Lin       │ │
│  │   Mar 8             │ │   Contract discussion  │ │
│  │                     │ │                        │ │
│  │ [View all →]        │ │ [View all →]           │ │
│  └─────────────────────┘ └────────────────────────┘ │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Pipeline Overview                            │   │
│  │                                              │   │
│  │  Leads    Negotiation   Offer   Closing      │   │
│  │  ████░░   ██████░░░░   ████░   ██░░░░░      │   │
│  │  4 deals  3 deals      2 deals  1 deal      │   │
│  │  $890K    $1.2M        $650K    $380K        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### New components

| Component | Purpose |
|-----------|---------|
| `StatCard` | Summary metric card (count + delta + label) |
| `RecentActivityWidget` | Last 5-10 interactions across all contacts |
| `UpcomingWidget` | Next interactions sorted by date |
| `PipelineOverview` | Horizontal bar chart of deals by stage |
| `CrmDashboardPage` | Composes all widgets |

### Data source

All widget data comes from existing Supabase queries — no new API routes needed. Use TanStack Query to fetch counts and recent records.

### Files

| File | Change |
|------|--------|
| `app/(dashboard)/crm/page.tsx` | Replace redirect with dashboard page |
| `src/components/crm/dashboard/` | New directory for widget components |

---

## Implementation notes

### What we keep unchanged
- All Supabase queries, RLS, and data fetching hooks
- Agent tools (`configure_crm`, `describe_crm_schema`, all CRUD tools)
- System prompt and context assembly
- Custom field storage (JSONB in `crm_config` + record `custom_fields`)
- CRM schemas and Zod validators
- Auth, middleware, and routing guards

### Testing approach
- Existing drawer tests stay (components not deleted)
- New detail page tests follow existing test patterns (Vitest + RTL)
- Visual verification via browser for styling changes

### Risk
- **Low risk:** All changes are additive (new pages) or cosmetic (CSS tweaks to existing components)
- **No data model changes:** Nothing can break the agent or backend
- **Drawer fallback:** If anything goes wrong, drawers still work

---

## Open questions

1. **Row click behavior on lists:** Navigate to full page immediately, or show a brief hover preview first?
2. **Mobile detail pages:** Full page on mobile too, or keep bottom sheet drawer for mobile?
3. **Notes tab:** Read-only (agent-generated) or add manual note creation form?
4. **Phase 1 scope:** All 4 entity types at once, or contacts first then iterate?
