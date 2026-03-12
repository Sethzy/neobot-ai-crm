# CRM Views and Direct Editing: Dench-Informed Design Doc

**Date:** 2026-03-11  
**Status:** Proposed  
**Scope:** CRM UI polish and interactivity for:

1. More ways to view CRM data
2. Direct editing at the point of work

This doc is based on:

- Live verification of Sunder's current UI on March 11, 2026
- Sunder source review of the current CRM pages and editing surfaces
- DenchClaw local source review
- DenchClaw DeepWiki summary of object views and inline editing behavior

This doc does **not** cover report cards or dashboards. That work is intentionally excluded here.

---

## 1. Why This Doc Exists

Sunder already has meaningful CRM functionality, but the experience is uneven.

Some pages feel like polished working surfaces. Others still feel like browse-only tables that push the user into a detail page for small corrections.

Dench is useful here not because we should copy its whole product model, but because it gets two user-facing patterns right:

- the same data can be seen in the right shape for the job
- small edits can happen where the user notices the problem

The opportunity for Sunder is to adopt those patterns in a focused way that matches Sunder's CRM product, current codebase, and v2 scope.

---

## 2. Source of Truth and Guardrails

This design doc follows the repo authority chain:

1. `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
2. `roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md`
3. `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`

Important guardrails for this doc:

- Keep the work tightly focused on CRM page UX.
- Do not quietly expand scope into a generic workspace builder.
- Do not add a full saved-view system just because Dench has one.
- Do not add report pinning, dashboard surfaces, or live report viewers here.
- Preserve the existing detail pages. They already do useful work.

---

## 3. Verified Current State in Sunder

This section reflects what is true in the current shipped product, not assumptions.

### Pages verified live

- `/customers`
- `/customers/people`
- `/customers/people/[contactId]`
- `/customers/companies`
- `/customers/companies/[companyId]`
- `/customers/deals`
- `/customers/deals/pipeline`
- `/customers/deals/[dealId]`
- `/tasks`
- task drawer on `/tasks`

### What is true today

| Surface | What exists today | What is still missing |
| --- | --- | --- |
| Customers home | Summary cards, recent activity, pipeline overview | Not a working multi-view workspace |
| People list | Table with search, filters, perspectives, export | No second view, no direct edit in the list |
| Person detail | Direct editing for name, company, email, phone, type, notes | Editing only after opening the record |
| Companies list | Table with search, filters, perspectives, export | No second view, no direct edit in the list |
| Company detail | Direct editing for name, industry, phone, email, website, address, notes | Editing only after opening the record |
| Deals list | Table with search, filters, perspectives, export, pipeline action | No direct edit in the list |
| Deals pipeline | Board view by stage, search, sort | Board is read-only even though page copy promises drag-and-drop |
| Deal detail | Direct editing for address, stage, price, notes | Editing only after opening the record |
| Tasks page | Table and board toggle | No calendar view |
| Task drawer | Direct editing for title, status, due date, description | Editing only after opening the drawer |

### Product reading of the current state

Sunder is already partway toward the desired experience.

```text
TODAY

Customers home = summary
People = table
Companies = table
Deals = table + separate pipeline page
Tasks = table + board

