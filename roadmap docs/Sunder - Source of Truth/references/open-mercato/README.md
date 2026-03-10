# Open Mercato — UI Reference

**Repo:** [open-mercato/open-mercato](https://github.com/open-mercato/open-mercato)
**Local clone:** `/Users/sethlim/Documents/open-mercato/`
**DeepWiki:** https://deepwiki.com/open-mercato/open-mercato
**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + MikroORM + PostgreSQL

## Why This Reference Exists

Open Mercato is an open-source modular CRM/ERP platform. We reference it for UI patterns — specifically its CRM pages (people, companies, deals/pipeline), DataTable, CrudForm, and detail views.

## Key Paths in Local Clone

| Area | Path |
|------|------|
| UI package | `packages/ui/src/` |
| Backend components | `packages/ui/src/backend/` (AppShell, CrudForm, DataTable, FilterBar) |
| Primitives | `packages/ui/src/primitives/` |
| CRM module UI | `packages/core/src/modules/customers/backend/customers/` |
| CRM components | `packages/core/src/modules/customers/components/` |
| Deal form | `packages/core/src/modules/customers/components/detail/DealForm.tsx` |
| People list | `packages/core/src/modules/customers/backend/customers/people/page.tsx` |
| Person detail | `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx` |
| Deals pipeline | `packages/core/src/modules/customers/backend/customers/deals/page.tsx` |

## Notable UI Patterns

- **CrudForm:** Generic form builder with Zod validation, custom fields, grouped layouts, version history, injection spots
- **DataTable:** TanStack Table wrapper with sorting, pagination, filtering, perspectives (saved views), export, auto-truncation
- **FilterBar + FilterOverlay:** Composable filter system with search + chips + overlay panel
- **Detail tabs:** Tabbed detail view with highlights header, notes, activities, addresses, deals sections
- **Deal pipeline:** Kanban board grouped by pipeline stage with drag-and-drop
