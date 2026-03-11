# CRM Working Surfaces Implementation Plan

**PR:** PR 46: CRM working surfaces (views + direct editing)
**Decisions:** FOUND-05, DATA-01, DATA-07, DATA-09, UX-02, TASKLET-01
**Goal:** Make deals, tasks, people, and companies feel like working surfaces by unifying views where useful and letting users fix small mistakes without leaving the current surface.

**Architecture:** Build on the active `/customers/*` and `/tasks` routes, not the legacy `/crm/*` redirect stubs. Reuse the current TanStack Query/Table list pages, Supabase mutation hooks, and existing full detail pages/drawers. Keep the scope narrow: labelled view switching where it matters, a simple task calendar, deal stage movement from the board via explicit controls, and high-value quick edit affordances only. No saved views, no report layer, no generic object-view framework, no shared workspace-shell abstraction, and no spreadsheet editing.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, TanStack Table, Supabase PostgREST + Realtime, ShadCN UI, `@dnd-kit/core`, `@dnd-kit/sortable`, date-fns, Vitest + React Testing Library

**Design Docs:** `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md`, `docs/product/designs/2026-03-04-crm-ux-upgrade-design.md`
**Skills:** `@test-driven-development`, `@responsive-design`, `@nextjs-best-practices`

## Context You Need Before Touching Code

- Active user-facing CRM pages live under `/customers/*` plus `/tasks`; `/crm/*` is legacy redirect code only.
- People, companies, and deals already have full detail pages with `InlineEditField`. Tasks already edit inside `RecordDrawer`.
- The shared `DataTable` and `FilterBar` already provide title/search/filter chrome, but `Perspectives` and `Export` are placeholder buttons today. Do not accidentally turn this PR into a saved views/export project.
- `PR 42a` already owns the phrase “agent-generated views.” Use “working surfaces” consistently in code comments, docs, and commits to avoid name collision.
- Full detail pages stay. This PR adds narrow quick edits for small corrections only.
- If drag-and-drop slips late, board copy must stop promising drag.

## Guardrails

- Keep People and Companies table-first.
- Keep Deals as table + board only.
- Keep Tasks as table + board + calendar only.
- Preserve current full detail pages and task drawer for heavier edits.
- Do not add saved views, named perspectives, a report surface, bulk edit, or spreadsheet-style arbitrary cell editing.
- Use boring primitives already in the repo before adding new dependencies.

## Bite-Sized Step Granularity

Each step is one action (2-5 minutes):
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Relevant Files

### New Files
- `src/components/crm/quick-edit-cell.tsx`
- `src/components/crm/__tests__/quick-edit-cell.test.tsx`
- `src/components/crm/deal-stage-menu.tsx`
- `src/components/crm/__tests__/deal-stage-menu.test.tsx`
- `src/components/crm/task-calendar.tsx`
- `src/components/crm/__tests__/task-calendar.test.tsx`
- `src/components/crm/task-quick-actions.tsx`
- `src/components/crm/__tests__/task-quick-actions.test.tsx`
- `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- `app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx`
- `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- `app/(dashboard)/customers/companies/__tests__/page.test.tsx`

### Existing Files To Modify
- `src/components/crm/view-toggle.tsx`
- `src/components/crm/__tests__/view-toggle.test.tsx`
- `src/hooks/use-view-preference.ts`
- `src/hooks/__tests__/use-view-preference.test.ts`
- `src/components/crm/kanban-board.tsx`
- `src/components/crm/__tests__/kanban-board.test.tsx`
- `src/hooks/use-deals.ts`
- `src/hooks/__tests__/use-deals.test.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `app/(dashboard)/customers/deals/pipeline/page.tsx`
- `src/components/crm/deal-kanban-card.tsx`
- `src/hooks/use-update-deal.ts`
- `src/hooks/__tests__/use-update-deal.test.ts`
- `app/(dashboard)/customers/people/page.tsx`
- `src/hooks/use-update-contact.ts`
- `src/hooks/__tests__/use-update-contact.test.ts`
- `app/(dashboard)/tasks/page.tsx`
- `app/(dashboard)/tasks/__tests__/page.test.tsx`
- `src/components/crm/crm-tasks-table.tsx`
- `src/components/crm/task-kanban-card.tsx`
- `src/hooks/use-update-crm-task.ts`
- `src/hooks/__tests__/use-update-crm-task.test.ts`
- `app/(dashboard)/customers/companies/page.tsx`
- `src/hooks/use-update-company.ts`
- `src/hooks/__tests__/use-update-company.test.ts`
- `src/components/ui/filter-bar.tsx`
- `src/components/ui/__tests__/filter-bar.test.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/ui/__tests__/data-table.test.tsx`
- `docs/qa/04-crm-pages.md`

## Task Overview

| Task | Outcome |
| --- | --- |
| 1 | Labelled view toggle + view preference alignment |
| 2 | Reusable quick-edit primitive for dense list surfaces |
| 3 | One Deals workspace with preserved sort, explicit board stage actions, and table quick edit |
| 4 | People list quick edit |
| 5 | Simple Tasks calendar + task surface quick actions |
| 6 | Companies list quick edit |
| 7 | Dead-control cleanup, copy alignment, QA docs, regression sweep |

### Task 1: Labelled View Toggle + View Preference Alignment

**Files:**
- Modify: `src/components/crm/view-toggle.tsx`
- Test: `src/components/crm/__tests__/view-toggle.test.tsx`
- Modify: `src/hooks/use-view-preference.ts`
- Test: `src/hooks/__tests__/use-view-preference.test.ts`

**Check before coding:**
- `app/(dashboard)/tasks/page.tsx`
- `src/components/ui/filter-bar.tsx`
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` sections 7.1 and 10

