# Twenty CRM Calendar View — Reference & Tasklist

> **Goal:** Replace Sunder's date-picker-plus-agenda calendar with a proper month grid
> that renders task cards inside day cells, matching Twenty's implementation with
> minimal drift.
>
> **Reference repo:** `/Users/sethlim/Documents/twenty` (Twenty CRM open source)

---

## 1. How Twenty Does It

### 1.1 No Calendar Library

Twenty does **not** use `react-big-calendar`, `react-calendar`, or any calendar UI
library. The month grid is custom-built with Flexbox in ~200 lines of layout code.

**Dependencies used:**

| Dependency | Purpose | We have it? |
|---|---|---|
| `date-fns` | Date math (eachDayOfInterval, startOfWeek, format, etc.) | Yes (v4.1.0) |
| `@hello-pangea/dnd` | Drag-and-drop (Droppable day cells, Draggable cards) | No — but we have `@dnd-kit/core` |
| `Temporal` (polyfill) | Timezone-aware date comparison | No — we use `date-fns` only |
| `Linaria` | CSS-in-JS (styled components) | No — we use Tailwind |

### 1.2 Component Hierarchy

```
RecordIndexCalendarContainer          ← entry point, provides context
  └─ RecordCalendarContextProvider
       └─ RecordCalendar              ← top bar + scroll wrapper + month
            ├─ RecordCalendarTopBar   ← month/year nav, today button
            └─ ScrollWrapper
                 └─ RecordCalendarMonth           ← DragDropContext wrapper
                      ├─ RecordCalendarMonthHeader    ← weekday labels (Su Mo Tu ...)
                      └─ RecordCalendarMonthBody      ← stacks weeks vertically
                           └─ RecordCalendarMonthBodyWeek  (× N weeks)
                                └─ RecordCalendarMonthBodyDay (× 7 days)
                                     ├─ Day number + today indicator
                                     ├─ "Add new" button (on hover)
                                     └─ Droppable zone
                                          └─ RecordCalendarCardDraggableContainer[]
                                               └─ RecordCalendarCard
                                                    ├─ RecordCalendarCardHeader
                                                    └─ RecordCalendarCardBody
```

### 1.3 Month Grid Layout (Flexbox)

**Month body** — vertical flex column:
```css
display: flex;
flex-direction: column;
flex: 1;
border: 1px solid borderLight;
border-radius: 4px;
overflow: hidden;
```

**Week row** — horizontal flex row:
```css
display: flex;
align-items: stretch;   /* equalises day heights across the row */
flex: 1;
border-bottom: 1px solid borderLight;  /* all but last week */
```

**Day cell** — flex column, 1/7th width:
```css
display: flex;
width: calc(100% / 7);
flex-direction: column;
min-height: 122px;
padding: 4px;           /* theme spacing[1] */
min-width: 0;           /* prevents overflow */
border-right: 1px solid borderLight;
```

**Cards container inside day cell**:
```css
display: flex;
flex: 1;
flex-direction: column;
gap: 2px;               /* theme spacing[0.5] */
min-height: 60px;
border-radius: 4px;
transition: background-color 0.1s ease;
```

### 1.4 Day Cell Variants

| Condition | Background | Text color |
|---|---|---|
| Normal weekday | primary (white) | primary (near-black) |
| Weekend | secondary (gray2) | primary |
| Other month | secondary (gray2) | light (gray8) |
| Today indicator | Blue circle (20px) on day number | inverted (white) |
| Drag-over | transparent-lighter bg + dashed border | — |

### 1.5 Date Range Calculation

**Hook:** `useRecordCalendarMonthDaysRange`

Algorithm:
1. Get selected month from state
2. Compute first/last day of month
3. Extend backward to `startOfWeek(firstDay)` and forward to `endOfWeek(lastDay)`
4. Generate all weeks with `eachWeekOfInterval()`
5. Generate all days per week with `eachDayOfInterval()`
6. Return `{ weekDayLabels, weekFirstDays, firstDayOfFirstWeek, lastDayOfLastWeek }`

Uses `date-fns` functions: `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`,
`eachWeekOfInterval`, `eachDayOfInterval`, `format`.

