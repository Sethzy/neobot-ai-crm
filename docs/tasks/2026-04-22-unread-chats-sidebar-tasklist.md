# Unread Chats Sidebar Implementation Plan

**Goal:** Add unread state to the existing Chats sidebar and All chats popover so users can see which threads have new activity since they last viewed them.

**Architecture:** Add one nullable `last_read_at` column to `public.conversation_threads`, then keep unread derivation entirely on the existing thread list path. Persist read state through the existing thread DAL/hooks, and derive `isUnread` plus `unreadCount` inside `ThreadProvider`, which already owns hydrated thread data for the dashboard. Do not put the read trigger in `app/(dashboard)/chat/[threadId]/page.tsx`; that file is a Server Component. The real route-aware read trigger belongs in `src/contexts/thread-context.tsx`, where client route state and thread data already meet.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query v5, Supabase Postgres + Realtime, Vitest + React Testing Library, Tailwind 4 + shadcn/ui

**Design Doc:** `docs/plans/2026-04-22-unread-chats-sidebar-design.md`

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Skills

- `@nextjs-app-router-patterns` - `usePathname()`-driven client effects for the active chat route
- `@vercel-react-best-practices` - keep unread state colocated in `ThreadProvider` instead of scattering it across multiple components
- `@shadcn` - preserve the existing sidebar/popover primitive usage instead of inventing custom chrome

## Relevant Docs

- `docs/plans/2026-04-22-unread-chats-sidebar-design.md` - approved scope and UI behavior
- Context7 `/vercel/next.js/v15.1.11` - `usePathname()` + route-change effect patterns in Client Components
- Context7 `/tanstack/query/v5.90.3` - mutation invalidation patterns after optimistic/local UI updates

## Execution Rules

- Use `@test-driven-development` on every parent task.
- Apply the schema change with Supabase MCP `apply_migration`, not the Supabase dashboard.
- Regenerate local DB types after the schema change:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- Keep file-level JSDoc/module comments intact on any new file and update existing comments when the module responsibility changes.
- Use semantic design tokens only. Do not introduce raw Tailwind palette classes.
- `src/lib/chat/threads.ts` already filters `is_archived = false`, so unread count can reuse the existing list without a second archive filter.
- Reuse the existing `updated_at` behavior on `conversation_threads`; do not add new triggers or message-level read plumbing.
- If you run any Managed Agents smoke test while validating chat behavior, force `claude-haiku-4-5`.

## Relevant Files

**Schema + generated types**
- Create: `supabase/migrations/__tests__/conversation-thread-last-read.test.ts`
- Create: `supabase/migrations/20260422120000_add_conversation_thread_last_read_at.sql`
- Modify: `src/types/database.ts`

**Thread persistence + hook seam**
- Modify: `src/lib/chat/threads.ts`
- Modify: `src/lib/chat/__tests__/threads.test.ts`
- Modify: `src/hooks/use-threads.ts`
- Modify: `src/hooks/__tests__/use-threads.test.tsx`

**Derived thread state**
- Modify: `src/types/chat.ts`
- Modify: `src/types/chat.test.ts`
- Modify: `src/contexts/thread-context.tsx`
- Modify: `src/contexts/thread-context.test.tsx`

**Unread UI**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-sidebar.test.tsx`
- Modify: `src/components/layout/app-sidebar-thread-actions.test.tsx`
- Modify: `src/components/layout/all-chats-popover.tsx`
- Create: `src/components/layout/all-chats-popover.test.tsx`

## Notes

- `app/(dashboard)/layout.tsx` already hydrates `threadKeys.list(clientId)` on first paint. Do not create a second thread store for unread state.
- `src/components/chat/chat-panel.tsx` and `src/components/chat/data-stream-handler.tsx` already invalidate thread queries when chat state changes. Unread should piggyback on that existing `updated_at` flow.
- The design doc points at `app/(dashboard)/chat/[threadId]/page.tsx` for the read trigger. That is the wrong implementation seam in this codebase. Use `ThreadProvider`.

---

### Task 1: Add the `last_read_at` schema column and regenerate thread types

**Files:**
- Create: `supabase/migrations/__tests__/conversation-thread-last-read.test.ts`
- Create: `supabase/migrations/20260422120000_add_conversation_thread_last_read_at.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the failing migration contract test**

Create `supabase/migrations/__tests__/conversation-thread-last-read.test.ts`:

```ts
/**
 * Contract tests for the conversation thread last-read migration.
 * @module supabase/migrations/__tests__/conversation-thread-last-read
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260422120000_add_conversation_thread_last_read_at.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("conversation thread last-read migration", () => {
  it("adds a nullable last_read_at column to conversation_threads", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(
      /ALTER TABLE public\.conversation_threads\s+ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ/i,
    );
  });

  it("does not add new indexes or RLS policies", () => {
    const sql = readMigrationSql();

    expect(sql).not.toMatch(/CREATE INDEX/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
```

**Step 2: Run the migration contract test and verify it fails**

Run:

```bash
pnpm test:run -- 'supabase/migrations/__tests__/conversation-thread-last-read.test.ts'
```

Expected: FAIL because the migration test or SQL file does not exist yet.

**Step 3: Write the migration SQL and apply it with Supabase MCP**

Create `supabase/migrations/20260422120000_add_conversation_thread_last_read_at.sql`:

```sql
ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

COMMENT ON COLUMN public.conversation_threads.last_read_at IS
  'When the user last viewed the thread. Null means the thread has never been opened.';
```

Then apply the same SQL to the target dev database with Supabase MCP `apply_migration` using the migration name:

```text
add_conversation_thread_last_read_at
```

**Step 4: Re-run the migration contract test**

Run:

```bash
pnpm test:run -- 'supabase/migrations/__tests__/conversation-thread-last-read.test.ts'
```

Expected: PASS.

**Step 5: Regenerate `src/types/database.ts`**

Run:

```bash
npx supabase gen types typescript --local > src/types/database.ts
rg -n "last_read_at" src/types/database.ts
```

Expected:
- `last_read_at` appears in the `conversation_threads` `Row`
- `last_read_at?: string | null` appears in `Insert`
- `last_read_at?: string | null` appears in `Update`

**Step 6: Commit**

```bash
git add supabase/migrations/__tests__/conversation-thread-last-read.test.ts \
        supabase/migrations/20260422120000_add_conversation_thread_last_read_at.sql \
        src/types/database.ts
git commit -m "feat(chat): add thread last-read schema"
```

---

### Task 2: Add a thread mark-read persistence seam

**Files:**
- Modify: `src/lib/chat/threads.ts`
- Modify: `src/lib/chat/__tests__/threads.test.ts`
- Modify: `src/hooks/use-threads.ts`
- Modify: `src/hooks/__tests__/use-threads.test.tsx`

**Step 1: Write the failing DAL test**

Add this case to `src/lib/chat/__tests__/threads.test.ts`:

```ts
import { markThreadRead } from "../threads";

describe("markThreadRead", () => {
  test("updates last_read_at and returns the updated row", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Chat",
      is_primary: false,
      is_pinned: false,
      is_archived: false,
      source_type: "chat",
      last_read_at: "2026-04-22T10:05:00Z",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-04-22T10:00:00Z",
    };
    const client = createMockSupabaseClient({
      updateResult: { data: [row], error: null },
    });

    await expect(
      markThreadRead(client as never, "thread-1", "2026-04-22T10:05:00Z"),
    ).resolves.toEqual(row);

    expect(findMethodCall(client, "update")?.args).toEqual([
      { last_read_at: "2026-04-22T10:05:00Z" },
    ]);
  });
});
```

**Step 2: Run the DAL test and verify it fails**

Run:

```bash
pnpm test:run -- 'src/lib/chat/__tests__/threads.test.ts'
```

Expected: FAIL with `markThreadRead` missing.

**Step 3: Write the failing hook test**

Extend `src/hooks/__tests__/use-threads.test.tsx`:

```ts
import { useMarkThreadRead } from "../use-threads";

const mockMarkThreadRead = vi.fn();

vi.mock("@/lib/chat/threads", () => ({
  listThreads: (...args: unknown[]) => mockListThreads(...args),
  createThread: (...args: unknown[]) => mockCreateThread(...args),
  updateThreadTitle: (...args: unknown[]) => mockUpdateThreadTitle(...args),
  markThreadRead: (...args: unknown[]) => mockMarkThreadRead(...args),
}));

describe("useMarkThreadRead", () => {
  test("marks a thread as read through the DAL", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Thread 1",
      is_primary: false,
      is_pinned: false,
      is_archived: false,
      source_type: "chat",
      last_read_at: "2026-04-22T10:05:00Z",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-04-22T10:00:00Z",
    };
    mockMarkThreadRead.mockResolvedValue(row);

    const { result } = renderHook(() => useMarkThreadRead("client-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        threadId: "thread-1",
        lastReadAt: "2026-04-22T10:05:00Z",
      }),
    ).resolves.toEqual(row);

    expect(mockMarkThreadRead).toHaveBeenCalledWith(
      expect.any(Object),
      "thread-1",
      "2026-04-22T10:05:00Z",
    );
  });
});
```

