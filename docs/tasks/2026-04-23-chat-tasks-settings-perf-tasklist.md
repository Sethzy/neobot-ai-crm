# Chat, Tasks, And Settings Performance Implementation Plan

**Goal:** Make chat long threads, the Tasks page, and the remaining settings client controls feel lighter without changing product behavior.

**Architecture:** Keep the existing routes, providers, and TanStack Query model. Improve the remaining rough edges with narrowly scoped client-side changes: defer the Tasks search query input, split heavy non-table task views into separate bundles, add optimistic cache writes for task edits, reduce chat long-thread rendering cost with cheap DOM-skipping techniques, and remove render-phase state updates from settings controls. Do not rewrite chat transport, add a virtualization dependency unless the focused tests prove content-visibility is insufficient, or redesign the settings surface.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query v5, Supabase JS, Vitest, React Testing Library, Tailwind 4

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Files

- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`
- Modify: `src/lib/crm/task-columns.tsx`
- Modify: `src/components/crm/__tests__/crm-tasks-table.test.tsx`
- Modify: `src/hooks/use-update-crm-task.ts`
- Modify: `src/hooks/__tests__/use-update-crm-task.test.ts`
- Create: `src/components/crm/task-kanban-view.tsx`
- Create: `src/components/crm/task-calendar-view.tsx`
- Modify: `src/components/chat/message-list.tsx`
- Create: `src/components/chat/__tests__/message-list.test.tsx`
- Modify: `app/globals.css`
- Modify: `src/components/settings/messaging-channels/telegram-connect-row.tsx`
- Modify: `src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx`
- Modify: `src/components/settings/settings-mobile-nav.tsx`
- Modify: `src/components/settings/__tests__/settings-nav.test.tsx`

## Skills To Use

- `@nextjs-best-practices` for route/client-component organization and dynamic import placement
- `@vercel-react-best-practices` for `rerender-transitions`, `rendering-content-visibility`, `bundle-dynamic-imports`, and `rerender-derived-state-no-effect`
- `@test-driven-development` for every parent task
- `@requesting-code-review` after each parent task is green

## Parallel Ownership Boundary

- This tasklist owns `tasks/page.tsx`, task edit optimism, chat message rendering, and the two settings client controls flagged by the audit.
- Do **not** touch customer pages, pricing, or route-level `loading.tsx` files here.
- Do **not** touch automations detail in this batch. The preload path already looks good enough.

## Notes

- Prefer `useDeferredValue` over `startTransition` for the Tasks search field.
- Code-split the Tasks calendar and board views, not the table view. Table is the default and hot path.
- For chat, start with `content-visibility` on older message wrappers plus a focused regression test. Only escalate to virtualization if manual QA still shows a real problem.
- Keep settings fixes boring. Remove render-phase `setState`; do not invent a new settings state container.

---

### Task 1: Defer Tasks search and split non-table task views into separate bundles

**Files:**
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`
- Create: `src/components/crm/task-kanban-view.tsx`
- Create: `src/components/crm/task-calendar-view.tsx`

**Step 1: Write the failing tests**

Add two focused regressions to `app/(dashboard)/tasks/__tests__/page.test.tsx`:

```tsx
it("passes the deferred search value into useCrmTasks", async () => {
  render(<TasksPage />);

  await userEvent.type(
    screen.getByPlaceholderText(/search tasks/i),
    "alpha",
  );

  expect(mockUseCrmTasks).toHaveBeenLastCalledWith({ search: "alpha" });
});

it("does not load the calendar bundle when the table view is active", async () => {
  render(<TasksPage />);
  expect(mockTaskCalendarView).not.toHaveBeenCalled();
});
```

Make the first test assert against the **deferred** value after the next paint, not the raw input state.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run "app/(dashboard)/tasks/__tests__/page.test.tsx"
```

Expected: FAIL because the raw `search` state flows straight into `useCrmTasks`, and all views are eagerly imported today.

**Step 3: Write minimal implementation**

1. Create `src/components/crm/task-kanban-view.tsx` and `src/components/crm/task-calendar-view.tsx` as thin wrappers around the existing kanban and calendar implementations.
2. In `app/(dashboard)/tasks/page.tsx`, dynamically import those wrappers:

```tsx
const TaskKanbanView = dynamic(() => import("@/components/crm/task-kanban-view").then((mod) => mod.TaskKanbanView), {
  loading: () => <div className="h-48 animate-pulse rounded-md border border-app-border-subtle bg-app-surface" />,
});