### 1.6 Records-Per-Day Filtering

**Selector:** `calendarDayRecordsComponentFamilySelector`

- Iterates all record IDs in calendar state
- For each record, reads the calendar field value from the record store
- Converts DATE_TIME fields to user timezone, then to PlainDate
- Compares against the target day
- Sorts by `position` field if available
- Returns matching record IDs

**Day cell limits display to first 5 records** (`recordIds.slice(0, 5)`).

### 1.7 Drag-and-Drop

**Library:** `@hello-pangea/dnd` (fork of react-beautiful-dnd)

**Setup in `RecordCalendarMonth`:**
```tsx
<DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
  <RecordCalendarMonthHeader />
  <RecordCalendarMonthBody />
</DragDropContext>
```

**Droppable zones** — each day cell:
```tsx
<Droppable droppableId={dayKey}>  {/* dayKey = "2026-04-05" ISO string */}
  {(provided, snapshot) => (
    <StyledCardsContainer
      ref={provided.innerRef}
      {...provided.droppableProps}
      isDraggedOver={snapshot.isDraggingOver}
    >
      {recordIds.slice(0, 5).map((id, index) => (
        <RecordCalendarCardDraggableContainer key={id} recordId={id} index={index} />
      ))}
      {provided.placeholder}
    </StyledCardsContainer>
  )}
</Droppable>
```

**Draggable cards:**
```tsx
<Draggable draggableId={recordId} index={index} isDragDisabled={dragIsDisabled}>
  {(provided) => (
    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
      <RecordCalendarCard recordId={recordId} />
    </div>
  )}
</Draggable>
```

**Drop handler** (`useProcessCalendarCardDrop`):
1. Extract `recordId` from `draggableId`, destination date from `droppableId`
2. Convert destination to `Temporal.PlainDate`
3. Compute new position among destination day's records
4. Update record: set new date field + position
5. Handles both DATE and DATE_TIME field types with timezone conversion

### 1.8 Calendar Card

Each card shows:
- **Header:** Record name chip + selection checkbox
- **Body:** Visible fields rendered as inline-editable cells
- Hover/edit portals for field editing without leaving the calendar

### 1.9 Top Bar Navigation

- Month/year dropdown picker
- Previous / Next month arrows
- "Today" button
- Timezone abbreviation display

---

## 2. Where Sunder Is Today

### 2.1 Current Calendar Implementation

**File:** `src/components/crm/crm-tasks-calendar.tsx`

- Uses `react-day-picker` (a date picker, not a calendar)
- Layout: small picker on left (320-360px) + agenda list on right
- Events are **not** rendered in the grid — just a tiny dot modifier
- Click a date → see tasks in side panel
- No drag-and-drop
- No month grid with task cards

### 2.2 What We Already Have

| Capability | Status | File |
|---|---|---|
| `@dnd-kit/core` + `sortable` + `utilities` | Installed | `package.json` |
| Kanban DnD (PointerSensor, closestCenter, optimistic moves) | Working | `src/components/crm/kanban-board.tsx` |
| Task card component | Working | `src/components/crm/task-kanban-card.tsx` |
| Task grouping by date key | Working | `crm-tasks-calendar.tsx` (tasksByDate memo) |
| `getTaskDateKey()` helper (yyyy-MM-dd, timezone-safe) | Working | `src/lib/crm/schemas.ts` |
| `date-fns` v4.1.0 | Installed | `package.json` |
| Task status badges + color maps | Working | `task-status-badge.tsx`, `color-maps.ts` |
| View toggle (Table / Board / Calendar) | Working | `view-toggle.tsx` |
| Task update mutations (status) | Working | `tasks/page.tsx` |
| `useUpdateCrmTask` hook | Working | `src/hooks/use-update-crm-task.ts` |

---

## 3. Drift Analysis

### 3.1 Required Drift (technical stack differences)