**Step 1: Write the failing test for the 3-state toggle**

```tsx
it("renders labelled buttons for table, board, and calendar", () => {
  render(
    <ViewToggle
      current="table"
      views={["table", "kanban", "calendar"]}
      onChange={onChange}
    />,
  );

  expect(screen.getByRole("button", { name: /table/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /board/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /calendar/i })).toBeInTheDocument();
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/components/crm/__tests__/view-toggle.test.tsx`  
Expected: FAIL because `calendar` is not a valid view and the current toggle is icon-only.

**Step 3: Implement the minimal toggle change**

```tsx
const viewMeta = {
  table: { label: "Table", icon: "table" },
  kanban: { label: "Board", icon: "kanban" },
  calendar: { label: "Calendar", icon: "calendar" },
} as const;
```

- Keep `kanban` as the internal value.
- Render the user-facing label as `Board`.
- Show icon + label on desktop.
- Keep accessible labels on every viewport.

**Step 4: Run the toggle test to verify it passes**

Run: `pnpm test:run src/components/crm/__tests__/view-toggle.test.tsx`  
Expected: PASS

**Step 5: Write the failing hook test for calendar persistence**

```tsx
it("persists calendar as a valid view", () => {
  const { result } = renderHook(() => useViewPreference("tasks"));

  act(() => {
    result.current.setView("calendar");
  });

  expect(result.current.view).toBe("calendar");
  expect(localStorage.getItem("view-tasks")).toBe("calendar");
});
```

**Step 6: Run the hook test to verify it fails**

Run: `pnpm test:run src/hooks/__tests__/use-view-preference.test.ts`  
Expected: FAIL because `calendar` is not part of `ViewType`.

**Step 7: Implement the minimal hook change**

```ts
export type ViewType = "table" | "kanban" | "calendar";
const validViews = new Set<ViewType>(["table", "kanban", "calendar"]);
```

Do not add server persistence. Keep local storage.

**Step 8: Run the hook test to verify it passes**

Run: `pnpm test:run src/hooks/__tests__/use-view-preference.test.ts`  
Expected: PASS

**Step 9: Run the view-toggle and preference tests**

Run: `pnpm test:run src/components/crm/__tests__/view-toggle.test.tsx src/hooks/__tests__/use-view-preference.test.ts`  
Expected: PASS

**Step 10: Commit**

```bash
git add src/components/crm/view-toggle.tsx \
  src/components/crm/__tests__/view-toggle.test.tsx \
  src/hooks/use-view-preference.ts \
  src/hooks/__tests__/use-view-preference.test.ts
git commit -m "feat(pr46): add labelled crm view toggle and calendar preference"
```

### Task 2: QuickEditCell Primitive

**Files:**
- Create: `src/components/crm/quick-edit-cell.tsx`
- Test: `src/components/crm/__tests__/quick-edit-cell.test.tsx`

