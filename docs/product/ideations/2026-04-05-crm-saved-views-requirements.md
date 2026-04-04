---
date: 2026-04-05
topic: crm-saved-views
---

# CRM Saved Views

## Problem Frame

Sunder's CRM list pages (deals, tasks, contacts, companies) show all records with no way to filter. Users who want to see "just my overdue tasks" or "deals closing this month" have to ask the agent in chat every time. Saved views — named filter+sort presets applied directly on CRM pages — are table-stakes CRM functionality. They give users instant one-click access to the slices of data they care about most.

This reverses a deliberate scope exclusion from PR 42a and PR 46 (both noted "no saved_views table"). The rationale for cutting it then was scope control; the rationale for adding it now is that the CRM pages feel static without it.

## Requirements

- R1. **Agent tool for view management.** The agent gets a tool to create, update, and delete saved views. A saved view is a named filter+sort configuration scoped to one CRM entity type (contacts, companies, deals, tasks). Users ask the agent to create views in natural language ("set up a view for my overdue tasks"). No manual filter-builder UI.
- R2. **Pill tab view picker on CRM list pages.** Each CRM list page displays a horizontal row of pill tabs above the table: "All" (default, always first, not deletable) followed by saved views. Clicking a pill applies that view's filters and sort to the table. One view active at a time.
- R3. **Server-side filtering.** Selecting a saved view re-queries Supabase with the view's filter and sort configuration. No client-side TanStack Table filtering. This keeps behavior consistent with the existing data-fetching pattern and scales to large datasets.
- R4. **Seeded default views.** New accounts ship with sensible defaults per entity type. Defaults are deletable. Suggested seeds:
  - Deals: "Active pipeline" (exclude closed/lost), "Closing this month"
  - Tasks: "Overdue", "Due this week", "Done"
  - Contacts: "Buyers", "Sellers"
  - Companies: (none — just "All")
- R5. **Filter semantics match search_crm.** Saved view filters use the same key-value filter shape that `search_crm` already supports: equality matches on fields like `stage`, `status`, `type`, `company_id`, plus date-range filters like `due_before`/`due_after`. No new filter capabilities needed — reuse what exists.
- R6. **Active view persists across navigation.** If a user selects "Overdue" on the tasks page, navigates away, and comes back, the same view should still be selected. URL search param is the natural mechanism.
- R7. **Mobile-friendly.** Pill tabs scroll horizontally on narrow viewports. No layout breakage.

## Success Criteria

- User asks agent "create a view for my active deals" — view appears as a pill on the deals page within seconds
- Clicking a saved view pill filters the table server-side without a full page reload
- Default views are useful out of the box for a real estate agent (primary persona)
- Agent can list, update, and delete views it previously created

## Scope Boundaries

- **No manual filter-builder UI.** Users don't build views themselves — they ask the agent. This is the core Sunder model.
- **No column customization.** Views control filters and sort only. Column visibility/ordering is a separate concern.
- **No view sharing or permissions.** Views are per-client. Solo practitioners only.
- **No drag-to-reorder views.** Display order is fixed (defaults first, then by creation date).
- **No nested/complex filter logic.** Equality + date ranges only (matching search_crm). No OR groups, no "contains", no compound expressions.

## Key Decisions

- **Agent-only creation**: Fits the Sunder model where the agent does the work. Avoids building a filter-builder UI. The agent already understands the CRM schema via its tools.
- **Server-side filtering over client-side**: The CRM tables currently fetch all records. Applying view filters at the Supabase query level is more scalable and avoids adding TanStack Table filtering infrastructure.
- **Seed defaults**: Immediate value without requiring the user to set anything up. Deletable so they're not imposed.
- **Pill tabs over dropdown**: More discoverable, one-click switching, standard pattern (Attio, Linear). Scales fine for the expected 5-8 views per entity.

## Dependencies / Assumptions

- CRM list pages currently fetch all records via hooks (`useCrmTasks`, etc.). These hooks will need to accept filter/sort params from the active view.
- The `search_crm` tool's filter semantics define the filter vocabulary. If search_crm can't filter by a field, saved views can't either.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] How should the existing data-fetching hooks (e.g., `useCrmTasks`, `useDeals`) be extended to accept view filter params? Direct Supabase query params vs. reusing search_crm's query builder.
- [Affects R4][Technical] Should seed defaults be hardcoded rows inserted via migration, or created programmatically on first account setup? Migration is simpler but less flexible for per-vertical customization.
- [Affects R5][Needs research] Does the current `search_crm` filter set cover the seeded defaults? Specifically: "Closing this month" needs a date-range filter on deals (due_date or close_date), and "Overdue" tasks need `due_before: today`. Verify these filters exist or add them.
- [Affects R6][Technical] URL param shape for active view — `?view=<view_id>` vs `?view=<view_name>`. ID is stable but opaque; name is readable but fragile on rename.

## Next Steps

→ `/plan` for structured implementation planning
