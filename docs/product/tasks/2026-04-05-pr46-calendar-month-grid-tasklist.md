# Tasks Calendar Month Grid

**PR:** PR 46 follow-up: tasks calendar month-grid rewrite  
**Scope:** Replace the current date-picker-plus-agenda tasks calendar with a proper month grid that renders task cards inside day cells and supports drag-to-reschedule.  
**Reference:** `roadmap docs/Sunder - Source of Truth/references/twenty-crm/calendar-view.md`

## Goal

Ship the calendar view that the PR 46 plan actually described:

- month navigation at the top of `/tasks`
- full-week month grid
- compact task cards inside day cells
- drag task between days to update `due_date`
- mobile-safe horizontal overflow instead of a crushed 7-column layout

## Files

### Create
- `src/hooks/use-calendar-month-range.ts`
- `src/hooks/__tests__/use-calendar-month-range.test.ts`
- `src/components/crm/calendar-top-bar.tsx`
- `src/components/crm/calendar-month-header.tsx`
- `src/components/crm/calendar-month-week.tsx`
- `src/components/crm/calendar-month-day.tsx`
- `src/components/crm/calendar-day-card.tsx`
- `src/components/crm/calendar-month-grid.tsx`
- `src/components/crm/__tests__/crm-tasks-calendar.test.tsx`

### Modify
- `src/components/crm/crm-tasks-calendar.tsx`
- `app/(dashboard)/tasks/page.tsx`
- `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`

## Execution Steps

1. Add a month-range hook that returns full weeks for the selected month and weekday labels.
2. Build the calendar UI as small focused components: top bar, weekday header, week row, day cell, compact card, and grid shell.
3. Rewrite `CrmTasksCalendar` to use the new month grid and remove `react-day-picker` from this surface.
4. Reuse `@dnd-kit/core` from the kanban implementation to support dragging a task from one day to another.
5. Wire the calendar into `/tasks` through a dedicated `due_date` mutation callback instead of inventing a second task-fetch path.
6. Add targeted tests for month-range math, calendar rendering, and drag-to-reschedule integration.

## Verification

- April 2026 renders as 5 full weeks from March 29 through May 2.
- Switching to Calendar view on `/tasks` shows the month grid, not the old agenda layout.
- Clicking a task card still opens the task drawer.
- Dragging a task to another day calls the `due_date` update path with the new date.
- Months with no scheduled tasks still render the grid and show a clear empty message.
- The calendar remains usable on mobile via horizontal scroll.