**Step 4: Run the hook test and verify it fails**

Run:

```bash
pnpm test:run -- 'src/hooks/__tests__/use-threads.test.tsx'
```

Expected: FAIL because `useMarkThreadRead` does not exist yet.

**Step 5: Write the minimal implementation**

Add this function to `src/lib/chat/threads.ts`:

```ts
/**
 * Marks a thread as read at the provided timestamp.
 */
export async function markThreadRead(
  supabase: ChatSupabaseClient,
  threadId: string,
  lastReadAt: string,
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .update({ last_read_at: lastReadAt })
    .eq("thread_id", threadId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to mark thread read");
  }

  return data;
}
```

Add this hook to `src/hooks/use-threads.ts`:

```ts
export function useMarkThreadRead(clientId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      lastReadAt,
    }: {
      threadId: string;
      lastReadAt: string;
    }): Promise<ThreadRow> => markThreadRead(supabase, threadId, lastReadAt),
    onSuccess: () => {
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: threadKeys.list(clientId) });
      }
    },
  });
}
```

Also import `markThreadRead` in the existing `@/lib/chat/threads` import list.

**Step 6: Run the focused tests and verify they pass**

Run:

```bash
pnpm test:run -- 'src/lib/chat/__tests__/threads.test.ts' 'src/hooks/__tests__/use-threads.test.tsx'
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/chat/threads.ts \
        src/lib/chat/__tests__/threads.test.ts \
        src/hooks/use-threads.ts \
        src/hooks/__tests__/use-threads.test.tsx
git commit -m "feat(chat): add thread mark-read mutation"
```

---

### Task 3: Derive unread state inside `ThreadProvider` and auto-mark the active thread

**Files:**
- Modify: `src/types/chat.ts`
- Modify: `src/types/chat.test.ts`
- Modify: `src/contexts/thread-context.tsx`
- Modify: `src/contexts/thread-context.test.tsx`

**Step 1: Update the shared thread type test first**

Replace the thread fixture in `src/types/chat.test.ts` with the real shape the UI will consume:

```ts
const thread: Thread = {
  id: "thread-1",
  title: "New Chat",
  isPinned: false,
  isPrimary: false,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-22T10:00:00.000Z"),
  lastReadAt: null,
  isUnread: true,
  sourceType: "chat",
};
```

**Step 2: Run the type test and verify it fails**

Run:

```bash
pnpm test:run -- 'src/types/chat.test.ts'
```

Expected: FAIL because `Thread` does not expose the new fields yet.

**Step 3: Write the failing thread-context tests**

Update `src/contexts/thread-context.test.tsx`:

```ts
let mockPathname = "/chat";
const mockUseMarkThreadRead = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@/hooks/use-threads", () => ({
  useThreads: (...args: unknown[]) => mockUseThreadsQuery(...args),
  useCreateThread: (...args: unknown[]) => mockUseCreateThread(...args),
  useUpdateThreadTitle: (...args: unknown[]) => mockUseUpdateThreadTitle(...args),
  useArchiveThread: (...args: unknown[]) => mockUseArchiveThread(...args),
  useMarkThreadRead: (...args: unknown[]) => mockUseMarkThreadRead(...args),
}));

const baseThread = {
  thread_id: "thread-1",
  client_id: "client-1",
  title: "First chat",
  is_primary: false,
  is_pinned: false,
  is_archived: false,
  source_type: "chat",
  last_read_at: null,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-04-22T10:00:00Z",
};

it("derives unread state for never-read, stale, and fresh threads", async () => {
  mockUseThreadsQuery.mockReturnValue({
    data: [
      { ...baseThread, thread_id: "never-read", last_read_at: null },
      { ...baseThread, thread_id: "stale", last_read_at: "2026-04-22T09:00:00Z" },
      { ...baseThread, thread_id: "fresh", last_read_at: "2026-04-22T11:00:00Z" },
    ],
    isLoading: false,
  });
  mockUseMarkThreadRead.mockReturnValue({ mutateAsync: vi.fn(async () => baseThread) });

  const { result } = renderHook(() => useThreads(), { wrapper });

  await waitFor(() => expect(result.current.threads).toHaveLength(3));
  expect(result.current.threads.map((thread) => thread.isUnread)).toEqual([true, true, false]);
  expect(result.current.unreadCount).toBe(2);
});

it("optimistically marks the active unread thread as read", async () => {
  mockPathname = "/chat/thread-1";
  let resolveMutation: (() => void) | null = null;

  mockUseMarkThreadRead.mockReturnValue({
    mutateAsync: vi.fn(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve(baseThread);
        }),
    ),
  });

  const { result } = renderHook(() => useThreads(), { wrapper });

  await waitFor(() => expect(result.current.unreadCount).toBe(0));
  resolveMutation?.();
});
```

