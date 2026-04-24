# CRM Hot Path Performance Implementation Plan

**Goal:** Make the customer CRM hot paths feel snappy by containing avoidable rerenders and making inline edits show up immediately.

**Architecture:** Keep the existing Next.js client-route structure, TanStack Query cache, and `QuickEditCell`/`ListTable`/`KanbanBoard` primitives. Fix the actual hot-path regressions with narrow changes: memoize the shared cell, stabilize callsite props on the three customer pages, remove unstable empty-filter objects, and add optimistic cache writes for deal/company/contact edits and deletes. Do not swap table libraries, add a new global state layer, or redesign the drawer URL model.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query v5, TanStack Table, Supabase JS, Vitest, React Testing Library

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Files

- Modify: `src/components/crm/quick-edit-cell.tsx`
- Modify: `src/components/crm/__tests__/quick-edit-cell.test.tsx`
- Modify: `src/components/ui/list-table.tsx`
- Modify: `src/components/ui/__tests__/list-table.test.tsx`
- Modify: `src/components/crm/kanban-board.tsx`
- Modify: `src/components/crm/__tests__/kanban-board.test.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `src/hooks/use-companies.ts`
- Modify: `src/hooks/__tests__/use-companies.test.tsx`
- Modify: `src/hooks/use-update-deal.ts`
- Modify: `src/hooks/__tests__/use-update-deal.test.ts`
- Modify: `src/hooks/use-update-company.ts`
- Modify: `src/hooks/__tests__/use-update-company.test.ts`
- Modify: `src/hooks/use-update-contact.ts`
- Modify: `src/hooks/__tests__/use-update-contact.test.ts`

## Skills To Use

- `@nextjs-best-practices` for server/client boundary discipline and route-level conventions
- `@vercel-react-best-practices` for `rerender-memo`, `rerender-dependencies`, `rerender-memo-with-default-value`, and `client-swr-dedup`
- `@test-driven-development` for every parent task
- `@requesting-code-review` after each parent task is green

## Parallel Ownership Boundary

- This tasklist owns the three customer list pages and their shared CRM list/edit primitives.
- Do **not** touch `app/(dashboard)/tasks/page.tsx`, `src/lib/crm/task-columns.tsx`, or chat/settings files here. Those belong to the other tasklists.
- `useRecordDrawer()` is already stable enough. Do **not** refactor it in this batch.

## Notes

- Keep the solution boring. The codebase already knows how to use `useMemo`, `useCallback`, `React.memo`, and TanStack Query optimistic cache writes.
- If `QuickEditCell` gets memoized, the default `options = []` pattern must also be fixed or the memo boundary will be noisy.
- Keep JSDoc/module comments intact.
- Use semantic tokens only. Do not introduce raw Tailwind palette classes.

---

### Task 1: Memoize `QuickEditCell` safely

**Files:**
- Modify: `src/components/crm/quick-edit-cell.tsx`
- Modify: `src/components/crm/__tests__/quick-edit-cell.test.tsx`

**Step 1: Write the failing test**

Add a render-count regression test to `src/components/crm/__tests__/quick-edit-cell.test.tsx`:

```tsx
it("does not rerender when the parent rerenders with identical props", async () => {
  const renderSpy = vi.fn();

  const Harness = ({ tick }: { tick: number }) => {
    renderSpy(tick);
    return (
      <QuickEditCell
        ariaLabel="Stage"
        value="lead"
        type="select"
        options={[{ value: "lead", label: "Lead" }]}
        onSave={vi.fn()}
      />
    );
  };

  const { rerender } = render(<Harness tick={1} />);
  rerender(<Harness tick={2} />);

  expect(renderSpy).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: /stage/i })).toBeInTheDocument();
});
```

Then replace `renderSpy` with a child render counter inside the cell test harness so the assertion proves the **child** did not rerender.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/quick-edit-cell.test.tsx
```

Expected: FAIL because `QuickEditCell` rerenders on the second parent render.

**Step 3: Write minimal implementation**

Refactor `src/components/crm/quick-edit-cell.tsx` to use a memoized implementation with a stable empty options constant:

```tsx
const EMPTY_OPTIONS: QuickEditOption[] = [];

function QuickEditCellImpl({
  ariaLabel,
  value,
  displayValue,
  hideDisplayValue = false,
  type = "text",
  inputType,
  options = EMPTY_OPTIONS,
  parseValue,
  onSave,
  children,
}: QuickEditCellProps) {
  // existing body
}

export const QuickEditCell = React.memo(QuickEditCellImpl);
```

If a specific prop still defeats memo, add a targeted `areEqual` function instead of broad deep comparison.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/quick-edit-cell.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/crm/quick-edit-cell.tsx \
        src/components/crm/__tests__/quick-edit-cell.test.tsx