**Check before coding:**
- `src/components/crm/inline-edit-field.tsx`
- `src/hooks/use-mobile.ts`
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` section 8

**Implementation rule:** Do not refactor `InlineEditField` into a big shared abstraction first. Build a compact sibling component for dense surfaces and reuse only the helpers and behavior patterns that matter: enter-to-save, escape-to-cancel, blur save, saved indicator, visible error state, explicit parse/format hooks, and legal mobile detection via `useIsMobile`.

**Step 1: Write the failing text-edit test**

```tsx
it("saves a text value on Enter without triggering row navigation", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onNavigate = vi.fn();
  const user = userEvent.setup();

  render(
    <div onClick={onNavigate}>
      <QuickEditCell ariaLabel="Phone" value="91234567" onSave={onSave} />
    </div>,
  );

  await user.click(screen.getByText("91234567"));
  await user.clear(screen.getByRole("textbox", { name: /phone/i }));
  await user.type(screen.getByRole("textbox", { name: /phone/i }), "90000000{Enter}");

  expect(onSave).toHaveBeenCalledWith("90000000");
  expect(onNavigate).not.toHaveBeenCalled();
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: FAIL with module not found.

**Step 3: Add two more failing tests before writing implementation**

- `Escape` restores the original value and does not call `onSave`
- a rejected `onSave` shows visible error text and keeps the editor open
- number fields call a parser before save and keep the editor open on parse failure

**Step 4: Run the full QuickEditCell test file**

Run: `pnpm test:run src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: FAIL on all new behaviors

**Step 5: Implement the minimal component**

```tsx
type QuickEditCellType = "text" | "number" | "select" | "date";

interface QuickEditCellProps {
  ariaLabel: string;
  value: string | number | null;
  displayValue?: string | null;
  type?: QuickEditCellType;
  options?: Array<{ value: string; label: string }>;
  parseValue?: (draft: string) => { ok: true; value: string | number | null } | { ok: false; message: string };
  onSave: (value: string | number | null) => Promise<void> | void;
}
```

- Stop propagation on every clickable child.
- Desktop: keep existing read-mode affordance explicit, then edit inline.
- Mobile: open a one-field sheet/dialog using `useIsMobile`.
- Keep the saved checkmark brief and explicit.
- Show a visible error message on failed save. Do not swallow the error silently.

**Step 6: Add the failing mobile test**

```tsx
it("opens a one-field mobile editor when useIsMobile returns true", async () => {
  vi.mocked(useIsMobile).mockReturnValue(true);
  const user = userEvent.setup();

  render(<QuickEditCell ariaLabel="Stage" value="leads" type="select" options={[{ value: "leads", label: "Leads" }]} onSave={vi.fn()} />);

  await user.click(screen.getByText(/leads/i));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
```

**Step 7: Run the mobile test to verify it fails**

Run: `pnpm test:run src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: FAIL because mobile mode is not implemented yet.

**Step 8: Implement the mobile fallback**

- Use the same field control types as desktop.
- Keep Save and Cancel buttons explicit on mobile.
- Do not add multi-field editing.

**Step 9: Run the QuickEditCell tests**

Run: `pnpm test:run src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: PASS

**Step 10: Commit**

```bash
git add src/components/crm/quick-edit-cell.tsx \
  src/components/crm/__tests__/quick-edit-cell.test.tsx
git commit -m "feat(pr46): add compact quick edit cell for crm working surfaces"
```

### Task 3: Deals Workspace Unification + Board Movement

**Files:**
- Create: `src/components/crm/deal-stage-menu.tsx`
- Test: `src/components/crm/__tests__/deal-stage-menu.test.tsx`
- Create: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Create: `app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx`
- Modify: `src/hooks/use-deals.ts`
- Test: `src/hooks/__tests__/use-deals.test.tsx`
- Modify: `src/components/crm/kanban-board.tsx`
- Test: `src/components/crm/__tests__/kanban-board.test.tsx`
- Modify: `src/components/crm/deal-kanban-card.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/pipeline/page.tsx`
- Modify: `src/hooks/use-update-deal.ts`
- Test: `src/hooks/__tests__/use-update-deal.test.ts`

**Check before coding:**
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` section 7.2
- `src/components/cases/cases-table.tsx` for existing `dnd-kit` usage
- `src/components/documents/documents-table.tsx` for drag-handle patterns

**Step 1: Write the failing hook test for shared board filters**

```tsx
it("applies createdAt filters to non-paginated deals queries used by board view", async () => {
  await fetchDeals({
    search: "bishan",
    stage: "offer",
    createdAt: { from: "2026-03-01T00:00:00+08:00", to: "2026-03-31T23:59:59+08:00" },
  });

  expect(mockGte).toHaveBeenCalledWith("created_at", "2026-03-01T00:00:00+08:00");
  expect(mockLte).toHaveBeenCalledWith("created_at", "2026-03-31T23:59:59+08:00");
});
```

**Step 2: Run the hook test to verify it fails**

Run: `pnpm test:run src/hooks/__tests__/use-deals.test.tsx`  
Expected: FAIL because `DealFilters` does not support `createdAt` for board use.

**Step 3: Implement the minimal hook change**

- Extend `DealFilters` to include `createdAt`.
- Reuse the same `created_at` filter logic in both `fetchDeals` and `fetchPaginatedDeals`.
- Do not fork a second “board-only” filter model.

**Step 4: Run the hook tests**

Run: `pnpm test:run src/hooks/__tests__/use-deals.test.tsx`  
Expected: PASS

**Step 5: Write the failing test for the deal stage quick menu**

```tsx
it("saves a new stage from the card menu", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn().mockResolvedValue(undefined);

  render(
    <DealStageMenu
      currentStage="leads"
      stages={["leads", "offer"]}
      onChange={onChange}
    />,
  );

  await user.click(screen.getByRole("button", { name: /change stage/i }));
  await user.click(screen.getByRole("option", { name: /offer/i }));

  expect(onChange).toHaveBeenCalledWith("offer");
});
```

**Step 6: Run the stage-menu test to verify it fails**

Run: `pnpm test:run src/components/crm/__tests__/deal-stage-menu.test.tsx`  
Expected: FAIL with module not found.

**Step 7: Implement the minimal stage menu**

- Use a small trigger button or compact select.
- This is the primary board movement path in this PR.
- Reuse the configured deal stage list from CRM config.

**Step 8: Write the failing Deals page tests**

```tsx
it("renders table and board inside one deals workspace", async () => {
  render(<DealsPage />);

  expect(screen.getByRole("button", { name: /table/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /board/i })).toBeInTheDocument();
});

it("keeps search text when switching from table to board", async () => {
  const user = userEvent.setup();
  render(<DealsPage />);

  await user.type(screen.getByPlaceholderText(/search deals/i), "Bishan");
  await user.click(screen.getByRole("button", { name: /board/i }));

  expect(screen.getByDisplayValue("Bishan")).toBeInTheDocument();
});

it("redirects the legacy pipeline route to board view on the deals page", async () => {
  render(<DealsPipelinePage />);

  expect(mockRedirect).toHaveBeenCalledWith("/customers/deals?view=kanban");
});
```

**Step 9: Run the page tests to verify they fail**

Run: `pnpm test:run 'app/(dashboard)/customers/deals/__tests__/page.test.tsx' 'app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx'`  
Expected: FAIL because the page still uses separate routes and no board toggle.

**Step 10: Implement the Deals workspace**

- Move Deals to one page using existing page chrome plus `DataTable`.
- Keep one source of truth for `search` and `filterValues`.
- Use `usePaginatedDeals()` for table mode and `useDeals()` for board mode, both driven by the same filter state.
- Add `view` query param handling so `/customers/deals?view=kanban` works and accept `board` as a legacy alias on entry.
- Convert `/customers/deals/pipeline` into a redirect.
- Use `QuickEditCell` in the table for `stage` and `price`.
- Preserve the board sort controls from the pipeline page.
- Use `DealStageMenu` on the board instead of generic board drag-and-drop.
- Keep row click and card click opening the full deal page.

**Step 11: Write one more failing test for copy trust**

```tsx
it("does not promise dragging when board movement uses an explicit stage action", () => {
  render(<DealsPage />);
  expect(screen.queryByText(/drag them between lanes/i)).not.toBeInTheDocument();
  expect(screen.getByText(/move deals forward from the board/i)).toBeInTheDocument();
});
```

**Step 12: Run the trust-copy test**

Run: `pnpm test:run 'app/(dashboard)/customers/deals/__tests__/page.test.tsx'`  
Expected: FAIL if stale copy remains in the wrong place.

**Step 13: Fix the copy**

- Change the copy to “move deals forward from the board” unless drag ships later in a follow-up.

**Step 14: Run the Deals-focused suite**

Run: `pnpm test:run src/hooks/__tests__/use-deals.test.tsx src/components/crm/__tests__/deal-stage-menu.test.tsx 'app/(dashboard)/customers/deals/__tests__/page.test.tsx' 'app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx' src/hooks/__tests__/use-update-deal.test.ts`  
Expected: PASS

**Step 15: Commit**

```bash
git add src/hooks/use-deals.ts \
  src/hooks/__tests__/use-deals.test.tsx \
  src/components/crm/deal-stage-menu.tsx \
  src/components/crm/__tests__/deal-stage-menu.test.tsx \
  src/components/crm/deal-kanban-card.tsx \
  'app/(dashboard)/customers/deals/page.tsx' \
  'app/(dashboard)/customers/deals/pipeline/page.tsx' \
  'app/(dashboard)/customers/deals/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx' \
  src/hooks/use-update-deal.ts \
  src/hooks/__tests__/use-update-deal.test.ts
git commit -m "feat(pr46): unify deals workspace and add explicit board stage actions"
```

### Task 4: People List Quick Edit

**Files:**
- Create: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `src/hooks/use-update-contact.ts`
- Test: `src/hooks/__tests__/use-update-contact.test.ts`

**Check before coding:**
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` section 7.4
- `app/(dashboard)/customers/people/[contactId]/page.tsx`

**Implementation rule:** Start with the high-value fields only: phone, email, type, company. Leave notes and custom fields on the full page. Preserve read-mode link behavior where it already exists, and use an explicit edit affordance for those cells.

**Step 1: Write the failing People page tests**

```tsx
it("edits phone directly from the list without navigating away", async () => {
  const user = userEvent.setup();
  render(<PeoplePage />);

  await user.click(screen.getByText("+65 9123 4567"));
  await user.clear(screen.getByRole("textbox", { name: /phone/i }));
  await user.type(screen.getByRole("textbox", { name: /phone/i }), "+65 9000 0000{Enter}");

  expect(mockUpdateContact).toHaveBeenCalledWith({ phone: "+65 9000 0000" });
  expect(mockPush).not.toHaveBeenCalled();
});

it("keeps the name cell as the primary navigation target", async () => {
  const user = userEvent.setup();
  render(<PeoplePage />);

  await user.click(screen.getByRole("link", { name: /sarah chen/i }));

  expect(mockPush).not.toHaveBeenCalled();
});
```

**Step 2: Run the page tests to verify they fail**

Run: `pnpm test:run 'app/(dashboard)/customers/people/__tests__/page.test.tsx'`  
Expected: FAIL because the list is read-only today.

**Step 3: Implement the minimal People list edits**

- Keep the `Name` column unchanged.
- Replace `Phone`, `Email`, `Type`, and `Company` cells with tiny field-specific cell components that can legally own `useUpdateContact(contactId)`.
- Preserve `mailto:`, `tel:`, and linked-company navigation in read mode.
- Use `useCompanies({})` once for simple company options in this PR. Do not build async remote search in this PR.
- Support a `No company` option via a `__none__` sentinel value.

**Step 4: Write the failing hook test for clearing company**

```tsx
it("allows clearing company_id with a null update", async () => {
  await result.current.mutateAsync({ company_id: null });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ company_id: null }));
});
```

**Step 5: Run the hook test to verify it fails**

Run: `pnpm test:run src/hooks/__tests__/use-update-contact.test.ts`  
Expected: FAIL if null company handling is not covered or broken.

**Step 6: Implement the minimal hook fix if needed**

- Keep the hook boring.
- Do not add optimistic cache graph surgery.
- Only patch whatever the failing test proves missing.

**Step 7: Run the People-focused suite**

Run: `pnpm test:run 'app/(dashboard)/customers/people/__tests__/page.test.tsx' src/hooks/__tests__/use-update-contact.test.ts src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: PASS

