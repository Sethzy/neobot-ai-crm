# QA Surface 16: CRM Working Surfaces

> **PRs covered:** 46 (view switching, deals board, tasks calendar, quick edit), 46a (timeline audit log — drawer timeline), 67 (saved views — pill tabs, view filtering), 2026-04-23 KISS CRM UX foundation (state-based saved workspaces, shared CRM shell, full record pages)
> **Dogfoodable:** Yes
> **Time estimate:** 50-60 min manual

> **Note:** Basic CRM page rendering is tested in [Surface 4: CRM Pages](04-crm-pages.md). This surface covers the enhanced working surfaces: view switching, board/calendar views, and inline quick editing.

---

## Prerequisites

- CRM has test data: 5+ deals across multiple stages, 5+ contacts, 3+ companies, 5+ tasks (some with due dates, some without)
- At least one deal per stage for board testing
- Tasks with varying statuses and due dates spread across current month

---

## Dogfood Checklist (automated browser pass)

- [ ] `/customers/deals` shows a view toggle (table / board)
- [ ] `/tasks` shows a view toggle (table / board / calendar)
- [ ] Board view renders kanban columns by stage
- [ ] Calendar view renders month grid with task indicators
- [ ] Quick edit cells are clickable on desktop
- [ ] No console errors on view switching
- [ ] Responsive: views degrade gracefully on mobile (375px)
- [ ] `/customers/deals/pipeline` redirects to `/customers/deals?view=kanban`

### Mobile responsive checks

- [ ] At 390px, CRM filter overlay opens as a bottom sheet.
- [ ] Filter Apply and Clear controls remain visible or reachable after scrolling options.
- [ ] Record detail opens as a bottom sheet with content scrolling inside the sheet.
- [ ] Deals board can move a deal by explicit stage selector, without requiring drag-and-drop.
- [ ] Tasks calendar does not require document-level horizontal scrolling.

---

## Manual QA Scenarios

### 16.1 Deals — view toggle (PR 46, task 1-2)

1. Navigate to `/customers/deals`
2. **Expected:** View toggle visible with "Table" and "Board" options
3. Default view is table (or last-used preference)
4. Click "Board"
5. **Expected:** Kanban board renders with columns per deal stage
6. **Expected:** Each deal card shows key info (address, price, contact)
7. Click "Table"
8. **Expected:** Returns to table view, same data
9. Refresh the page
10. **Expected:** View preference persisted (shows last-used view)

**Notes / failures:**

---

### 16.2 Deals board — stage movement (PR 46, task 2)

1. Switch to board view on `/customers/deals`
2. Find a deal card
3. **Expected:** Stage selector (dropdown/select) on the card
4. Change the stage via the selector (e.g., "Prospecting" → "Negotiation")
5. **Expected:** Card moves to the new stage column
6. **Expected:** Change persists (refresh → deal stays in new stage)
7. Switch to table view
8. **Expected:** Same deal shows updated stage

**Notes / failures:**

---

### 16.3 Deals — quick edit in table (PR 46, task 3)

1. In table view on `/customers/deals`
2. Click on a deal's stage cell
3. **Expected:** Inline editor appears (select dropdown)
4. Change the stage, press Enter or click away
5. **Expected:** Stage updates, save indicator (checkmark) flashes
6. Click on a deal's price cell
7. **Expected:** Inline number editor appears
8. Change the price, press Enter
9. **Expected:** Price updates with formatting
10. Press Escape during editing
11. **Expected:** Edit cancelled, original value restored

**Notes / failures:**

---

### 16.4 People — quick edit (PR 46, task 3)

1. Navigate to `/customers/people`
2. Click on a contact's phone cell
3. **Expected:** Inline text editor appears
4. Update the phone number, press Enter
5. **Expected:** Phone updates, shows as tel: link in read mode
6. Click on email cell → update → **Expected:** Updates, shows as mailto: link
7. Click on type cell → **Expected:** Select dropdown with contact types
8. Click on company cell → **Expected:** Select dropdown with companies + "No company" option
9. Clear company (select "No company")
10. **Expected:** Company cleared (null)

**Notes / failures:**

---

### 16.5 Companies — quick edit (PR 46, task 3)