Direct editing exists,
but mostly inside detail pages or drawers
```

This matters because the right design direction is not:

- "add views from zero"
- "add direct editing from zero"

The right direction is:

- make the existing view model feel coherent
- move editing closer to where the user is already working

---

## 4. What Dench Gets Right

This section stays strictly user-facing.

### 4.1 One workspace header, multiple natural views

Dench presents different views of the same records as one coherent workspace.

The user sees:

- one search and filter area
- one view switcher
- one place identity
- the content below changing shape without feeling like a different product area

Supported Dench view types are broader than what Sunder needs today:

- Table
- Board
- Calendar
- Timeline
- Gallery
- List

The important lesson is not "ship six view types."

The important lesson is:

**the user should feel like they are changing the lens, not leaving the page.**

### 4.2 Compact segmented view switching

Dench uses a compact segmented switcher with icons and labels. It is small, readable, and clearly says:

```text
[Table] [Board] [Calendar] [Timeline] ...
```

Compared with that, Sunder's current view toggle is functional but less legible:

- icon-only
- used on tasks, not consistently across CRM workspaces
- visually more like a control fragment than a workspace mode switch

### 4.3 Optional view settings when a view needs them

Dench pairs the switcher with a small settings control when a view needs extra setup.

Examples:

- board grouping field
- calendar date field
- timeline start/end field

The lesson for Sunder is not to build a full generic settings engine now.

The lesson is:

**only add view-specific controls where they are truly needed, and keep them next to the switcher.**

### 4.4 Inline editing in list surfaces

Dench lets users edit records directly in tables.

User-facing behavior includes:

- interact with a cell directly
- edit without leaving the list
- lightweight save behavior
- quick exit if the user changes their mind

The exact Dench gesture is double-click to edit. That is useful inspiration, but Sunder does not need to copy it exactly.

The real lesson is:

**the list is not just for reading. It is a working surface.**

### 4.5 Alternate views are working surfaces, not just visual skins

In Dench, alternate views can be interactive. Calendar and timeline are not just passive displays.

That matters for Sunder because the clearest current gap is the deals pipeline:

- Sunder tells the user they can drag deals between stages
- the current board does not actually allow that

This is the kind of polish gap users notice immediately.

---

## 5. What Sunder Should Borrow, and What It Should Not

### Borrow from Dench

- A clearer segmented view switcher
- One shared workspace header per object area
- Views that feel like different lenses on the same data
- Quick editing at the list or board level for a small set of high-value fields
- Working surfaces instead of browse-only surfaces

### Do not borrow right now

- The full six-view generic workspace model
- Gallery and timeline for CRM just to match Dench
- A heavy saved-view management system
- Per-view configuration complexity for every object
- Report viewer, pinning, dashboard cards in this workstream

### Product principle

Borrow the interaction pattern. Do not copy the platform.

---

## 6. Design Principles for Sunder

### 6.1 Same workspace, different lens

If the user is looking at deals, they should stay in the deals workspace when changing from list to board.

### 6.2 Edit where you notice the issue

If the user spots a wrong phone number, stale stage, or wrong due date while scanning, they should be able to fix it there.

### 6.3 Keep detail pages for heavier work

The detail page is still the right place for:

- long notes
- related-record review
- custom-field cleanup
- multi-field editing

### 6.4 Table-first where table-first is still correct

People and companies do not need extra views today just because Dench has them.

### 6.5 The UI should feel more premium, not more complex

Every improvement here should reduce friction and increase clarity.

---

## 7. Proposed Experience

## 7.1 Shared CRM Workspace Pattern

This pattern should become the default for CRM surfaces that have more than one meaningful view.

### Header model

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Deals                                                        [Table]│
│ Track the pipeline and update deal progress in place.        [Board]│
│                                                                [...]│
├──────────────────────────────────────────────────────────────────────┤
│ [Search........................................] [Filters] [Sort]   │
│                                                                      │
│ Content switches below without feeling like a route jump             │
└──────────────────────────────────────────────────────────────────────┘
```

### Rules

- Search and filters stay in the same place when the view changes.
- The page title and page identity do not change when the view changes.
- View switching is fast and local.
- On desktop, show icon + label in the switcher.
- On smaller screens, collapse to icon-first pills or a compact segmented control.

### Suggested visual upgrade from current Sunder

Current Sunder view toggles are icon-only and minimal. The new pattern should feel closer to Dench:

- clearer active state
- visible labels on desktop
- tighter grouping with the surrounding toolbar
- slightly stronger visual weight so the control reads as a mode switch, not a misc button cluster

### View settings rule

Do not ship a generic settings popover everywhere.

Only add view-specific controls when they clearly help:

- Tasks calendar: month/week switch and date navigation
- Deals board: sort and maybe stage summaries

People and companies should not get a settings affordance because they are staying table-first.

---

## 7.2 Deals: From Split Surfaces to One Workspace

### Current experience