| Twenty | Sunder | Reason for drift |
|---|---|---|
| `@hello-pangea/dnd` (Droppable/Draggable) | `@dnd-kit/core` (useDroppable/useDraggable) | Already installed, already used in kanban. Adding a second DnD library is unnecessary. API surface is similar. |
| Linaria styled components | Tailwind CSS classes | Project convention. All Sunder components use Tailwind. |
| Jotai atoms + family selectors | TanStack Query + React state | Project convention. Sunder uses TanStack Query for server state. |
| Temporal API (timezone) | `date-fns` + `getTaskDateKey()` | We already have timezone-safe date keying. No need for Temporal polyfill. |
| GraphQL + Apollo | Supabase client | Database layer difference. |
| Generic record system (any object on calendar) | Tasks-only calendar | Sunder calendar is task-specific. No need for the generic object abstraction. |

### 3.2 No-Drift Areas (copy directly)

| Pattern | Copy from Twenty | Notes |
|---|---|---|
| Month grid layout (Flexbox) | `RecordCalendarMonthBody`, `Week`, `Day` | Translate styled-components → Tailwind classes. Identical layout math. |
| `width: calc(100% / 7)` per day cell | `RecordCalendarMonthBodyDay` | Exact same CSS. |
| `min-height: 122px` day cells | `RecordCalendarMonthBodyDay` | Same value. |
| Weekend / other-month / today styling | `RecordCalendarMonthBodyDay` | Map to Flexoki tokens instead of Twenty's gray scale. |
| Cards stacked in day cell with gap | `StyledCardsContainer` | `flex flex-col gap-0.5` |
| 5-card limit per day | `recordIds.slice(0, 5)` | Same logic. |
| Date range calculation (full weeks) | `useRecordCalendarMonthDaysRange` | Same algorithm with `date-fns`. |
| Droppable day cells + Draggable cards | DnD pattern | Same concept, `@dnd-kit` API instead of `@hello-pangea/dnd`. |
| Drop handler updates `due_date` | `useProcessCalendarCardDrop` | Simplified: we only have `due_date` (not generic field). Use `useUpdateCrmTask`. |
| Top bar: month nav + today button | `RecordCalendarTopBar` | Same UX. |
| Drag-over visual feedback (dashed border) | Day cell `isDraggedOver` state | Same pattern. |

### 3.3 Features to Defer

| Twenty feature | Decision | Reason |
|---|---|---|
| Inline field editing in cards (portals) | Defer | Complexity. Click-to-open drawer is sufficient for now. |
| Card selection checkboxes | Defer | Not needed for task management UX. |
| "Add new" button on day hover | Defer | Can add later. Tasks are created via agent or table view. |
| Position-based ordering within a day | Defer | We don't have a `position` column on tasks. Sort by title or created_at. |
| SSE/realtime subscription for calendar range | Defer | Sunder already has TanStack Query invalidation via realtime. |

---

## 4. Twenty Source Files Reference

All paths relative to `/Users/sethlim/Documents/twenty/packages/twenty-front/src/modules/object-record/`.

### 4.1 Month Grid Components (COPY)

| Twenty file | What to extract |
|---|---|
| `record-calendar/month/components/RecordCalendarMonth.tsx` | DragDropContext wrapper, month layout structure |
| `record-calendar/month/components/RecordCalendarMonthBody.tsx` | Weeks iteration, vertical flex container |
| `record-calendar/month/components/RecordCalendarMonthBodyWeek.tsx` | Days iteration within a week, horizontal flex row |
| `record-calendar/month/components/RecordCalendarMonthBodyDay.tsx` | Day cell: header, droppable zone, cards container, styling variants |
| `record-calendar/month/components/RecordCalendarMonthHeader.tsx` | Weekday labels row |
| `record-calendar/month/components/RecordCalendarMonthHeaderDay.tsx` | Single weekday label |

### 4.2 Date Range Hook (COPY)

| Twenty file | What to extract |
|---|---|
| `record-calendar/month/hooks/useRecordCalendarMonthDaysRange.tsx` | Full week range calculation algorithm |

### 4.3 Drag-and-Drop (ADAPT)

| Twenty file | What to extract |
|---|---|
| `record-calendar/record-calendar-card/components/RecordCalendarCardDraggableContainer.tsx` | Draggable wrapper pattern (adapt to `@dnd-kit`) |
| `../record-drag/hooks/useProcessCalendarCardDrop.ts` | Drop handler logic (simplify for tasks-only) |