const TaskCalendarView = dynamic(() => import("@/components/crm/task-calendar-view").then((mod) => mod.TaskCalendarView), {
  loading: () => <div className="h-48 animate-pulse rounded-md border border-app-border-subtle bg-app-surface" />,
});
```

3. Defer the search input:

```tsx
const [search, setSearch] = useState("");
const deferredSearch = useDeferredValue(search);

const filters = useMemo(() => {
  if (activeSavedView) {
    return {
      viewFilters: activeSavedView.filters as Record<string, unknown>,
      viewSort: activeSavedView.sort as { column: string; ascending: boolean } | undefined,
    };
  }

  const normalizedSearch = deferredSearch.trim();
  return {
    search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
  };
}, [activeSavedView, deferredSearch]);
```

4. Memoize `onRowClick`, `groupBy`, `getItemId`, and `renderCard` in the page.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run "app/(dashboard)/tasks/__tests__/page.test.tsx" \
  "app/(dashboard)/tasks/__tests__/page.integration.test.tsx"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/'(dashboard)'/tasks/page.tsx \
        app/'(dashboard)'/tasks/__tests__/page.test.tsx \
        app/'(dashboard)'/tasks/__tests__/page.integration.test.tsx \
        src/components/crm/task-kanban-view.tsx \
        src/components/crm/task-calendar-view.tsx
git commit -m "perf(prXX): defer tasks search and split heavy views"
```

---

### Task 2: Add optimistic task updates for table edits and board moves

**Files:**
- Modify: `src/hooks/use-update-crm-task.ts`
- Modify: `src/hooks/__tests__/use-update-crm-task.test.ts`
- Modify: `src/lib/crm/task-columns.tsx`
- Modify: `src/components/crm/__tests__/crm-tasks-table.test.tsx`

**Step 1: Write the failing tests**

Add an optimistic cache test to `src/hooks/__tests__/use-update-crm-task.test.ts`:

```ts
it("writes the updated task status into the cache in onMutate", async () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(crmTaskKeys.detail("task-1"), {
    task_id: "task-1",
    status: "todo",
  });

  const { result } = renderHook(() => useUpdateCrmTask("task-1"), {
    wrapper: withQueryClient(queryClient),
  });

  act(() => {
    result.current.mutate({ status: "done" });
  });

  expect(queryClient.getQueryData(crmTaskKeys.detail("task-1"))).toMatchObject({
    status: "done",
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/hooks/__tests__/use-update-crm-task.test.ts
```

Expected: FAIL because the hook only patches cache in `onSuccess`.

**Step 3: Write minimal implementation**

Add `onMutate`, rollback, and `cancelQueries` to both `useUpdateCrmTaskMutation()` and `useUpdateCrmTask(taskId)`:

```ts
onMutate: async ({ taskId, updates }) => {
  await queryClient.cancelQueries({ queryKey: crmTaskKeys.all });

  const previousDetail = queryClient.getQueryData(crmTaskKeys.detail(taskId));
  applyTaskUpdateSuccess({
    queryClient,
    savedUpdates: updates,
    taskId,
  });

  return { previousDetail, taskId };
},
onError: (_error, variables, context) => {
  if (context?.previousDetail) {
    queryClient.setQueryData(crmTaskKeys.detail(context.taskId), context.previousDetail);
  }
  void queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
},
```

Keep the existing local optimistic drag state in `KanbanBoard`; this task is about making the TanStack cache catch up immediately too.

**Step 4: Run the focused suite**

Run:

```bash
pnpm vitest run src/hooks/__tests__/use-update-crm-task.test.ts \
  src/components/crm/__tests__/crm-tasks-table.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-update-crm-task.ts \
        src/hooks/__tests__/use-update-crm-task.test.ts \
        src/lib/crm/task-columns.tsx \
        src/components/crm/__tests__/crm-tasks-table.test.tsx
git commit -m "perf(prXX): add optimistic task cache updates"
```

---

### Task 3: Reduce chat long-thread rendering cost without a transport rewrite

**Files:**
- Modify: `src/components/chat/message-list.tsx`
- Create: `src/components/chat/__tests__/message-list.test.tsx`
- Modify: `app/globals.css`

**Step 1: Write the failing test**

Create `src/components/chat/__tests__/message-list.test.tsx`:

```tsx
it("marks older messages as deferred rendering candidates", () => {
  const messages = Array.from({ length: 30 }).map((_, index) => ({
    id: `msg-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    parts: [{ type: "text", text: `message ${index}` }],
  }));

  render(<MessageList messages={messages} status="ready" />);

  expect(screen.getAllByTestId("chat-message-deferred").length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/chat/__tests__/message-list.test.tsx
```

Expected: FAIL because older messages are rendered identically to recent ones today.

**Step 3: Write minimal implementation**

Wrap older message rows with a DOM-skipping class:

```tsx
const deferredCutoff = Math.max(0, uniqueMessages.length - 20);

{uniqueMessages.map((message, index) => {
  const isDeferred = index < deferredCutoff;

  return (
    <div
      key={message.id}
      data-testid={isDeferred ? "chat-message-deferred" : undefined}
      className={isDeferred ? "chat-message-deferred" : undefined}
    >
      <MessageBubble
        message={message}
        isStreaming={isStreaming && isLastAssistantMessage}
        isLast={isLastMessage}
        onToolApproval={onToolApproval}
        onManagedApprovalSubmitted={onManagedApprovalSubmitted}
      />
    </div>
  );
})}
```

Then add a utility in `app/globals.css`:

```css
@supports (content-visibility: auto) {
  .chat-message-deferred {
    content-visibility: auto;
    contain-intrinsic-size: auto 160px;
  }
}
```

If manual QA still shows heavy jank after this, stop and open a follow-up for true virtualization instead of sneaking it into this tasklist.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/chat/__tests__/message-list.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/chat/message-list.tsx \
        src/components/chat/__tests__/message-list.test.tsx \
        app/globals.css
git commit -m "perf(prXX): reduce long thread chat render cost"
```

---

### Task 4: Remove render-phase state updates from settings controls

**Files:**
- Modify: `src/components/settings/messaging-channels/telegram-connect-row.tsx`
- Modify: `src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx`
- Modify: `src/components/settings/settings-mobile-nav.tsx`
- Modify: `src/components/settings/__tests__/settings-nav.test.tsx`

**Step 1: Write the failing tests**

Add focused regressions:

```tsx
it("resets pairing state when the connection key changes without setting state during render", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  const { rerender } = render(<TelegramConnectRow {...props} initialConnection={null} />);
  rerender(<TelegramConnectRow {...props} initialConnection={{ chatId: "chat-1", targetThreadId: "thread-1" }} />);

  expect(spy).not.toHaveBeenCalledWith(
    expect.stringContaining("Cannot update a component while rendering a different component"),
  );
});
```

Do the same for `SettingsMobileNav` route-change close behavior.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run \
  src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx \
  src/components/settings/__tests__/settings-nav.test.tsx
```

Expected: FAIL because both components currently set state during render.

**Step 3: Write minimal implementation**

1. In `telegram-connect-row.tsx`, move the connection-key reset logic into `useEffect`:

```tsx
useEffect(() => {
  if (connectionKey === previousConnectionKey) {
    return;
  }

  setPreviousConnectionKey(connectionKey);
  setBotUsername(null);
  setDisplayCode(null);
  setLinkExpiresAt(null);
  setOpenUrl(null);
  setErrorText(null);
  setDidCopyCode(false);
}, [connectionKey, previousConnectionKey]);
```

2. In `settings-mobile-nav.tsx`, close the sheet in a route-change effect:

```tsx
useEffect(() => {
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }
}, [pathname, prevPathname]);
```

If the linter complains about effect-driven state, prefer a reducer or a previous-value ref instead of putting `setState` back in render.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx \
  src/components/settings/__tests__/settings-nav.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/settings/messaging-channels/telegram-connect-row.tsx \
        src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx \
        src/components/settings/settings-mobile-nav.tsx \
        src/components/settings/__tests__/settings-nav.test.tsx
git commit -m "perf(prXX): remove render phase settings state updates"
```

---

### Task 5: Run the focused suite and do manual QA on chat, tasks, and settings

**Files:**
- No new code. Verification only.

**Step 1: Run the automated suite**

Run:

```bash
pnpm vitest run \
  "app/(dashboard)/tasks/__tests__/page.test.tsx" \
  "app/(dashboard)/tasks/__tests__/page.integration.test.tsx" \
  src/hooks/__tests__/use-update-crm-task.test.ts \
  src/components/crm/__tests__/crm-tasks-table.test.tsx \
  src/components/chat/__tests__/message-list.test.tsx \
  src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx \
  src/components/settings/__tests__/settings-nav.test.tsx
```

Expected: PASS.

**Step 2: Start the app**

Run:

```bash
pnpm dev
```

Expected: local app starts on an available port.

**Step 3: Manual QA**

Verify:

- `/tasks`: typing in search stays responsive; table view loads immediately; board/calendar lazy-load when selected
- inline task status/due-date edits update immediately
- `/chat/[threadId]`: opening a long thread and scrolling older history feels lighter
- `/settings/profile` and `/settings/*`: no console warnings about render-phase updates

**Step 4: Commit**

```bash
git add .
git commit -m "test(prXX): verify chat tasks settings perf fixes"
```