**Step 8: Commit**

```bash
git add 'app/(dashboard)/customers/people/page.tsx' \
  'app/(dashboard)/customers/people/__tests__/page.test.tsx' \
  src/hooks/use-update-contact.ts \
  src/hooks/__tests__/use-update-contact.test.ts
git commit -m "feat(pr46): add people list quick edit"
```

### Task 5: Tasks Calendar + Task Surface Quick Actions

**Files:**
- Create: `src/components/crm/task-calendar.tsx`
- Test: `src/components/crm/__tests__/task-calendar.test.tsx`
- Create: `src/components/crm/task-quick-actions.tsx`
- Test: `src/components/crm/__tests__/task-quick-actions.test.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Test: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `src/components/crm/crm-tasks-table.tsx`
- Modify: `src/components/crm/task-kanban-card.tsx`
- Modify: `src/hooks/use-update-crm-task.ts`
- Test: `src/hooks/__tests__/use-update-crm-task.test.ts`

**Check before coding:**
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` section 7.3
- `src/components/ui/calendar.tsx`
- `src/components/crm/record-drawer/task-drawer-content.tsx`

**Implementation rule:** Keep Tasks at `/tasks`. Do not move it under `/customers`. Preserve the drawer for deeper edits. Start with a simple month calendar: selected day plus task list below, no drag-to-reschedule and no rich reporting chrome.

