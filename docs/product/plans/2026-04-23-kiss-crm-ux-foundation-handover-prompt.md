# Handover: KISS CRM UX Foundation

## Your job

Implement the KISS CRM UX foundation end to end from the approved plan. This is a **product-surface upgrade on top of the existing CRM**, not a platform rewrite.

You are shipping four things:

1. richer saved views using a single `state` object
2. one shared CRM shell across People / Companies / Deals / Tasks
3. full record pages for People / Companies / Deals while keeping the drawer
4. SQL-friendly read views for agent and reporting reads

Do **not** rebuild the CRM.  
Do **not** build a metadata platform.  
Do **not** copy Twenty wholesale.

This work is explicitly KISS/YAGNI: preserve what is already good, strengthen only the weak parts, and keep the data/tooling model easy to operate.

## Source of truth

Read these first, in this order:

1. **Origin requirements doc:**  
   `docs/product/ideations/2026-04-23-kiss-crm-ux-foundation-requirements.md`

2. **Implementation plan:**  
   `docs/product/plans/2026-04-23-001-feat-kiss-crm-ux-foundation-plan.md`

3. **Twenty drift reference:**  
   `roadmap docs/Sunder - Source of Truth/references/twenty-crm/crm-ux-gold-standard-drift-analysis.md`

4. **Current saved views plan (old narrower version):**  
   `docs/product/plans/2026-04-05-001-feat-crm-saved-views-plan.md`

5. **Current CRM working-surface QA:**  
   `docs/qa/16-crm-working-surfaces.md`

6. **Current CRM tools QA:**  
   `docs/qa/03-crm-tools-via-chat.md`

The origin requirements doc and the new plan are the authority.  
The Twenty doc is a reference for UX quality, **not** for blindly copying backend/storage design.

## Big picture

Sunder already has the right base:

- relational CRM tables
- `crm_config`
- `search_crm`
- `run_sql`
- `get_crm_config`
- `configure_crm`
- `custom_fields` JSONB on records

Do not disturb that foundation.

The problem is that the CRM still behaves too much like separate pages with light shared widgets. Saved views are too weak, detail is too drawer-heavy, and the agent has to do repetitive joins for common reporting reads.

The goal is to get most of the UX gain of a stronger CRM **without** turning Sunder into a generalized metadata platform.

## Non-negotiable constraints

### Keep

Keep these as the foundation:

- relational CRM tables: `contacts`, `companies`, `deals`, `crm_tasks`
- relationship tables / notes / attachments
- `search_crm`
- `run_sql`
- `get_crm_config` / `configure_crm`
- `crm_config`
- `custom_fields` JSONB on records

### Do not do

Do **not** do these in this work:

- arbitrary custom object engine
- full Twenty-style metadata platform
- normalized `view_fields`, `view_filters`, `view_groups`, etc.
- dynamic sidebar/folder/favorites platform
- rewrite of the core CRM tables
- manual filter-builder UI
- migration of `search_crm` onto the SQL read views

### Core product rule

- **record data** -> relational tables
- **config** -> `crm_config`
- **view/layout UX state** -> compact JSONB metadata on `crm_views`
- **analytics / agent querying** -> SQL views

## Project-specific rules

Follow the repo instructions:

- Use **Context7** when you need library/framework documentation.
- Use **Supabase MCP** for migrations. Do not hand-wave migrations in shell if MCP is available.
- If you test anything in Managed Agents, use **`claude-haiku-4-5`** or latest Haiku only.
- Keep implementation boring and readable.
- Do not widen scope.

## Current implementation seams to inspect first

### CRM pages