git commit -m "perf(prXX): memoize quick edit cell"
```

---

### Task 2: Stabilize the Deals page cell props and list/board callbacks

**Files:**
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `src/components/ui/__tests__/list-table.test.tsx`
- Modify: `src/components/crm/__tests__/kanban-board.test.tsx`

**Step 1: Write the failing tests**

Add a page-level regression test in `app/(dashboard)/customers/deals/__tests__/page.test.tsx` that rerenders the page with the same mock data and asserts the shared callback props stay referentially stable:

```tsx
it("reuses stable row and board callbacks across rerenders", async () => {
  const { rerender } = render(<DealsPage />);

  const firstListProps = mockedListTable.mock.calls.at(-1)?.[0];
  const firstBoardProps = mockedKanbanBoard.mock.calls.at(-1)?.[0];

  rerender(<DealsPage />);

  const secondListProps = mockedListTable.mock.calls.at(-1)?.[0];
  const secondBoardProps = mockedKanbanBoard.mock.calls.at(-1)?.[0];

  expect(secondListProps.onRowClick).toBe(firstListProps.onRowClick);
  expect(secondListProps.getRowId).toBe(firstListProps.getRowId);
  expect(secondListProps.rowActions).toBe(firstListProps.rowActions);
  expect(secondBoardProps.groupBy).toBe(firstBoardProps.groupBy);
  expect(secondBoardProps.getItemId).toBe(firstBoardProps.getItemId);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run "app/(dashboard)/customers/deals/__tests__/page.test.tsx"
```

Expected: FAIL because inline functions are recreated on every render.

**Step 3: Write minimal implementation**

In `app/(dashboard)/customers/deals/page.tsx`:

- memoize `stages.map(...)` options in `DealStageCell`
- memoize all `onSave` handlers with `useCallback`
- memoize page-level table and board callbacks

Use this shape:

```tsx
const stageOptions = useMemo(
  () =>
    stages.map((nextStage) => ({
      value: nextStage,
      label: formatCrmEnumLabel(nextStage),
    })),
  [stages],
);

const handleSaveStage = useCallback(
  async (nextValue: QuickEditValue) => {
    await updateDeal.mutateAsync({ stage: nextValue as Deal["stage"] });
  },
  [updateDeal],
);

const handleDealRowClick = useCallback((row: DealWithContact) => {
  open(row.deal_id);
}, [open]);

const getDealRowId = useCallback((row: DealWithContact) => row.deal_id, []);

const getDealRowActions = useCallback((row: DealWithContact) => [
  { id: "view", label: "View", onSelect: () => open(row.deal_id) },
  {
    id: "delete",
    label: "Delete",
    destructive: true,
    onSelect: () => {
      if (!window.confirm(`Delete ${row.address}? This cannot be undone.`)) return;
      deleteDeal.mutate({ dealId: row.deal_id });
    },
  },
], [deleteDeal, open]);
```

**Step 4: Run the focused suite**

Run:

```bash
pnpm vitest run "app/(dashboard)/customers/deals/__tests__/page.test.tsx" \
  src/components/ui/__tests__/list-table.test.tsx \
  src/components/crm/__tests__/kanban-board.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/'(dashboard)'/customers/deals/page.tsx \
        app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
        src/components/ui/__tests__/list-table.test.tsx \
        src/components/crm/__tests__/kanban-board.test.tsx
git commit -m "perf(prXX): stabilize deals list callbacks"
```

---

### Task 3: Stabilize the Companies and People pages and remove unstable empty filter objects

**Files:**
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `src/hooks/use-companies.ts`
- Modify: `src/hooks/__tests__/use-companies.test.tsx`

**Step 1: Write the failing tests**

Add one focused test per page proving the shared row callbacks are stable after rerender, and one hook test proving the empty-filters query key is stable:

```tsx
it("reuses the same query key for the shared empty company filter", () => {
  const first = companiesQueryOptions(EMPTY_COMPANY_FILTERS).queryKey;
  const second = companiesQueryOptions(EMPTY_COMPANY_FILTERS).queryKey;

  expect(second).toBe(first);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run "app/(dashboard)/customers/companies/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/people/__tests__/page.test.tsx" \
  src/hooks/__tests__/use-companies.test.tsx
```

Expected: FAIL because the page callbacks and empty filter objects are unstable.

**Step 3: Write minimal implementation**

1. In `src/hooks/use-companies.ts`, export a shared empty filter constant:

```ts
export const EMPTY_COMPANY_FILTERS: CompanyFilters = {};
```

2. Replace `useCompanies({})` callsites with:

```tsx
const { data: companies = [] } = useCompanies(EMPTY_COMPANY_FILTERS);
```

3. In both page files, memoize `options` arrays and `onSave` handlers, then memoize:
- `rowActions`
- `onRowClick`
- `getRowId`

**Step 4: Run the focused suite**

Run:

```bash
pnpm vitest run "app/(dashboard)/customers/companies/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/people/__tests__/page.test.tsx" \
  src/hooks/__tests__/use-companies.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/'(dashboard)'/customers/companies/page.tsx \
        app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
        app/'(dashboard)'/customers/people/page.tsx \
        app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
        src/hooks/use-companies.ts \
        src/hooks/__tests__/use-companies.test.tsx
git commit -m "perf(prXX): stabilize company and people list props"
```

---

### Task 4: Add optimistic cache updates for deal/company/contact edits and customer-page deletes

**Files:**
- Modify: `src/hooks/use-update-deal.ts`
- Modify: `src/hooks/__tests__/use-update-deal.test.ts`
- Modify: `src/hooks/use-update-company.ts`
- Modify: `src/hooks/__tests__/use-update-company.test.ts`
- Modify: `src/hooks/use-update-contact.ts`
- Modify: `src/hooks/__tests__/use-update-contact.test.ts`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`

**Step 1: Write the failing tests**

For each update hook, add a focused optimistic-cache test:

```ts
it("patches the cached deal immediately in onMutate and rolls back on error", async () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(dealKeys.detail("deal-1"), {
    deal_id: "deal-1",
    stage: "lead",
  });

  const mutation = renderHook(() => useUpdateDeal("deal-1"), { wrapper: withQueryClient(queryClient) });

  act(() => {
    mutation.result.current.mutate({ stage: "qualified" });
  });

  expect(queryClient.getQueryData(dealKeys.detail("deal-1"))).toMatchObject({
    stage: "qualified",
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-contact.test.ts
```

Expected: FAIL because the cache only updates in `onSuccess`.

**Step 3: Write minimal implementation**

Add `onMutate`/rollback to each hook:

```ts
onMutate: async (updates) => {
  await queryClient.cancelQueries({ queryKey: dealKeys.all });

  const previousDetail = queryClient.getQueryData(dealKeys.detail(dealId));
  applyCommittedRecordPatch<DealWithContact>({
    queryClient,
    detailKey: dealKeys.detail(dealId),
    listKeyPrefix: dealKeys.lists(),
    idKey: "deal_id",
    recordId: dealId,
    updates,
  });

  return { previousDetail };
},
onError: (_error, _updates, context) => {
  if (context?.previousDetail) {
    queryClient.setQueryData(dealKeys.detail(dealId), context.previousDetail);
  }
  void queryClient.invalidateQueries({ queryKey: dealKeys.all });
},
```

For the three page-level delete mutations, remove the deleted row from the cached paginated/list data inside `onMutate`, then rollback on `onError`.

**Step 4: Run the focused suite**

Run:

```bash
pnpm vitest run src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-contact.test.ts \
  "app/(dashboard)/customers/deals/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/companies/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/people/__tests__/page.test.tsx"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-update-deal.ts \
        src/hooks/__tests__/use-update-deal.test.ts \
        src/hooks/use-update-company.ts \
        src/hooks/__tests__/use-update-company.test.ts \
        src/hooks/use-update-contact.ts \
        src/hooks/__tests__/use-update-contact.test.ts \
        app/'(dashboard)'/customers/deals/page.tsx \
        app/'(dashboard)'/customers/companies/page.tsx \
        app/'(dashboard)'/customers/people/page.tsx
git commit -m "perf(prXX): add optimistic customer crm mutations"
```

---

### Task 5: Run the hot-path regression suite and do manual QA on the three customer routes

**Files:**
- No new code. Verification only.

**Step 1: Run the focused automated suite**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/quick-edit-cell.test.tsx \
  src/components/ui/__tests__/list-table.test.tsx \
  src/components/crm/__tests__/kanban-board.test.tsx \
  src/hooks/__tests__/use-companies.test.tsx \
  src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-contact.test.ts \
  "app/(dashboard)/customers/deals/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/companies/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/people/__tests__/page.test.tsx"
```

Expected: PASS.

**Step 2: Start the app**

Run:

```bash
pnpm dev
```

Expected: local app starts on an available port.

**Step 3: Manual QA**

Verify in the browser:

- `/customers/deals`: sorting, page changes, drawer open, inline stage edit, inline amount edit, delete
- `/customers/companies`: inline industry edit, drawer open, delete
- `/customers/people`: inline type/company edit, drawer open, delete
- pipeline drag still moves immediately

Expected: inline edits visibly update before the roundtrip completes; opening the drawer or changing sort should no longer make every editable cell feel sticky.

**Step 4: Commit**

```bash
git add .
git commit -m "test(prXX): verify crm hot path perf fixes"
```