### 4.4 Top Bar (COPY)

| Twenty file | What to extract |
|---|---|
| `record-calendar/components/RecordCalendarTopBar.tsx` | Month/year nav, today button |

### 4.5 Card Components (REFERENCE)

| Twenty file | What to extract |
|---|---|
| `record-calendar/record-calendar-card/components/RecordCalendarCard.tsx` | Card structure (we already have `TaskKanbanCard`) |

---

## 5. Sunder Files to Touch

| File | Action | Description |
|---|---|---|
| `src/components/crm/crm-tasks-calendar.tsx` | **Rewrite** | Replace date-picker + agenda with month grid |
| `src/components/crm/calendar-month-grid.tsx` | **Create** | Month grid container (body + header) |
| `src/components/crm/calendar-month-week.tsx` | **Create** | Single week row |
| `src/components/crm/calendar-month-day.tsx` | **Create** | Single day cell with droppable zone |
| `src/components/crm/calendar-month-header.tsx` | **Create** | Weekday labels row |
| `src/components/crm/calendar-top-bar.tsx` | **Create** | Month/year navigation + today button |
| `src/components/crm/calendar-day-card.tsx` | **Create** | Compact task card for calendar cells (smaller than kanban card) |
| `src/hooks/use-calendar-month-range.ts` | **Create** | Date range calculation (port from Twenty) |
| `app/(dashboard)/tasks/page.tsx` | **Edit** | Add `due_date` mutation for calendar DnD (like status mutation for kanban) |
| `src/hooks/use-update-crm-task.ts` | **Verify** | Ensure it can update `due_date` field |

### 5.1 Files NOT Touched

| File | Reason |
|---|---|
| `src/components/ui/calendar.tsx` | Keep as-is. Still useful for date pickers elsewhere. |
| `src/components/crm/kanban-board.tsx` | No changes. Kanban stays separate. |
| `src/components/crm/task-kanban-card.tsx` | No changes. Calendar card will be a new, more compact component. |
| `src/hooks/use-crm-tasks.ts` | No changes. Same data source for all views. |

---

## 6. Tasklist

### Phase A: Month Grid Layout (no DnD)

#### A1. Create `use-calendar-month-range` hook

**Port from:** `record-calendar/month/hooks/useRecordCalendarMonthDaysRange.tsx`

- Input: `selectedMonth: Date`
- Output: `{ weeks: Date[][], weekDayLabels: string[], firstDay: Date, lastDay: Date }`
- Use `date-fns`: `startOfMonth`, `endOfMonth`, `startOfWeek`, `endOfWeek`, `eachWeekOfInterval`, `eachDayOfInterval`, `format`
- Week starts on Sunday (match Twenty default, configurable later)
- **Test:** Given April 2026, returns 5 weeks starting from March 29 (Sunday) through May 2

**File to create:** `src/hooks/use-calendar-month-range.ts`

#### A2. Create `calendar-month-header` component

**Port from:** `RecordCalendarMonthHeader` + `RecordCalendarMonthHeaderDay`

- Renders weekday labels: Su, Mo, Tu, We, Th, Fr, Sa
- Horizontal flex row, `w-[calc(100%/7)]` per label
- Center-aligned text, `text-xs text-muted-foreground font-medium`
- Bottom border

**File to create:** `src/components/crm/calendar-month-header.tsx`

#### A3. Create `calendar-month-day` component

**Port from:** `RecordCalendarMonthBodyDay`

- Props: `day: Date, isOtherMonth: boolean, isToday: boolean, isWeekend: boolean, tasks: CrmTaskWithRelations[]`
- Day number in top-left, today indicator (bg-primary text-primary-foreground rounded)
- Render compact task cards (up to 5, "+N more" if overflow)
- Click task → `onTaskClick(taskId)`
- Styling: `min-h-[122px] w-[calc(100%/7)] flex flex-col p-1`
- Weekend/other-month: `bg-muted/50` or `bg-muted/30`

**File to create:** `src/components/crm/calendar-month-day.tsx`