```text
TODAY

Deals list
  -> table page

Pipeline
  -> separate page

Result:
  same data, different places, weaker sense of continuity
```

### Proposed experience

Make deals one workspace with two views:

- Table
- Board

The existing `/customers/deals/pipeline` route can remain for backward compatibility, but the primary product experience should be:

```text
AFTER

Deals
  [Table] [Board]

Same search
Same filters
Same page identity
Same feeling of place
```

### What changes for the user

- The board stops feeling like a separate tool.
- The user can switch between detail scanning and pipeline scanning instantly.
- The board becomes truly interactive.

### Board behavior after improvement

```text
┌────────────┬────────────┬────────────┬────────────┐
│ Lead       │ Viewing    │ Offer      │ Closing    │
│ 6 deals    │ 4 deals    │ 2 deals    │ 3 deals    │
├────────────┼────────────┼────────────┼────────────┤
│ Bishan 22  │ Clementi 3 │ Marine Pde │ Orchard Rd │
│ $1.2M      │ $850k      │ $2.1M      │ $1.8M      │
│ Sarah Tan  │ John Lim   │ Amy Lee    │ Wei Han    │
└────────────┴────────────┴────────────┴────────────┘
```

### Board interaction model

- Drag a deal card to another stage to update progress.
- Click a deal card to open the full deal detail page when deeper editing is needed.
- Support quick stage change directly from the card as a fallback for users who prefer tapping over dragging.
- Keep search and sort visible above the board.

### Table quick editing

Add quick editing for the highest-frequency fields:

- Stage
- Price

This means the user can correct deal progress or price without opening the deal page for every small change.

### Product outcome

- Better pipeline management
- Stronger feeling of control
- Fewer unnecessary trips into record detail pages
- Clearer alignment between what the UI says and what the UI actually does

### Important product correction

The current pipeline page says the user can drag deals between lanes. That needs to become true if this experience ships.

If drag-and-drop is not part of the release, the copy must change.

---

## 7.3 Tasks: Add the Missing Calendar View

### Current experience

```text
TODAY

Tasks
  [Table] [Board]

Useful for:
  seeing a list
  seeing status buckets

Weak for:
  planning a day
  planning a week
  spotting date collisions
```

### Proposed experience

Make tasks a three-view workspace:

- Table
- Board
- Calendar

```text
AFTER

Tasks
  [Table] [Board] [Calendar]
```

### Why calendar matters

CRM tasks are strongly date-driven.

Real estate agents need to understand:

- what is due today
- what is late
- what is clustered this week
- whether follow-ups are spaced well

That is much easier in a calendar than in rows or status columns.

### Calendar experience

```text
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│     │  2  │  3  │  4  │  5  │     │     │
│     │ ●   │ ●●  │ ●   │ ●●● │     │     │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘

Click a day
  -> show that day's tasks

Click a task
  -> quick edit or open full task drawer
```

### Calendar interaction model

- See tasks by day immediately.
- Switch between month and week emphasis.
- Click a task to inspect it.
- Change due date from the calendar surface.
- Change status from the task chip or quick detail surface.

### Quick editing for tasks

Add quick editing for:

- Status
- Due date
- Title

This should work from:

- table
- board
- calendar

### Product outcome

- Better daily planning
- Better weekly planning
- Better follow-up discipline
- A more obviously useful task surface for agents

---

## 7.4 People: Keep Table-First, Add Fast Corrections

### Current experience

People is a good browse page, but still a read-and-open experience.

```text
TODAY

People list
  Sarah Chen | +65 9123 4567 | Buyer | Company A

To fix the phone number:
  open person
  edit
  return
```

### Proposed experience

Keep People as a table-first workspace.

Do **not** add board, gallery, or calendar.

Add direct list editing for the fields that agents correct most often:

- Phone
- Email
- Type
- Company

```text
AFTER

People list
  Sarah Chen | [ +65 9123 4567 ] | [ Buyer ] | [ Company A ]

Click the field
  -> edit inline
  -> save
  -> continue scanning
```

### Why this is the right level of ambition