**Step 1: Write the failing calendar component tests**

```tsx
it("shows task indicators on days with due dates and lists the selected day's tasks", async () => {
  render(
    <TaskCalendar
      tasks={[
        { task_id: "t1", title: "Call buyer", status: "open", due_date: "2026-03-12T00:00:00+08:00" },
      ]}
      onOpenTask={vi.fn()}
      onUpdateTask={vi.fn()}
    />,
  );

  expect(screen.getByText("12")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /12 march 2026/i }));
  expect(screen.getByText("Call buyer")).toBeInTheDocument();
});
```

**Step 2: Run the calendar tests to verify they fail**

Run: `pnpm test:run src/components/crm/__tests__/task-calendar.test.tsx`  
Expected: FAIL with module not found.

**Step 3: Implement the minimal calendar**

- Use `src/components/ui/calendar.tsx`.
- Show day markers only for tasks with `due_date`.
- Render the selected day’s task list below the month grid.
- Do not add drag-to-reschedule.

**Step 4: Write the failing quick-actions test**

```tsx
it("updates task status from the compact task action control", async () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();

  render(
    <TaskQuickActions
      task={{ task_id: "t1", title: "Call buyer", status: "open", due_date: null }}
      onUpdate={onUpdate}
    />,
  );

  await user.click(screen.getByRole("button", { name: /quick edit task/i }));
  await user.click(screen.getByRole("option", { name: /completed/i }));

  expect(onUpdate).toHaveBeenCalledWith({ status: "completed" });
});
```