**Step 4: Run the thread-context test and verify it fails**

Run:

```bash
pnpm test:run -- 'src/contexts/thread-context.test.tsx'
```

Expected: FAIL because `useMarkThreadRead`, `unreadCount`, and unread derivation do not exist yet.

**Step 5: Write the minimal implementation**

Update `src/types/chat.ts`:

```ts
export interface Thread {
  id: string;
  title: string;
  isPinned: boolean;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastReadAt: Date | null;
  isUnread: boolean;
  sourceType: string;
}
```

Update `src/contexts/thread-context.tsx`:

```tsx
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMarkThreadRead } from "@/hooks/use-threads";

interface ThreadContextValue {
  threads: Thread[];
  isLoading: boolean;
  unreadCount: number;
  createThread: () => Promise<string>;
  updateThreadTitle: (id: string, title: string) => void;
  archiveThread: (id: string) => Promise<boolean>;
  markRead: (id: string) => Promise<void>;
}

const pathname = usePathname() ?? "";
const { mutateAsync: markThreadReadMutateAsync } = useMarkThreadRead(clientId);
const [optimisticLastReadAtByThreadId, setOptimisticLastReadAtByThreadId] = useState<
  Record<string, string>
>({});

const threads = useMemo<Thread[]>(
  () =>
    threadRows.map((thread) => {
      const effectiveLastReadAt =
        optimisticLastReadAtByThreadId[thread.thread_id] ?? thread.last_read_at;
      const updatedAt = new Date(thread.updated_at);
      const lastReadAt = effectiveLastReadAt ? new Date(effectiveLastReadAt) : null;

      return {
        id: thread.thread_id,
        title: thread.title ?? "New Chat",
        isPinned: thread.is_pinned,
        isPrimary: thread.is_primary,
        createdAt: new Date(thread.created_at),
        updatedAt,
        lastReadAt,
        isUnread: lastReadAt === null ? true : updatedAt > lastReadAt,
        sourceType: thread.source_type,
      };
    }),
  [threadRows, optimisticLastReadAtByThreadId],
);

const unreadCount = useMemo(
  () => threads.filter((thread) => thread.isUnread).length,
  [threads],
);

const markRead = useCallback(async (threadId: string) => {
  const optimisticLastReadAt = new Date().toISOString();

  setOptimisticLastReadAtByThreadId((current) => ({
    ...current,
    [threadId]: optimisticLastReadAt,
  }));

  try {
    await markThreadReadMutateAsync({ threadId, lastReadAt: optimisticLastReadAt });
  } catch {
    setOptimisticLastReadAtByThreadId((current) => {
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }
}, [markThreadReadMutateAsync]);

useEffect(() => {
  const activeThread = threads.find((thread) => pathname.startsWith(`/chat/${thread.id}`));

  if (!activeThread?.isUnread) {
    return;
  }

  void markRead(activeThread.id);
}, [threads, pathname, markRead]);
```

Add this cleanup effect immediately below the `threads` mapping so optimistic entries do not live forever:

```tsx
useEffect(() => {
  setOptimisticLastReadAtByThreadId((current) => {
    let hasChanged = false;
    const next = { ...current };

    for (const [threadId, optimisticLastReadAt] of Object.entries(current)) {
      const serverThread = threadRows.find((thread) => thread.thread_id === threadId);

      if (!serverThread) {
        delete next[threadId];
        hasChanged = true;
        continue;
      }

      if (
        serverThread.last_read_at &&
        new Date(serverThread.last_read_at) >= new Date(optimisticLastReadAt)
      ) {
        delete next[threadId];
        hasChanged = true;
      }
    }

    return hasChanged ? next : current;
  });
}, [threadRows]);
```