People is not a multi-view problem today. It is a quick-correction problem.

The highest-value change is to let the user clean data while scanning.

### Product outcome

- Faster CRM cleanup
- Less interruption
- Better data quality
- More trust in the system because the user can correct obvious mistakes immediately

---

## 7.5 Companies: Same Pattern, Lower Priority

### Current experience

Companies is also a browse-first table with direct editing only after opening the company page.

### Proposed experience

Keep Companies as a table-first workspace.

Add direct list editing for:

- Phone
- Email
- Website
- Industry

Address can stay detail-page-first unless list editing proves necessary later.

### Why this comes after People

For the likely day-to-day workflow, people, deals, and tasks are higher-frequency interaction surfaces than companies.

Companies still benefit from quick edit, but the urgency is lower.

---

## 8. Direct Editing Model for Sunder

This is the behavior layer that should feel visibly better after the upgrade.

## 8.1 Where quick edit should exist

| Surface | Quick edit? | Notes |
| --- | --- | --- |
| People list | Yes | Core value |
| Companies list | Yes | After people |
| Deals table | Yes | Stage, price |
| Deals board | Yes | Stage at minimum; drag-and-drop should also work |
| Tasks table | Yes | Status, due date, title |
| Tasks board | Yes | Status and due date at minimum |
| Tasks calendar | Yes | Due date and status |
| Detail pages and drawers | Keep existing editing | Already a strength |

## 8.2 What should stay detail-page-first

- Long notes
- Large text areas
- Custom field maintenance
- Related-record review
- Multi-field cleanup

Quick edit should solve frequent small corrections, not replace the full record surface.

## 8.3 Interaction pattern

Dench uses double-click editing in tables. Sunder should adapt the idea rather than copy it exactly.

### Recommended Sunder behavior

- Keep the row or card primarily navigable.
- Clearly mark editable fields with subtle affordances on hover or focus.
- Clicking the editable value opens the editor for that field.
- `Enter` saves for short inputs.
- `Escape` cancels.
- Blur saves when the user clicks away after changing the value.
- A lightweight saved state appears briefly so the action feels trustworthy.

### Why not copy Dench's exact gesture

Sunder already uses row click heavily for navigation.

A single, clearly editable field interaction is easier to understand than requiring users to learn:

- row click for detail
- double-click cell for edit

The goal is to keep it obvious and forgiving.

### Mobile behavior

Desktop inline editing does not map cleanly to small touch targets.

On mobile:

- tapping a quick-edit field should open a compact sheet or focused editor
- the user still edits one field at a time
- the interaction stays simple and touch-friendly

This keeps the feature useful on phones without forcing tiny in-cell controls.

---

## 9. Before and After

## 9.1 Overall product feel

```text
BEFORE

Sunder helps manage CRM data,
but the experience is uneven:

- some areas are table only
- some areas have a second view
- small edits often happen after opening a deeper surface
- the deals board looks useful but is not yet a true working board

AFTER

Sunder feels like a polished CRM workspace:

- deals switch naturally between list and pipeline
- tasks switch naturally between list, board, and calendar
- people and companies stay simple, but become editable where it matters
- small corrections happen where the user notices them
- detail pages stay available for heavier work
```

## 9.2 Morning workflow

```text
BEFORE

1. Open Customers home
2. Open Deals list
3. Jump to Pipeline separately
4. Open a person page to fix a phone number
5. Open a task drawer to move a due date

AFTER

1. Open Customers home
2. Open Deals and switch between Table and Board instantly
3. Move a deal forward from the board itself
4. Open Tasks in Calendar to see today's workload
5. Fix a phone number directly from People
6. Change a due date where the task is already visible
```

---

## 10. UI Patterns to Carry Over From Dench

These are the Dench-inspired UI decisions worth explicitly carrying forward.

### 10.1 Segmented workspace switcher

Use a compact grouped control that feels like a mode switch, not a loose set of buttons.

```text
[Table] [Board] [Calendar]
```

### 10.2 Shared workspace toolbar

Keep the following in a consistent place:

- title
- subtitle
- search
- filters
- view switcher
- view-specific controls when needed

### 10.3 View-specific controls only when useful

Do not create a settings gear just to imitate Dench.

Use the pattern only where the view actually needs an extra control:

- Calendar range or density
- Board sort or lane summaries

### 10.4 Alternate views must be actionable

If Sunder adds or keeps a view, the user should be able to do useful work from it.

That means:

- a board should allow stage movement
- a calendar should allow date changes
- a list should allow quick corrections

### 10.5 Lightweight save feedback

Dench's inline editing feels immediate because it stays lightweight. Sunder should preserve that feeling:

- edit quickly
- save quickly
- show a short confirmation
- do not interrupt with heavy dialogs

---

## 11. What We Are Intentionally Not Doing

To keep this work disciplined, the following are explicitly out of scope for this design:

- Timeline view for CRM
- Gallery view for CRM
- Generic "all objects can have all views" architecture
- Named saved views with complex persistence
- Full spreadsheet-style editing for every column
- Bulk editing
- Dashboard cards and live report surfaces
- Chat-rendered report UI

This is a focused product polish initiative, not a platform rewrite.

---

## 12. Shipping Order

### Release 1: Deals workspace unification

- Make deals feel like one workspace with Table and Board
- Make the board truly interactive
- Add quick stage and price editing where appropriate

### Release 2: Tasks calendar and quick edit

- Add Calendar view to tasks
- Support quick date and status changes from task surfaces

### Release 3: People list quick edit

- Add quick editing for phone, email, type, company

### Release 4: Companies list quick edit

- Add quick editing for phone, email, website, industry

This order maximizes visible value while keeping the work tied to the highest-frequency workflows first.

---

## 13. Success Criteria

This work is successful if Sunder feels meaningfully better in three ways:

### 13.1 The user can see work in the right shape

- Deals are naturally managed as a list or pipeline
- Tasks are naturally managed as a list, board, or calendar

### 13.2 The user can fix small things immediately

- Wrong phone numbers, stages, statuses, and dates are corrected without a trip through a full detail surface

### 13.3 The product feels more trustworthy and polished

- UI copy matches actual behavior
- alternate views are not dead ends
- the CRM feels less like "tables plus AI" and more like a cohesive working environment

---

## 14. Final Product Take

Dench's strongest lesson for Sunder is not architectural.

It is experiential.

Dench makes data feel:

- viewable in the right form
- editable where the user notices it
- consistent across surfaces

Sunder already has the beginnings of that:

- detail-page editing
- a deals pipeline
- a tasks board

The right move is to turn those partial capabilities into a more unified, more interactive, and more premium CRM experience.

---

## Appendix: Verification Inputs

### Key Sunder sources reviewed

- `app/(dashboard)/customers/deals/page.tsx`
- `app/(dashboard)/customers/deals/pipeline/page.tsx`
- `src/components/crm/kanban-board.tsx`
- `app/(dashboard)/tasks/page.tsx`
- `app/(dashboard)/customers/people/page.tsx`
- `app/(dashboard)/customers/companies/page.tsx`
- `app/(dashboard)/customers/people/[contactId]/page.tsx`
- `app/(dashboard)/customers/companies/[companyId]/page.tsx`
- `app/(dashboard)/customers/deals/[dealId]/page.tsx`
- `src/components/crm/view-toggle.tsx`
- `src/components/crm/inline-edit-field.tsx`

### Key Dench sources reviewed

- `/Users/sethlim/Documents/DenchClaw/apps/web/app/components/workspace/view-type-switcher.tsx`
- `/Users/sethlim/Documents/DenchClaw/apps/web/app/components/workspace/view-settings-popover.tsx`
- `/Users/sethlim/Documents/DenchClaw/apps/web/app/components/workspace/object-table.tsx`
- `/Users/sethlim/Documents/DenchClaw/apps/web/app/workspace/workspace-content.tsx`

### DeepWiki input used

- DeepWiki comparison summary of Dench's object views and inline table editing behavior, focused on user-facing interaction patterns rather than architecture.