**Step 5: Run the quick-actions test to verify it fails**

Run: `pnpm test:run src/components/crm/__tests__/task-quick-actions.test.tsx`  
Expected: FAIL with module not found.

**Step 6: Implement the minimal task quick actions**

- Keep the surface very small: status select + due-date picker.
- Reuse it in the board card and the selected-day task list.
- Do not add title editing here. Keep title quick edit in the table and the drawer.

**Step 7: Write the failing Tasks page test for the third view**

```tsx
it("shows table, board, and calendar views", async () => {
  render(<TasksPage />);

  expect(screen.getByRole("button", { name: /table/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /board/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /calendar/i })).toBeInTheDocument();
});
```

**Step 8: Run the page test to verify it fails**

Run: `pnpm test:run 'app/(dashboard)/tasks/__tests__/page.test.tsx'`  
Expected: FAIL because only table + board exist today.

**Step 9: Implement the minimal Tasks page changes**

- Keep the current page shell and extend `ViewToggle` usage to three states.
- Render `CrmTasksTable` for table, `KanbanBoard` for board, and `TaskCalendar` for calendar.
- Keep `RecordDrawer` wired for deep editing.

**Step 10: Add quick edit to the table and board**

- `CrmTasksTable`: use `QuickEditCell` for `status` and `due_date` only in this PR.
- `TaskKanbanCard`: add a footer slot or inline `TaskQuickActions`.
- Keep card click opening the drawer when the user clicks outside the quick action control.

**Step 11: Run the Tasks-focused suite**

Run: `pnpm test:run src/components/crm/__tests__/task-calendar.test.tsx src/components/crm/__tests__/task-quick-actions.test.tsx 'app/(dashboard)/tasks/__tests__/page.test.tsx' src/hooks/__tests__/use-update-crm-task.test.ts src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: PASS

**Step 12: Commit**

```bash
git add src/components/crm/task-calendar.tsx \
  src/components/crm/__tests__/task-calendar.test.tsx \
  src/components/crm/task-quick-actions.tsx \
  src/components/crm/__tests__/task-quick-actions.test.tsx \
  'app/(dashboard)/tasks/page.tsx' \
  'app/(dashboard)/tasks/__tests__/page.test.tsx' \
  src/components/crm/crm-tasks-table.tsx \
  src/components/crm/task-kanban-card.tsx \
  src/hooks/use-update-crm-task.ts \
  src/hooks/__tests__/use-update-crm-task.test.ts