Also add `unreadCount` and `markRead` to the context `value` object.

**Step 6: Run the focused tests and verify they pass**

Run:

```bash
pnpm test:run -- 'src/types/chat.test.ts' 'src/contexts/thread-context.test.tsx'
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/types/chat.ts \
        src/types/chat.test.ts \
        src/contexts/thread-context.tsx \
        src/contexts/thread-context.test.tsx
git commit -m "feat(chat): derive unread thread state"
```

---

### Task 4: Render unread affordances in the sidebar and All chats popover

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-sidebar.test.tsx`
- Modify: `src/components/layout/app-sidebar-thread-actions.test.tsx`
- Modify: `src/components/layout/all-chats-popover.tsx`
- Create: `src/components/layout/all-chats-popover.test.tsx`

**Step 1: Add the failing sidebar tests**

Extend `src/components/layout/app-sidebar.test.tsx` so the mocked context exposes unread state.

Make sure the import line includes `within`:

```ts
import { render, screen, within } from "@testing-library/react";

const mockMarkRead = vi.fn();

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [
      {
        id: "thread-primary",
        title: "Main",
        isPinned: true,
        isPrimary: true,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-22T09:00:00.000Z"),
        lastReadAt: new Date("2026-04-22T09:00:00.000Z"),
        isUnread: false,
        sourceType: "chat",
      },
      {
        id: "thread-1",
        title: "Test Chat",
        isPinned: false,
        isPrimary: false,
        createdAt: new Date("2026-03-01T01:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        lastReadAt: null,
        isUnread: true,
        sourceType: "chat",
      },
    ],
    unreadCount: 1,
    isLoading: false,
    updateThreadTitle: mockUpdateThreadTitle,
    archiveThread: mockArchiveThread,
    markRead: mockMarkRead,
  }),
}));

it("renders an unread dot, bold title, and Chats count for unread threads", () => {
  render(<AppSidebar />, { wrapper });

  const unreadLink = screen.getByRole("link", { name: "Test Chat" });
  expect(within(unreadLink).getByTestId("thread-unread-dot")).toBeInTheDocument();
  expect(within(unreadLink).getByText("Test Chat")).toHaveClass("font-semibold");
  expect(screen.getByText("· 1")).toBeInTheDocument();
});

it("caps the Chats unread count at 9+", () => {
  // override the mock to return unreadCount: 12
  render(<AppSidebar />, { wrapper });
  expect(screen.getByText("· 9+")).toBeInTheDocument();
});

