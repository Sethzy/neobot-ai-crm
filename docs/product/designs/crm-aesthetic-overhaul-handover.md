# CRM Aesthetic Overhaul — Implementation Handover

## What this is

A pure UI/layout overhaul of Sunder's CRM pages to match the Open Mercato CRM aesthetic. No data model changes, no agent tool changes, no new API routes. Just visual upgrades.

## Key files — READ ALL OF THESE FIRST

1. **Design doc:** `docs/product/designs/crm-aesthetic-overhaul.md` — goals, phasing, layout specs, styling spec
2. **Confirmed decisions (ALL 8 DECISIONS ARE FULLY SPECIFIED):** `docs/product/designs/crm-aesthetic-overhaul-decisions.md` — 1860 lines, 8 approved decisions (D1-D8), each with ASCII layouts, file-by-file mappings, drift analysis, and implementation order. **Read the entire file — not just the first few hundred lines.**
3. **Open Mercato reference (local clone):** `/Users/sethlim/Documents/open-mercato/` — the UI we're cloning. Key paths:
   - UI package: `packages/ui/src/backend/` (DataTable, FilterBar, RowActions, DetailFieldsSection, DetailTabsLayout)
   - CRM module: `packages/core/src/modules/customers/` (people/companies/deals pages + detail components)

## Decision summary (all 8 are fully specified in the decisions doc)

| # | Decision | Line | Scope |
|---|----------|------|-------|
| 1 | Sidebar Restructure | L10 | Add CUSTOMERS section, rename routes `/crm/*` → `/customers/*` |
| 2 | People List Page | L75 | Shared `DataTable`, `FilterBar`, `FilterOverlay`, `RowActions` + People list page |
| 3 | Person Detail Page | L408 | Shared `DetailTabsLayout`, `DetailFieldsSection`, `PersonHighlights`, tab sections + Person detail page |
| 4 | Companies List Page | L776 | Companies list page using shared components from D2 |
| 5 | Company Detail Page | L1009 | `CompanyHighlights`, `LinkedContactsSection` + Company detail page |
| 6 | Deals List Page + Pipeline | L1259 | Deals list (DataTable only, no dual view) + separate `/customers/deals/pipeline` kanban route |
| 7 | Deal Detail Page | L1466 | `DealHighlights` + Deal detail page (single-column, NOT OM's 2-column layout) |
| 8 | Dashboard Landing | L1713 | StatCards, RecentActivity, PipelineOverview at `/customers` |

## Implementation order

**Sequential first (shared foundations):**
1. **Decision 1** — Sidebar restructure
2. **Decision 2** — People list page (creates shared DataTable/FilterBar/FilterOverlay/RowActions)
3. **Decision 3** — Person detail page (creates shared DetailTabsLayout/DetailFieldsSection/ActivitiesSection/etc.)

**Parallelizable after D1-D3:**
- **D4** (Companies list) + **D6** (Deals list + Pipeline route) + **D8** (Dashboard) — can run in parallel
- Then **D5** (Company detail) → **D7** (Deal detail) sequentially (D7 reuses `LinkedContactsSection` from D5)

## How to build each decision

Each decision in the decisions doc contains:
- **ASCII layout** — the target UI
- **Open Mercato reference patterns** — exact source files and code patterns to clone
- **File-by-file mapping** — what new files to create, what existing files to modify/reuse
- **Drift analysis** — where and why we deviate from Open Mercato (and what has zero drift)
- **Implementation order** — step-by-step build sequence within each decision

**Workflow per decision:**
1. Read the decision thoroughly in the decisions doc
2. Read the referenced Open Mercato source files in the local clone
3. Build components in the order specified
4. Copy Open Mercato patterns as closely as possible — only drift where the decision explicitly says to
5. Verify visually in the browser
6. Light smoke tests after (renders without crashing, key elements present)
7. Commit before moving to the next decision

## Critical rules

- **Copy Open Mercato code closely** — minimal drift from reference. Default is zero drift. Only deviate where the decisions doc explicitly justifies it with a numbered drift entry.
- **No data model changes** — all queries use existing Supabase tables and existing TanStack Query hooks. No new migrations, no schema changes.
- **No agent changes** — tools, runner, system prompt all untouched.
- **Use Sunder's existing primitives** — `InlineEditField` (replaces OM's `InlineTextEditor`/`InlineSelectEditor`), ShadCN components, existing TanStack Query hooks.
- **Styling uses ShadCN tokens** — `bg-card`, `text-foreground`, `border-border`, `rounded-xl`, `shadow-sm`, etc. Same tokens as Open Mercato since both use ShadCN conventions. The visual aesthetic should be a mirror copy of Open Mercato's CRM UI.
- **Drawers stay in codebase** — deprecated but not deleted. Row clicks navigate to full pages instead.
- **Old routes get redirects** — `/crm/*` redirects to `/customers/*`.

## Sunder conventions

- TypeScript, functional components, no classes, no enums
- TanStack Query for data fetching (not useEffect)
- Tailwind 4 + ShadCN UI
- JSDoc comments on all files/modules
- Commit after each decision with descriptive message