git commit -m "feat(pr46): add tasks calendar and quick task actions"
```

### Task 6: Companies List Quick Edit

**Files:**
- Create: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `src/hooks/use-update-company.ts`
- Test: `src/hooks/__tests__/use-update-company.test.ts`

**Check before coding:**
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` section 7.5
- `app/(dashboard)/customers/companies/[companyId]/page.tsx`

**Implementation rule:** Only quick-edit `phone`, `email`, `website`, and `industry`. Keep address and notes on the full page. Preserve read-mode link behavior where it already exists, and use an explicit edit affordance for those cells.

**Step 1: Write the failing Companies page tests**

```tsx
it("edits website directly from the companies list", async () => {
  const user = userEvent.setup();
  render(<CompaniesPage />);

  await user.click(screen.getByText("acme.co"));
  await user.clear(screen.getByRole("textbox", { name: /website/i }));
  await user.type(screen.getByRole("textbox", { name: /website/i }), "https://acme.com{Enter}");

  expect(mockUpdateCompany).toHaveBeenCalledWith({ website: "https://acme.com" });
});

it("does not navigate when editing industry", async () => {
  const user = userEvent.setup();
  render(<CompaniesPage />);

  await user.click(screen.getByText(/developer/i));
  expect(mockPush).not.toHaveBeenCalled();
});
```

**Step 2: Run the page tests to verify they fail**

Run: `pnpm test:run 'app/(dashboard)/customers/companies/__tests__/page.test.tsx'`  
Expected: FAIL because the list is read-only.

**Step 3: Implement the minimal Companies list edits**

- Keep `Name`, `Contacts`, and `Deals` read-only.
- Replace `Industry`, `Phone`, `Email`, and `Website` with tiny field-specific cell components using `QuickEditCell`.
- Preserve `tel:`, `mailto:`, and website navigation in read mode.
- Reuse the same configured company industry list already used by filters/detail page.

**Step 4: Write the failing hook test for empty website**

```tsx
it("allows clearing website to null", async () => {
  await result.current.mutateAsync({ website: null });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ website: null }));
});
```

**Step 5: Run the hook test to verify it fails**

Run: `pnpm test:run src/hooks/__tests__/use-update-company.test.ts`  
Expected: FAIL if null clearing is not covered.

**Step 6: Implement the minimal hook fix if needed**

- Keep the hook boring and patch only the proven gap.

**Step 7: Run the Companies-focused suite**

Run: `pnpm test:run 'app/(dashboard)/customers/companies/__tests__/page.test.tsx' src/hooks/__tests__/use-update-company.test.ts src/components/crm/__tests__/quick-edit-cell.test.tsx`  
Expected: PASS

**Step 8: Commit**

```bash
git add 'app/(dashboard)/customers/companies/page.tsx' \
  'app/(dashboard)/customers/companies/__tests__/page.test.tsx' \
  src/hooks/use-update-company.ts \
  src/hooks/__tests__/use-update-company.test.ts
git commit -m "feat(pr46): add companies list quick edit"
```

### Task 7: Dead-Control Cleanup, Copy Alignment, QA Docs, Regression Sweep

**Files:**
- Modify: `src/components/ui/filter-bar.tsx`
- Test: `src/components/ui/__tests__/filter-bar.test.tsx`
- Modify: `src/components/ui/data-table.tsx`
- Test: `src/components/ui/__tests__/data-table.test.tsx`
- Modify: `docs/qa/04-crm-pages.md`

**Check before coding:**
- `docs/product/designs/2026-03-11-crm-views-and-direct-editing-dench-adaptation.md` sections 10, 11, and 13
- `app/(dashboard)/customers/deals/pipeline/page.tsx`

**Implementation rule:** If a control has no real behavior in this PR, remove it from the rendered surface rather than leaving a dead button.

**Step 1: Write the failing filter-bar test**

```tsx
it("does not render Perspectives unless a real handler is provided", () => {
  render(<FilterBar filters={[sampleFilter]} values={{}} onApply={vi.fn()} onClear={vi.fn()} />);

  expect(screen.queryByRole("button", { name: /perspectives/i })).not.toBeInTheDocument();
});
```

**Step 2: Run the filter-bar test to verify it fails**

Run: `pnpm test:run src/components/ui/__tests__/filter-bar.test.tsx`  
Expected: FAIL because the button is rendered unconditionally today.

**Step 3: Implement the minimal cleanup**