#### A4. Create `calendar-day-card` component

**New — compact version of task card for calendar cells**

- Smaller than kanban card — optimised for constrained day cells
- Shows: title (truncated), status badge (small dot or mini badge), due time if present
- Click → opens task drawer
- Reference Twenty's `RecordCalendarCard` for structure but simpler (no inline edit, no checkbox)
- Use existing `TaskStatusBadge` or a minimal dot indicator
- `text-xs`, `p-1.5`, `rounded border bg-card`

**File to create:** `src/components/crm/calendar-day-card.tsx`

#### A5. Create `calendar-month-week` component

**Port from:** `RecordCalendarMonthBodyWeek`

- Props: `days: Date[], tasksMap: Record<string, CrmTaskWithRelations[]>, month: Date`
- Horizontal flex row: `flex items-stretch border-b border-border/40`
- Renders 7 `CalendarMonthDay` components
- Computes `isOtherMonth`, `isToday`, `isWeekend` per day

**File to create:** `src/components/crm/calendar-month-week.tsx`

#### A6. Create `calendar-month-grid` component

**Port from:** `RecordCalendarMonthBody` + `RecordCalendarMonth`

- Props: `month: Date, tasks: CrmTaskWithRelations[], onTaskClick: (id: string) => void`
- Uses `useCalendarMonthRange(month)` to get weeks
- Groups tasks by date key using existing `getTaskDateKey()`
- Vertical flex: `flex flex-col border rounded-lg overflow-hidden`
- Renders header + weeks

**File to create:** `src/components/crm/calendar-month-grid.tsx`

#### A7. Create `calendar-top-bar` component

**Port from:** `RecordCalendarTopBar`

- Shows: "April 2026" label, left/right arrows, "Today" button
- `onPreviousMonth`, `onNextMonth`, `onToday` callbacks
- `selectedMonth` state lives in parent
- Use ShadCN `Button` with `variant="ghost"` for arrows, `variant="outline"` for Today
- `date-fns` `format(month, "MMMM yyyy")` for label
- `addMonths` / `subMonths` for navigation

**File to create:** `src/components/crm/calendar-top-bar.tsx`

#### A8. Rewrite `crm-tasks-calendar` to use month grid

**Replace:** Current date-picker + agenda layout

- State: `selectedMonth` (default: current month)
- Render: `CalendarTopBar` + `CalendarMonthGrid`
- Pass `tasks`, `onTaskClick` through to grid
- Remove `react-day-picker` usage from this component
- Keep `tasksByDate` grouping memo (already exists, reuse)

**File to edit:** `src/components/crm/crm-tasks-calendar.tsx`

#### A9. Verify tasks page integration

- Ensure `CrmTasksCalendar` still receives correct props from `tasks/page.tsx`
- Test view toggle between Table / Board / Calendar
- Verify task drawer opens on card click

**File to verify:** `app/(dashboard)/tasks/page.tsx`

---

### Phase B: Drag-and-Drop (reschedule tasks by dragging)

#### B1. Add DnD context to calendar grid

**Adapt from:** `RecordCalendarMonth` DragDropContext pattern

- Wrap `CalendarMonthGrid` in `@dnd-kit` `DndContext`
- Sensors: `PointerSensor` with `distance: 5` (same as kanban)
- Collision detection: `closestCenter` or `pointerWithin`
- `DragOverlay` showing the dragged card

**File to edit:** `src/components/crm/calendar-month-grid.tsx`

#### B2. Make day cells droppable

**Adapt from:** `RecordCalendarMonthBodyDay` Droppable pattern