1. Navigate to `/customers/companies`
2. Click on phone cell → edit → **Expected:** Updates
3. Click on email cell → edit → **Expected:** Updates
4. Click on website cell → edit → **Expected:** Updates with protocol normalization (adds https:// if missing)
5. Click on industry cell → **Expected:** Select dropdown from configured industry list

**Notes / failures:**

---

### 16.6 Tasks — view toggle (PR 46, task 1, 4)

1. Navigate to `/tasks`
2. **Expected:** View toggle with Table, Board, Calendar
3. Switch between all three views
4. **Expected:** All render correctly with the same data

**Notes / failures:**

---

### 16.7 Tasks — calendar view (PR 46, task 4)

1. Switch to calendar view on `/tasks`
2. **Expected:** Month grid renders with current month
3. **Expected:** Days with tasks show indicators/dots
4. Click on a day with tasks
5. **Expected:** Agenda list appears below calendar showing tasks for that day
6. **Expected:** Undated task count shown somewhere
7. Navigate to previous/next month
8. **Expected:** Calendar updates, shows tasks for that month
9. Navigate back to current month
10. **Expected:** Selected day state is sensible (today or cleared)

**Notes / failures:**

---

### 16.8 Tasks — quick edit in table (PR 46, task 3)

1. In table view on `/tasks`
2. Click on a task's status cell
3. **Expected:** Select dropdown with status options
4. Change status (e.g., "todo" → "done")
5. **Expected:** Status updates
6. Click on due date cell
7. **Expected:** Date picker appears
8. Change the date
9. **Expected:** Due date updates

**Notes / failures:**

---

### 16.9 Filters persist across views (PR 46, task 2)

1. On `/customers/deals` in table view, apply a search filter
2. Switch to board view
3. **Expected:** Board shows only filtered deals (search carries over)
4. Apply a stage filter in board view
5. Switch back to table view
6. **Expected:** Stage filter carries over

**Notes / failures:**

---

### 16.10 Detail pages preserved (PR 46, task 5)

1. Click on a deal row to open the detail drawer/page
2. **Expected:** Full detail page still accessible for deeper editing
3. Make an edit on the detail page
4. **Expected:** Save/error feedback is visible and consistent
5. Return to list
6. **Expected:** List reflects the edit

**Notes / failures:**

---

### 16.11 Pipeline redirect (PR 46, task 2)

1. Navigate to `/customers/deals/pipeline`
2. **Expected:** Redirects to `/customers/deals?view=kanban`
3. **Expected:** Board view renders

**Notes / failures:**

---

### 16.12 Saved view pill tabs — seeded defaults (PR 67)

1. Navigate to `/tasks`
2. **Expected:** Pill tabs visible: "All", "Overdue", "Due this week", "Done"
3. Navigate to `/customers/deals`
4. **Expected:** Pill tabs visible: "All", "Active pipeline", "Closing this month"
5. Navigate to `/customers/people`
6. **Expected:** Pill tabs visible: "All", "Buyers", "Sellers"
7. Navigate to `/customers/companies`
8. **Expected:** "All" only (no seeded defaults for companies)

**Notes / failures:**

---

### 16.13 Saved view filtering (PR 67)

1. On `/tasks`, click "Overdue" pill
2. **Expected:** Table shows only tasks with status=todo and due_date before today
3. **Expected:** URL updates to include `?savedView=<uuid>`
4. **Expected:** Search bar and filter controls are hidden/disabled
5. Click "All"
6. **Expected:** Full unfiltered task list restored, search bar reappears
7. On `/customers/deals`, click "Active pipeline"
8. **Expected:** Table shows only non-lost deals

**Notes / failures:**

---

### 16.14 Saved view URL persistence (PR 67)

1. On `/tasks`, click "Due this week"
2. Copy the URL (should contain `?savedView=<uuid>`)
3. Navigate to `/customers/deals`
4. Paste the copied URL back into the browser
5. **Expected:** Tasks page loads with "Due this week" view active
6. Add `?savedView=nonexistent-uuid` to any CRM page URL
7. **Expected:** Falls back to "All" (no error)

**Notes / failures:**

---

### 16.15 Saved view pagination reset (PR 67)

1. On `/customers/deals`, paginate to page 2 or 3
2. Click "Active pipeline" pill
3. **Expected:** Table resets to page 1, shows filtered results
4. Click "All"
5. **Expected:** Back to page 1, full list

**Notes / failures:**

---

### 16.16 Saved view realtime sync (PR 67)

1. Open `/customers/deals` in the browser
2. In a separate chat window, ask the agent: "Create a view called 'Big deals' for deals in the offer stage"
3. **Expected:** "Big deals" pill appears on the deals page without refreshing
4. Ask the agent: "Delete the Big deals view"
5. **Expected:** Pill disappears without refreshing

**Notes / failures:**

---

### 16.17 Saved view pills — mobile scroll (PR 67)

1. Resize browser to 375px width (mobile)
2. Navigate to `/tasks` (has 4 pills: All, Overdue, Due this week, Done)
3. **Expected:** Pills scroll horizontally, no layout breakage
4. Scroll to reveal all pills, click one
5. **Expected:** View filtering works on mobile

**Notes / failures:**

---

### 16.17a Saved workspace layout + open mode (KISS CRM UX foundation)

1. Create or seed a deals saved view whose state uses `viewType=kanban` and `openMode=page`
2. Navigate to `/customers/deals?savedView=<uuid>`
3. **Expected:** Deals surface loads directly in board mode
4. Click a deal card
5. **Expected:** Navigates to `/customers/deals/<dealId>` instead of opening the drawer
6. Use browser Back
7. **Expected:** Returns to `/customers/deals?savedView=<uuid>` with the same saved workspace active

**Notes / failures:**

---

### 16.17b Drawer quick peek + full page deep work (KISS CRM UX foundation)

1. Navigate to `/customers/people`, click a person row from **All**
2. **Expected:** Drawer opens for quick inspection
3. Click **Open page** in the detail header
4. **Expected:** Navigates to `/customers/people/<contactId>`
5. Repeat on `/customers/companies` and `/customers/deals`
6. **Expected:** Companies and Deals also have full pages; Tasks remain drawer-only
7. Compare the drawer and full page for the same record
8. **Expected:** Tabs, editable fields, timeline, notes, and files are the same underlying content

**Notes / failures:**

---

### PR 46a: Timeline Audit Log

### 16.18 Contact drawer — Timeline tab (PR 46a)

1. Navigate to `/customers/people`, click a contact to open the drawer
2. Click the **Timeline** tab
3. **Expected:** Timeline loads with month-grouped entries (e.g., "April 2026")
4. **Expected:** Creation event visible at the bottom (e.g., "Sarah Tan was created by You")
5. If interactions exist, **Expected:** Interaction rows show type + contact name (e.g., "Call with Sarah Tan")
6. If interactions exist, **Expected:** Interaction summary text visible below the title

**Notes / failures:**

---

### 16.19 Timeline — update audit with before→after diff (PR 46a)

1. Open a contact drawer, note the current phone number
2. Quick-edit the phone field to a new value, confirm
3. Switch to the Timeline tab
4. **Expected:** A new "You updated Phone" entry appears at the top
5. **Expected:** Old value shown with strikethrough, arrow, then new value
6. Quick-edit email and type on the same contact within ~1 minute
7. Switch to Timeline tab
8. **Expected:** Fields merged into one entry: "You updated 2 fields on {Name}"
9. Click the expand chevron
10. **Expected:** Both field diffs visible with before→after transitions

**Notes / failures:**

---

### 16.20 Timeline — multi-field dedup merge (PR 46a)

1. On `/customers/deals`, open a deal drawer
2. Quick-edit the stage (e.g., Leads → Negotiation)
3. Within 30 seconds, quick-edit the amount
4. Switch to Timeline tab
5. **Expected:** Both changes merged into a single timeline entry (not two separate rows)
6. **Expected:** Entry shows "You updated 2 fields on {Deal}"
7. Expand and verify: Stage shows "Leads → Negotiation", Amount shows old → new

**Notes / failures:**

---

### 16.21 Timeline — vocab labels not raw values (PR 46a)

1. Open a contact, quick-edit the type field (e.g., "buyer" → "seller")
2. Switch to Timeline tab
3. **Expected:** Diff shows "Buyer → Seller" (title-cased), NOT "buyer → seller"
4. On a deal, change stage from "leads" to "offer"
5. **Expected:** Diff shows "Leads → Offer", NOT raw enum values
6. On a task, change status from "todo" to "in_progress"
7. **Expected:** Diff shows "Todo → In Progress"

**Notes / failures:**

---

### 16.22 Company drawer — Timeline tab added (PR 46a)

1. Navigate to `/customers/companies`, open a company drawer
2. **Expected:** Tab bar includes a "Timeline" tab (alongside Home, Notes, Files, etc.)
3. Click Timeline
4. **Expected:** Shows audit history for the company (creation event at minimum)
5. Quick-edit the company phone, return to Timeline
6. **Expected:** "You updated Phone" entry with before→after

**Notes / failures:**

---

### 16.23 Task drawer — Timeline tab added (PR 46a)

1. Navigate to `/tasks`, open a task drawer
2. **Expected:** Tab bar includes "Timeline" tab
3. Click Timeline
4. **Expected:** Shows creation event and any status/due-date changes
5. Change the task status via quick edit, return to Timeline
6. **Expected:** "You updated Status" entry with before→after (e.g., "Todo → Done")

**Notes / failures:**

---

### 16.24 Timeline — agent-authored audit entries (PR 46a)

1. In chat, ask the agent: "Update Sarah Tan's phone to +6591234567"
2. Open Sarah Tan's contact drawer → Timeline tab
3. **Expected:** Entry shows "Sunder updated Phone" (not "You")
4. **Expected:** Phone diff shows old value → +6591234567
5. In chat, ask the agent: "Create a new company called TestCo"
6. Open TestCo's company drawer → Timeline tab
7. **Expected:** "TestCo was created by Sunder"

**Notes / failures:**

---

### 16.25 Timeline — realtime updates (PR 46a)

1. Open a contact drawer to the Timeline tab
2. In a separate browser tab, quick-edit a field on the same contact
3. **Expected:** Timeline updates in the first tab without manual refresh

**Notes / failures:**

---

## Edge Cases

- [ ] Saved view with symbolic date ($today) — "Overdue" shows correct tasks relative to current date
- [ ] Delete a seeded default view → it's gone, not re-created until next signup
- [ ] Switch saved view while on board/kanban layout — filters apply to board too
- [ ] Quick edit with invalid data (e.g., non-numeric price) — validation error shown, edit stays open
- [ ] Quick edit on mobile — opens one-field dialog instead of inline editor
- [ ] Empty board column (no deals in a stage) — column renders, not hidden
- [ ] Calendar month with no tasks — empty grid, no crash
- [ ] Board with 20+ deals in one stage — column scrolls or wraps
- [ ] Quick edit two fields rapidly on same row — no race condition
- [ ] Row click on non-editable cell — navigates to detail page (not blocked by quick edit)
- [ ] Deals board does NOT have drag-and-drop — uses explicit stage selector instead
- [ ] Timeline empty state — new record with no edits shows only creation event
- [ ] Timeline with company_id change — shows "Company Changed" not a raw UUID
- [ ] Timeline audit capture failure doesn't block the CRM mutation (network error on RPC)
- [ ] Timeline dedup window — edits 11+ minutes apart produce separate entries
- [ ] Timeline on record with 50+ audit entries — loads without performance issues

---

## Pass / Fail Criteria

- **Pass:** View toggles work and persist ad hoc preference. Board shows deals by stage with working stage movement. Calendar shows tasks by date with day drill-down. Quick edit works for high-value fields on all entity pages. Filters carry across views. Drawer quick-peek and full record pages both work for People, Companies, and Deals. Saved workspaces restore mode/open behavior, persist via URL, reset pagination, update via realtime, and never crash on stale ids. Timeline tab visible on all four drawer types. Audit entries show before→after diffs with human-readable labels. Rapid edits merge within 10 minutes. Agent-authored changes attributed to "Sunder". Timeline updates in realtime.
- **Fail:** Shared shell drifts across CRM pages. Row click ignores saved view open mode. Full pages and drawers diverge. Saved view pills missing, filtering broken, stale after agent creates view, or malformed state crashes a page. Timeline tab missing from any drawer. Raw UUIDs or enum values shown in diffs. Audit capture blocks or fails the CRM mutation. Dedup merge loses the original "before" snapshot.