- Gate `Perspectives` behind an explicit prop, or remove it entirely for now.
- Gate `Export` in `DataTable` behind an explicit prop instead of always showing it.
- Do not build export or perspectives functionality in this PR.
- Keep this change in a small isolated commit inside PR 46.

**Step 4: Write the failing QA-doc update task**

- Add a checklist section to `docs/qa/04-crm-pages.md` for:
  - Deals table ↔ board switching
  - Deal board movement
  - People quick edit
  - Tasks calendar
  - Companies quick edit
  - Mobile quick-edit fallback

**Step 5: Update the QA doc**

- Keep the steps concrete and manual-testable.
- Use the real route names (`/customers/*`, `/tasks`).

**Step 6: Run the focused regression suite**

Run:

```bash
pnpm test:run \
  src/components/crm/__tests__/view-toggle.test.tsx \
  src/hooks/__tests__/use-view-preference.test.ts \
  src/components/crm/__tests__/quick-edit-cell.test.tsx \
  src/components/crm/__tests__/deal-stage-menu.test.tsx \
  src/components/crm/__tests__/task-calendar.test.tsx \
  src/components/crm/__tests__/task-quick-actions.test.tsx \
  'app/(dashboard)/customers/deals/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/people/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/companies/__tests__/page.test.tsx' \
  'app/(dashboard)/tasks/__tests__/page.test.tsx' \
  src/hooks/__tests__/use-deals.test.tsx \
  src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-contact.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-crm-task.test.ts \
  src/components/ui/__tests__/filter-bar.test.tsx \
  src/components/ui/__tests__/data-table.test.tsx
pnpm lint
```

Expected: PASS with no stale drag copy, no dead perspectives/export buttons, and no regression in the current full detail pages.

**Step 7: Commit**

```bash
git add src/components/ui/filter-bar.tsx \
  src/components/ui/data-table.tsx \
  docs/qa/04-crm-pages.md
git commit -m "chore(pr46): align crm controls, copy, and qa coverage"
```

## Final Verification

Run:

```bash
pnpm test:run \
  src/components/crm/__tests__/view-toggle.test.tsx \
  src/hooks/__tests__/use-view-preference.test.ts \
  src/components/crm/__tests__/quick-edit-cell.test.tsx \
  src/components/crm/__tests__/deal-stage-menu.test.tsx \
  src/components/crm/__tests__/task-calendar.test.tsx \
  src/components/crm/__tests__/task-quick-actions.test.tsx \
  'app/(dashboard)/customers/deals/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/deals/pipeline/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/people/__tests__/page.test.tsx' \
  'app/(dashboard)/customers/companies/__tests__/page.test.tsx' \
  'app/(dashboard)/tasks/__tests__/page.test.tsx' \
  src/hooks/__tests__/use-deals.test.tsx \
  src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-contact.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-crm-task.test.ts \
  src/components/ui/__tests__/filter-bar.test.tsx \
  src/components/ui/__tests__/data-table.test.tsx
pnpm lint
```

## Manual QA Checklist

- `/customers/deals`
- Switch between table and board without losing search or filters.
- Confirm legacy `?view=board` aliases to the board view and normalizes to `kanban`.
- Edit deal stage and price from the table.
- Change a deal stage from the board stage action and confirm pipeline sort still works.
- `/customers/deals/pipeline`
- Confirm redirect to `/customers/deals?view=board`.
- `/customers/people`
- Edit phone, email, type, and company without opening the person page.
- Verify clicking the name still opens the full person page.
- `/tasks`
- Switch between table, board, and calendar.
- Change due date/status from the task calendar.
- Confirm the task drawer still opens for deeper editing.
- `/customers/companies`
- Edit phone, email, website, and industry from the list.
- Mobile viewport
- Confirm quick edit opens a touch-friendly one-field editor instead of tiny inline controls.

## Notes For The Engineer

- Use the test-driven-development skill literally: no production code before a failing test.
- Prefer adding one small component per surface concern over a wide abstraction pass.
- Preserve existing link affordances in read mode where the current product already has them.
- Add explicit tests for row-click suppression, visible mutation errors, null/number/date serialization, mobile fallback, and failed stage update behavior.
- Do not revive drawer-only CRM routing. The current product already invested in full detail pages; keep them.
- Do not ship placeholder controls. If a feature is out of scope, remove the button.
- Keep commits small. One task, one focused commit.

Tasklist complete and saved to `docs/product/tasks/2026-03-11-pr46-crm-working-surfaces-tasklist.md`. Open a new session to do batch execution with checkpoint.