- `app/(dashboard)/customers/people/page.tsx`
- `app/(dashboard)/customers/companies/page.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `app/(dashboard)/tasks/page.tsx`

### Saved views

- `src/hooks/use-crm-views.ts`
- `src/components/crm/view-picker.tsx`
- `src/lib/managed-agents/tools/crm/manage-views.ts`
- `src/lib/managed-agents/tools/crm/configure-crm.ts`
- `supabase/migrations/20260405000001_create_crm_views.sql`

### Drawer/detail

- `src/hooks/use-record-drawer.ts`
- `src/components/crm/record-drawer/record-drawer.tsx`
- `src/components/crm/record-drawer/contact-drawer-content.tsx`
- `src/components/crm/record-drawer/company-drawer-content.tsx`
- `src/components/crm/record-drawer/deal-drawer-content.tsx`

### Config and schemas

- `src/lib/crm/config.ts`
- `src/lib/crm/field-definitions.ts`
- `src/lib/crm/schemas.ts`

### Tooling / SQL

- `src/lib/managed-agents/tools/utility/run-sql.ts`
- `src/lib/managed-agents/tools/utility/get-agent-db-schema.ts`
- `supabase/migrations/20260305030001_create_sql_helper_functions.sql`

## Implementation order

Follow this order. Do not jump around.

### Phase 1 — Upgrade saved views to `state`

Implement the smallest richer saved-view model:

- keep one row per saved view
- add a `state JSONB`
- backfill existing `filters` / `sort` into `state`
- keep compatibility for old callers during rollout

The first-pass `state` should cover:

- `viewType`
- `filters`
- `sort`
- `columns`
- `columnOrder`
- `groupBy`
- `calendarField`
- `openMode`
- `isDefault`

Important:

- do **not** explode this into multiple metadata tables
- do **not** break current saved views during migration
- update `configure_crm` so config-change warnings inspect the new saved-view shape

### Phase 2 — Build one shared CRM shell

Create one shared shell for:

- page framing
- view switching
- filter/view presentation
- body switching between table / board / calendar
- record open behavior

Use the existing widgets where possible:

- `ListTable`
- `KanbanBoard`
- `CrmTasksCalendar`
- `ViewPicker`
- `ViewToggle`
- `FilterBar`

This phase should reduce duplication, not chase a full component rewrite.

### Phase 3 — Add full record pages

Add:

- `/customers/people/[contactId]`
- `/customers/companies/[companyId]`
- `/customers/deals/[dealId]`

Rule:

- quick peek = drawer
- serious work = full page

Do not duplicate drawer logic. Extract shared detail content and render it in both surfaces.

Tasks stay drawer-only in this pass.

### Phase 4 — Add SQL-friendly read views

Create read-only public views:

- `crm_contacts_index_v`
- `crm_companies_index_v`
- `crm_deals_index_v`
- `crm_tasks_index_v`

These are for:

- easier `run_sql`
- simpler reporting
- flatter agent read surfaces

They are **not** sources of truth.

They must respect RLS. Use `security_invoker` as required by Supabase guidance for public views.

Also update `get_client_accessible_schema()` so `get_agent_db_schema` can see the new read views.

### Phase 5 — QA and cleanup

Update:

- tests
- QA docs
- any saved-view fixtures
- compatibility notes if legacy `filters` / `sort` support is temporary

## Security-critical note for SQL read views

Supabase/Postgres public views can bypass RLS by default if created carelessly.

When creating the read views, use:

```sql
create view public.crm_deals_index_v
with (security_invoker = on)
as
select ...
```

Before shipping, verify:

- tenant-scoped reads from `run_sql` only return current-tenant rows
- the views appear in schema introspection

Do not skip this.

## What “good” looks like

### Saved views

Before:

- mostly saved filters + sort

After:

- a saved workspace
- mode, filters, sort, display setup, and open behavior come back together

### CRM pages

Before:

- four custom-ish pages with similar but drifting behavior

After:

- one shared CRM shell powering all four surfaces

### Record detail

Before:

- mostly drawer-only

After:

- drawer for quick inspection
- full page for deeper work

### Agent/reporting reads

Before:

- repetitive joins for common CRM analysis

After:

- clean read models for the most common queries

## Acceptance criteria

Do not call this done until all of these are true:

- `crm_views` stores a richer `state`
- old saved views survive migration
- `manage_views` works with the new model
- `configure_crm` still warns clearly when config changes affect saved views
- People / Companies / Deals / Tasks use one shared shell
- People / Companies / Deals have full record pages
- drawer still works
- SQL read views exist and are visible through introspection
- `run_sql` can use them
- QA docs are updated
- relevant hook/tool/page tests are updated

## Files likely to be created

- `src/lib/crm/view-state.ts`
- `src/components/crm/crm-workspace-shell.tsx`
- `src/components/crm/use-active-crm-view-state.ts`
- `src/components/crm/apply-view-columns.ts`
- `src/components/crm/use-record-open-behavior.ts`
- `src/components/crm/record-detail/contact-detail-content.tsx`
- `src/components/crm/record-detail/company-detail-content.tsx`
- `src/components/crm/record-detail/deal-detail-content.tsx`
- `app/(dashboard)/customers/people/[contactId]/page.tsx`
- `app/(dashboard)/customers/companies/[companyId]/page.tsx`
- `app/(dashboard)/customers/deals/[dealId]/page.tsx`
- Supabase migrations for:
  - upgrading `crm_views`
  - creating CRM SQL read views
  - extending `get_client_accessible_schema()`

## Files likely to be modified

- `src/lib/crm/schemas.ts`
- `src/hooks/use-crm-views.ts`
- `src/components/crm/view-picker.tsx`
- `src/lib/managed-agents/tools/crm/manage-views.ts`
- `src/lib/managed-agents/tools/crm/configure-crm.ts`
- `src/hooks/use-view-preference.ts`
- `src/hooks/use-record-drawer.ts`
- `src/components/crm/record-drawer/*`
- the four CRM page files
- `src/lib/managed-agents/tools/utility/get-agent-db-schema.ts` if formatting needs it
- `src/lib/managed-agents/tools/utility/run-sql.ts` only if descriptions/examples should mention the new read views
- `docs/qa/16-crm-working-surfaces.md`
- `docs/qa/03-crm-tools-via-chat.md`

## Gotchas

1. **Do not over-normalize saved views.**  
   One richer row with `state JSONB` is the point.

2. **Do not replace relational CRM data with metadata.**  
   The tool surface depends on queryable tables.

3. **Do not create duplicate drawer/page implementations.**  
   Shared detail content first.

4. **Do not make saved views and ad hoc state compete.**  
   Saved view should be authoritative when active.

5. **Do not forget schema introspection.**  
   SQL read views are much less useful if `get_agent_db_schema` never shows them.

6. **Do not silently break saved views on config changes.**  
   Warn and degrade safely.

## If you get stuck

- If you feel tempted to introduce multiple new metadata tables for views, stop. Re-read the origin doc.
- If you feel tempted to rewrite `search_crm`, stop. That is out of scope.
- If you feel tempted to build a dynamic nav/favorites platform, stop. Out of scope.
- If `security_invoker` or public-view security is unclear, check Supabase docs first and verify before exposing anything.

## Final rule

This work should make the CRM feel much better **without making the system harder to understand**.

If a change improves UX but makes the data/tooling model significantly more complex, it is probably the wrong change for this pass.
