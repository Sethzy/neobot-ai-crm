# Calendar View — Review Prompt

> Hand this to a reviewer after the calendar view PR is implemented.
> They need access to the Twenty repo at `/Users/sethlim/Documents/twenty`.

---

## Context

We replaced Sunder's date-picker + agenda calendar with a proper month grid that
renders task cards inside day cells. The reference implementation is Twenty CRM's
calendar view (open source, production-quality).

**Reference doc:** `roadmap docs/Sunder - Source of Truth/references/twenty-crm/calendar-view.md`

**Twenty source:** `/Users/sethlim/Documents/twenty/packages/twenty-front/src/modules/object-record/record-calendar/`

---

## What to review

### 1. Layout fidelity vs Twenty

Open Twenty's calendar components side-by-side with ours. Check that the grid
structure matches:

| Check | Twenty file | Our file | What to verify |
|---|---|---|---|
| Month body is vertical flex | `month/components/RecordCalendarMonthBody.tsx` | `src/components/crm/calendar-month-grid.tsx` | `flex flex-col`, border, rounded, overflow-hidden |
| Week row is horizontal flex with `items-stretch` | `month/components/RecordCalendarMonthBodyWeek.tsx` | `src/components/crm/calendar-month-week.tsx` | `flex items-stretch`, border-bottom on all but last |
| Day cell is `w-[calc(100%/7)]` with `min-h-[122px]` | `month/components/RecordCalendarMonthBodyDay.tsx` | `src/components/crm/calendar-month-day.tsx` | Exact width calc, min-height, `flex flex-col p-1`, `min-w-0` |
| Cards container is `flex flex-col gap-0.5` with `min-h-[60px]` | Same file, `StyledCardsContainer` | Same file | Flex column, gap, min-height, transition on bg |
| Weekday header labels | `month/components/RecordCalendarMonthHeader.tsx` | `src/components/crm/calendar-month-header.tsx` | 7 labels, same width calc, centered text |

**Flag if:** any of these dimensions or flex properties differ from Twenty without
a documented reason in the drift summary (Section 8 of the reference doc).

### 2. Day cell variant styling

| Variant | Twenty behavior | What to check |
|---|---|---|
| Normal weekday | White/primary background | Default bg matches our card/background token |
| Weekend | Gray2/secondary background | Visually distinct, uses `bg-muted` or similar |
| Other month (prev/next) | Gray2 bg + muted text | Both bg AND text are dimmed |
| Today | Colored circle on day number (20px) | Day number has `bg-primary text-primary-foreground rounded` or equivalent |
| Drag-over | Lighter bg + dashed border | Visual feedback present when dragging over a cell |

### 3. Date range calculation

**Twenty hook:** `month/hooks/useRecordCalendarMonthDaysRange.tsx`
**Our hook:** `src/hooks/use-calendar-month-range.ts`

Verify the algorithm:
- Given April 2026 → grid starts Sunday March 29, ends Saturday May 2
- Given a month starting on Sunday → no extra leading week
- Given a month ending on Saturday → no extra trailing week
- Uses `startOfWeek` / `endOfWeek` / `eachWeekOfInterval` / `eachDayOfInterval`
- Returns `Date[][]` (array of weeks, each an array of 7 days)

### 4. Card rendering

- Cards limited to **5 per day** (`slice(0, 5)`) — same as Twenty
- "+N more" indicator when > 5 tasks on a day
- Cards show: title (truncated), status indicator
- Click on card opens task drawer (not inline edit — this is intentional drift)
- Cards are compact (`text-xs`, tight padding) — appropriate for day cell size

### 5. Drag-and-drop

Compare our DnD setup with Twenty's. The library differs (`@dnd-kit` vs
`@hello-pangea/dnd`) but the pattern should be equivalent:

| Twenty pattern | Our equivalent | Check |
|---|---|---|
| `<DragDropContext>` wraps month | `<DndContext>` wraps month grid | Present |
| `<Droppable droppableId={dateKey}>` per day | `useDroppable({ id: dateKey })` per day | `dateKey` is ISO format `"2026-04-05"` |
| `<Draggable draggableId={recordId}>` per card | `useDraggable({ id: taskId })` per card | taskId is the drag identifier |
| `DragOverlay` shows card copy | `DragOverlay` from `@dnd-kit/core` | Shadow card visible during drag |
| Drop handler updates date field | Drop handler calls `useUpdateCrmTask` with new `due_date` | Mutation fires, query invalidates |
| Optimistic move (local state update before server) | Same pattern as kanban `optimisticMoves` Map | Present, with rollback on error |
| Same-date drop is no-op | Check `fromDateKey === toDateKey` | No unnecessary mutation |

**Also check:** sensor config matches kanban (`PointerSensor`, `distance: 5`).

### 6. Top bar navigation

**Twenty:** `RecordCalendarTopBar.tsx`
**Ours:** `src/components/crm/calendar-top-bar.tsx`

- "April 2026" label (or month/year format)
- Left/right arrows to navigate months
- "Today" button jumps to current month
- Uses `addMonths` / `subMonths` from `date-fns`

### 7. Documented drift — verify each is intentional

The reference doc (Section 3.3 + Section 8) lists these as intentional drift or
deferred. Confirm none were accidentally implemented or accidentally omitted:

| Item | Expected state | Flag if |
|---|---|---|
| Inline field editing portals | **Not implemented** | Present — over-scoped |
| Card selection checkboxes | **Not implemented** | Present — over-scoped |
| "Add new" button on day hover | **Not implemented** | Present — over-scoped |
| Position-based ordering within a day | **Not implemented** (sort by created_at or title) | Uses a `position` column we don't have |
| DnD library is `@dnd-kit` not `@hello-pangea/dnd` | **Expected** | Using `@hello-pangea/dnd` — unnecessary new dep |
| Styling is Tailwind not Linaria | **Expected** | Linaria styled-components present |
| State is TanStack Query not Jotai | **Expected** | Jotai atoms present |
| Tasks-only (not generic record) | **Expected** | Generic record abstraction present — over-engineered |

### 8. Undocumented drift — flag anything new

If the implementation drifts from Twenty in a way **not** listed in the reference
doc's drift summary, flag it. The default is no drift. Any new drift needs a
documented reason.

Examples to watch for:
- Different min-height on day cells without reason
- Different card limit (not 5)
- Missing drag-over visual feedback
- Month navigation that doesn't match Twenty's UX
- Week starting on Monday instead of Sunday without configuration

### 9. Files checklist

Verify these files exist and are wired up:

- [ ] `src/hooks/use-calendar-month-range.ts` — hook created
- [ ] `src/components/crm/calendar-month-header.tsx` — component created
- [ ] `src/components/crm/calendar-month-day.tsx` — component created
- [ ] `src/components/crm/calendar-day-card.tsx` — component created
- [ ] `src/components/crm/calendar-month-week.tsx` — component created
- [ ] `src/components/crm/calendar-month-grid.tsx` — component created
- [ ] `src/components/crm/calendar-top-bar.tsx` — component created
- [ ] `src/components/crm/crm-tasks-calendar.tsx` — rewritten (no more `react-day-picker`)
- [ ] `app/(dashboard)/tasks/page.tsx` — wired up, `due_date` mutation added
- [ ] `src/components/ui/calendar.tsx` — **untouched** (still used for date pickers elsewhere)
- [ ] `src/components/crm/kanban-board.tsx` — **untouched**

### 10. Visual check

Open the app and compare:
1. Does the month grid look like Twenty's screenshots? (Full-width grid, cards in cells, not a sidebar picker)
2. Drag a task from Wednesday to Friday — does the `due_date` update?
3. Toggle between Table / Board / Calendar — all three work?
4. Click a card — drawer opens?
5. Navigate months — correct date ranges?
6. Today's date highlighted?
7. Weekend columns visually distinct?
8. Other-month days (greyed out) present at start/end of grid?