- Each day cell uses `useDroppable({ id: dateKey })` from `@dnd-kit/core`
- `dateKey` = `"2026-04-05"` format (ISO date string, same as Twenty's `droppableId`)
- Visual feedback: when `isOver`, show `ring-2 ring-primary/30` or dashed border
- Pass `setNodeRef` to the cards container div

**File to edit:** `src/components/crm/calendar-month-day.tsx`

#### B3. Make calendar cards draggable

**Adapt from:** `RecordCalendarCardDraggableContainer` Draggable pattern

- Wrap each `CalendarDayCard` in `useDraggable({ id: taskId, data: { dateKey } })`
- Apply `transform` style and `listeners`/`attributes`
- `isDragging` → `opacity-30` on source card
- DragOverlay renders a copy of the card with `shadow-lg`

**File to edit:** `src/components/crm/calendar-day-card.tsx` (or a wrapper)

#### B4. Handle drop — update task `due_date`

**Adapt from:** `useProcessCalendarCardDrop`

- On `onDragEnd`: extract `active.id` (taskId) and `over.id` (target dateKey)
- If same date → no-op
- Optimistic update: move task to new date in local state (same Map pattern as kanban)
- Mutation: `useUpdateCrmTask` to set `due_date` to new date
- Rollback on error

**File to edit:** `src/components/crm/calendar-month-grid.tsx` (or `crm-tasks-calendar.tsx`)
**File to verify:** `src/hooks/use-update-crm-task.ts` — ensure `due_date` is updatable

#### B5. Add `due_date` update mutation to tasks page

- Similar to existing `updateTaskStatus` mutation
- Or: reuse `useUpdateCrmTask` directly in the calendar component
- Invalidate `crmTaskKeys.all` on success

**File to edit:** `app/(dashboard)/tasks/page.tsx` or `src/components/crm/crm-tasks-calendar.tsx`

---

### Phase C: Polish

#### C1. "+N more" indicator on days with >5 tasks

- When `tasks.length > 5`, show a small text link: "+3 more"
- Clicking it could expand or open a popover (defer popover, just show count)

**File to edit:** `src/components/crm/calendar-month-day.tsx`

#### C2. Empty state for months with no tasks

- If no tasks have `due_date` in the visible range, show a subtle message
- "No tasks scheduled this month"

**File to edit:** `src/components/crm/crm-tasks-calendar.tsx`

#### C3. Keyboard navigation (optional, defer)

- Arrow keys to move between days
- Enter to expand day
- Twenty doesn't have this either — skip for now

#### C4. Mobile responsive

- On small screens, the month grid should still work but with tighter cells
- Consider hiding card details and showing only dots/counts on mobile
- `min-h-[80px]` instead of `min-h-[122px]` on small screens

**File to edit:** `src/components/crm/calendar-month-day.tsx`

---

## 7. Implementation Order

```
A1 → A2 → A5 → A3 → A4 → A6 → A7 → A8 → A9  (grid first, no DnD)
                                                  ↓
                                          B1 → B2 → B3 → B4 → B5  (add DnD)
                                                                     ↓
                                                              C1 → C2 → C4  (polish)
```

**Phase A** is the big visual upgrade. **Phase B** adds interactivity. **Phase C** is polish.

---

## 8. Drift Summary

| Area | Drift? | Details |
|---|---|---|
| Grid layout (Flexbox, 7 cols, min-height) | **None** | Copy exactly, translate to Tailwind classes |
| Date range calculation | **None** | Same `date-fns` algorithm |
| 5-card limit per day | **None** | Same `slice(0, 5)` |
| DnD library | **Minimal** | `@dnd-kit` instead of `@hello-pangea/dnd` — same concepts, different API surface |
| Styling system | **Mechanical** | Tailwind classes instead of Linaria styled-components — same visual output |
| State management | **Mechanical** | TanStack Query + React state instead of Jotai atoms — same data flow |
| Card content | **Intentional** | Simpler cards (no inline edit, no checkbox). Task-specific instead of generic record. |
| Top bar | **None** | Same UX: month label + arrows + today button |
| Generic record abstraction | **Intentional** | We only have tasks on the calendar. No need for the multi-object layer. |
| Timezone handling | **Minimal** | `getTaskDateKey()` already handles this. No need for Temporal polyfill. |
| Position ordering within a day | **Deferred** | No `position` column on tasks yet. Sort by `created_at` or `title`. |
| Inline field editing portals | **Deferred** | Click to open drawer is sufficient. Can add later. |
| "Add new" on hover | **Deferred** | Tasks created via agent or table. Can add later. |

**Default principle:** If Twenty does it and we have no technical reason to differ, copy it.