it("suppresses the unread dot on the currently viewed thread", () => {
  mockPathname = "/chat/thread-1";
  render(<AppSidebar />, { wrapper });

  const activeLink = screen.getByRole("link", { name: "Test Chat" });
  expect(within(activeLink).queryByTestId("thread-unread-dot")).not.toBeInTheDocument();
});
```

**Step 2: Run the sidebar tests and verify they fail**

Run:

```bash
pnpm test:run -- 'src/components/layout/app-sidebar.test.tsx'
```

Expected: FAIL because unread UI does not exist yet.

**Step 3: Add the failing popover test**

Create `src/components/layout/all-chats-popover.test.tsx`:

```tsx
/**
 * Tests unread rendering in the All chats popover.
 * @module components/layout/all-chats-popover.test
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AllChatsPopover } from "./all-chats-popover";

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [
      {
        id: "thread-1",
        title: "Thread Alpha",
        isPinned: false,
        isPrimary: false,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        lastReadAt: null,
        isUnread: true,
        sourceType: "chat",
      },
    ],
  }),
}));

describe("AllChatsPopover", () => {
  it("renders unread dot + bold title for non-active unread threads", async () => {
    const user = userEvent.setup();

    render(
      <AllChatsPopover pathname="/chat" onNavigate={vi.fn()}>
        <button type="button">All chats</button>
      </AllChatsPopover>,
    );

    await user.click(screen.getByRole("button", { name: "All chats" }));

    const threadLink = screen.getByRole("link", { name: /thread alpha/i });
    expect(within(threadLink).getByTestId("thread-unread-dot")).toBeInTheDocument();
    expect(within(threadLink).getByText("Thread Alpha")).toHaveClass("font-semibold");
  });
});
```

Also update `src/components/layout/app-sidebar-thread-actions.test.tsx` mock thread objects so they include the new `Thread` fields and `useThreads()` extras (`unreadCount`, `markRead`). Do not let old action tests fail for mock-shape reasons.

**Step 4: Run the popover and action tests and verify the new popover test fails**

Run:

```bash
pnpm test:run -- 'src/components/layout/all-chats-popover.test.tsx' 'src/components/layout/app-sidebar-thread-actions.test.tsx'
```

Expected:
- `all-chats-popover.test.tsx` FAILS because unread UI is missing
- `app-sidebar-thread-actions.test.tsx` may fail until the mock shape is updated

**Step 5: Write the minimal UI implementation**

Update `src/components/layout/app-sidebar.tsx`:

```tsx
import { cn } from "@/lib/utils";

const { threads, unreadCount, isLoading: isThreadsLoading, archiveThread } = useThreads();
const activeThread = threads.find((thread) => pathname.startsWith(`/chat/${thread.id}`));
const visibleUnreadCount = activeThread?.isUnread ? unreadCount - 1 : unreadCount;
const unreadCountLabel = visibleUnreadCount > 9 ? "9+" : String(visibleUnreadCount);

<SidebarGroupLabel className="flex h-6 items-center justify-between type-caption text-muted-foreground/50 tracking-[0.12em] normal-case">
  <span>Chats</span>
  {visibleUnreadCount > 0 ? (
    <span className="text-muted-foreground/70">{`· ${unreadCountLabel}`}</span>
  ) : null}
</SidebarGroupLabel>

const isActive = pathname.startsWith(`/chat/${thread.id}`);
const showUnreadState = thread.isUnread && !isActive;

<Link href={`/chat/${thread.id}`} onClick={() => closeMobileSidebar()}>
  <span className="flex w-2 shrink-0 justify-center">
    {showUnreadState ? (
      <span
        aria-hidden="true"
        data-testid="thread-unread-dot"
        className="h-1.5 w-1.5 rounded-full bg-foreground"
      />
    ) : null}
  </span>
  <AppIcon
    name={getThreadIconName(thread)}
    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
  />
  <span className={cn("truncate type-control", showUnreadState && "font-semibold")}>
    {thread.title}
  </span>
</Link>
```

Update `src/components/layout/all-chats-popover.tsx` with the same `showUnreadState` logic and the same dot slot so row alignment stays stable whether the dot is present or not.

Important:
- Keep the active-thread suppression in the UI even though `ThreadProvider` also auto-marks read. This prevents a one-frame flash on navigation.
- Do not add a pill badge. Keep the count compact.

**Step 6: Run the focused UI tests and verify they pass**

Run:

```bash
pnpm test:run -- \
  'src/components/layout/app-sidebar.test.tsx' \
  'src/components/layout/app-sidebar-thread-actions.test.tsx' \
  'src/components/layout/all-chats-popover.test.tsx'
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/components/layout/app-sidebar.tsx \
        src/components/layout/app-sidebar.test.tsx \
        src/components/layout/app-sidebar-thread-actions.test.tsx \
        src/components/layout/all-chats-popover.tsx \
        src/components/layout/all-chats-popover.test.tsx
git commit -m "feat(chat): render unread state in thread navigation"
```

## Final Verification

Run:

```bash
pnpm test:run -- \
  'supabase/migrations/__tests__/conversation-thread-last-read.test.ts' \
  'src/lib/chat/__tests__/threads.test.ts' \
  'src/hooks/__tests__/use-threads.test.tsx' \
  'src/types/chat.test.ts' \
  'src/contexts/thread-context.test.tsx' \
  'src/components/layout/app-sidebar.test.tsx' \
  'src/components/layout/app-sidebar-thread-actions.test.tsx' \
  'src/components/layout/all-chats-popover.test.tsx'
pnpm lint
```

Expected:
- All focused tests PASS
- `pnpm lint` PASS

## Manual QA

- Seed one existing thread as unread locally by setting `last_read_at` to `NULL` or an old timestamp in your dev DB.
- Load the dashboard and confirm the sidebar row and All chats popover row both show unread styling for that thread.
- Open the unread thread and confirm the dot clears immediately, without waiting for a refresh.
- Reload on the same thread and confirm the dot stays cleared.
- While the thread is open, deliver one more message into it from another session or channel and confirm the unread dot does not reappear for the actively viewed thread.

Tasklist complete and saved to `docs/tasks/2026-04-22-unread-chats-sidebar-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.
