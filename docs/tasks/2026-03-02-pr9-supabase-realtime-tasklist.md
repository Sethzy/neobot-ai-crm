# PR 9: Supabase Realtime for Live Updates — Implementation Plan

**PR:** PR 9: Supabase Realtime for live updates
**Decisions:** DATA-07
**Goal:** Wire Supabase Realtime subscriptions on CRM and conversation tables so the frontend reflects agent-created data immediately without manual refresh.

**Architecture:** Supabase Realtime's `postgres_changes` channel delivers INSERT/UPDATE/DELETE events to browser clients filtered by `client_id` (or `thread_id` for messages). A single reusable `useRealtimeTable` hook subscribes to a table, captures change events, and invalidates the relevant TanStack Query cache entries — causing automatic refetch. RLS on each table ensures subscribers only receive events for their own data. Tables must be added to the `supabase_realtime` Postgres publication before events are emitted. The hook uses a `useRef` for query keys to avoid unnecessary re-subscriptions when array references change between renders.

**Tech Stack:** Supabase Realtime (Postgres changes), `@supabase/supabase-js` ^2.88.0, TanStack Query, React hooks, Vitest + React Testing Library

**Prerequisites:**
- PR 3 (conversation tables: `conversation_threads`, `conversation_messages`) — DONE
- PR 5 (CRM tables: `contacts`, `deals`, `interactions`, `crm_tasks`) — DONE
- Existing hooks: `src/hooks/use-threads.ts`, `src/hooks/use-chat-messages.ts` — DONE
- Existing Supabase browser client: `src/lib/supabase.ts` (lazy Proxy) — DONE

**Architecture Decisions:**
- `DATA-07` — Supabase Realtime confirmed. Subscribe to table changes (INSERT/UPDATE/DELETE) filtered by `client_id`. Powers: live CRM dashboard updates, background task completion notifications, approval request delivery. No Redis or separate pub/sub needed.

**App Spec Sections:** §6 (Tech Stack — Supabase Realtime), §10.1 (Supabase Tables)

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Task Overview

| Task | Component | TDD? | Depends On |
|------|-----------|------|------------|
| 1 | SQL Migration: enable Realtime publication | Config (exception) | PR 3, PR 5 |
| 2 | Core hook: `useRealtimeTable` | Yes | Task 1 |
| 3 | Integration: wire realtime into `useThreads` + `useChatMessages` | Yes | Task 2 |
| 4 | CRM query keys + `useRealtimeCrm` hook | Deferred to PR 10+ | — |

---

### Task 1: SQL Migration — Enable Supabase Realtime Publication

**Files:**
- Create: `supabase/migrations/20260302140000_enable_realtime.sql`

**Context:** Supabase Realtime's `postgres_changes` feature requires each table to be added to the `supabase_realtime` publication. Without this, no change events are emitted. This migration enables realtime on the 6 tables that need live frontend updates: 2 conversation tables (from PR 3) and 4 CRM tables (from PR 5). RLS policies already enforce tenant isolation — Realtime respects RLS, so subscribers only receive events for rows they have SELECT access to.

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260302140000_enable_realtime.sql

-- Enable Supabase Realtime on conversation and CRM tables.
-- Idempotent guards avoid migration failures when a table has already been
-- added to the publication in shared or reset environments.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_threads;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'interactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.interactions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_tasks;
  END IF;
END $$;
```

**Step 2: Apply the migration locally**

```bash
npx supabase db reset
```

Expected: Migration applies cleanly. All 6 tables are now in the `supabase_realtime` publication.

**Step 3: Verify the publication includes the tables**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;"
```

Expected: Output includes `contacts`, `conversation_messages`, `conversation_threads`, `crm_tasks`, `deals`, `interactions`.
If local Supabase is not running, start it first with `npx supabase start`.

**Step 4: Commit**

```bash
git add supabase/migrations/20260302140000_enable_realtime.sql
git commit -m "feat(pr9): enable supabase realtime on conversation + CRM tables"
```

---

### Task 2: Core Hook — `useRealtimeTable`

**Files:**
- Create: `src/hooks/use-realtime.ts`
- Test: `src/hooks/__tests__/use-realtime.test.tsx`
- Reference: `src/hooks/use-threads.ts` (existing hook pattern), `src/lib/supabase.ts` (browser client)

**Context:** This is the core primitive. `useRealtimeTable` subscribes to Supabase Realtime `postgres_changes` for a single table with a PostgREST filter, and invalidates specified TanStack Query keys on any INSERT/UPDATE/DELETE event. The hook manages its own channel lifecycle: subscribe on mount, remove channel on unmount. When `enabled` is false or `filter` is undefined, no subscription is created. Query keys are stored in a `useRef` to avoid re-subscriptions when the consumer passes a new array reference on each render.

**Step 1: Write failing tests**

```tsx
// src/hooks/__tests__/use-realtime.test.tsx
/**
 * Tests for useRealtimeTable — Supabase Realtime subscription hook.
 * @module hooks/__tests__/use-realtime
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useRealtimeTable } from "../use-realtime";

// --- Mocks (hoisted by vitest) ---

/** The most recently captured postgres_changes callback */
let pgChangesCallback: ((payload: unknown) => void) | null = null;

/** Spy fns for assertions */
const mockChannelName = vi.fn<(name: string) => void>();
const mockOn = vi.fn<(event: string, opts: unknown, cb: (payload: unknown) => void) => void>();
const mockSubscribe = vi.fn();
const mockRemoveChannel = vi.fn();

/** Chainable channel stub — mimics RealtimeChannel */
const channelStub = {
  on: (...args: unknown[]) => {
    mockOn(
      args[0] as string,
      args[1] as unknown,
      args[2] as (payload: unknown) => void,
    );
    if (typeof args[2] === "function") {
      pgChangesCallback = args[2] as (payload: unknown) => void;
    }
    return channelStub;
  },
  subscribe: (...args: unknown[]) => {
    mockSubscribe(...args);
    return channelStub;
  },
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: (name: string) => {
      mockChannelName(name);
      return channelStub;
    },
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

// --- Tests ---

describe("useRealtimeTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgChangesCallback = null;
  });

  // -- Subscription lifecycle --

  test("subscribes to the correct channel on mount", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    expect(mockChannelName).toHaveBeenCalledWith(
      "realtime:contacts:client_id=eq.client-1",
    );
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "contacts",
        filter: "client_id=eq.client-1",
      },
      expect.any(Function),
    );
    expect(mockSubscribe).toHaveBeenCalled();
  });

  test("removes channel on unmount", () => {
    const { wrapper } = createWrapper();

    const { unmount } = renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(channelStub);
  });

  // -- Guard conditions --

  test("does not subscribe when enabled is false", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
          enabled: false,
        }),
      { wrapper },
    );

    expect(mockChannelName).not.toHaveBeenCalled();
  });

  test("does not subscribe when filter is undefined", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: undefined,
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    expect(mockChannelName).not.toHaveBeenCalled();
  });

  test("does not call removeChannel on unmount when no subscription was created", () => {
    const { wrapper } = createWrapper();

    const { unmount } = renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: undefined,
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    unmount();

    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  // -- Query invalidation --

  test("invalidates specified query keys when a change event arrives", () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    // Simulate a postgres_changes event
    act(() => {
      pgChangesCallback?.({
        eventType: "INSERT",
        new: { contact_id: "c-1", first_name: "John" },
        old: {},
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["contacts", "list", "client-1"],
    });
  });

  test("invalidates multiple query keys on a single change event", () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [
            ["contacts", "list", "client-1"],
            ["contacts", "detail", "c-1"],
          ],
        }),
      { wrapper },
    );

    act(() => {
      pgChangesCallback?.({
        eventType: "UPDATE",
        new: { contact_id: "c-1" },
        old: { contact_id: "c-1" },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["contacts", "list", "client-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["contacts", "detail", "c-1"],
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-realtime.test.tsx
```

Expected: FAIL — `Cannot find module '../use-realtime'` (file does not exist yet).

**Step 3: Write minimal implementation**

```typescript
// src/hooks/use-realtime.ts
/**
 * Supabase Realtime subscription hook for live table updates.
 * Subscribes to postgres_changes and invalidates TanStack Query cache.
 * @module hooks/use-realtime
 */
"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface UseRealtimeTableOptions {
  /** Postgres table name to subscribe to (e.g. "contacts") */
  table: string;
  /** PostgREST filter string (e.g. "client_id=eq.abc123"). When undefined, subscription is skipped. */
  filter?: string;
  /** TanStack Query keys to invalidate on any INSERT/UPDATE/DELETE event */
  queryKeys: readonly (readonly unknown[])[];
  /** Whether the subscription is active. Defaults to true. */
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime postgres_changes for a table and
 * invalidate TanStack Query cache entries on INSERT/UPDATE/DELETE.
 *
 * Lifecycle:
 * - Creates a Supabase channel on mount (when enabled + filter present)
 * - Removes the channel on unmount or when dependencies change
 * - Query keys are stored in a ref to avoid re-subscribing on array reference changes
 *
 * @example
 * ```ts
 * useRealtimeTable({
 *   table: "conversation_threads",
 *   filter: clientId ? `client_id=eq.${clientId}` : undefined,
 *   queryKeys: [threadKeys.list(clientId)],
 *   enabled: true,
 * });
 * ```
 */
export function useRealtimeTable({
  table,
  filter,
  queryKeys,
  enabled = true,
}: UseRealtimeTableOptions): void {
  const queryClient = useQueryClient();

  // Store queryKeys in a ref so the effect doesn't re-run when the
  // consumer passes a new array reference with the same content.
  const queryKeysRef = useRef(queryKeys);
  queryKeysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled || !filter) return;

    const channelName = `realtime:${table}:${filter}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table, filter },
        () => {
          for (const key of queryKeysRef.current) {
            queryClient.invalidateQueries({ queryKey: [...key] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, queryClient]);
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-realtime.test.tsx
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-realtime.ts src/hooks/__tests__/use-realtime.test.tsx
git commit -m "feat(pr9): add useRealtimeTable hook with TanStack Query invalidation"
```

---

### Task 3: Integration — Wire Realtime into Thread and Message Hooks

**Files:**
- Modify: `src/hooks/use-threads.ts`
- Modify: `src/hooks/use-chat-messages.ts`
- Modify: `src/hooks/__tests__/use-threads.test.tsx`
- Modify: `src/hooks/__tests__/use-chat-messages.test.tsx`
- Reference: `src/hooks/use-realtime.ts` (Task 2)

**Context:** The existing `useThreads` and `useChatMessages` hooks use TanStack Query for data fetching but have no realtime subscriptions. This task adds `useRealtimeTable` calls to both hooks so that:
- Thread list auto-refreshes when a thread is created/updated (e.g., by another tab or the agent auto-titling a thread)
- Message list auto-refreshes when the agent writes messages to the DB during a run

The realtime hook is mocked in the existing test files to keep tests fast and isolated.

**Step 1: Write failing test for thread realtime integration**

Add to the existing test file `src/hooks/__tests__/use-threads.test.tsx`:

```tsx
// --- Add this mock at the top, after the existing vi.mock blocks ---

const mockUseRealtimeTable = vi.fn();
vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (...args: unknown[]) => mockUseRealtimeTable(...args),
}));

// --- Add this test inside the "useThreads" describe block ---

test("wires up realtime subscription for thread changes", async () => {
  mockListThreads.mockResolvedValue([]);

  renderHook(() => useThreads("client-1"), {
    wrapper: createWrapper(),
  });

  expect(mockUseRealtimeTable).toHaveBeenCalledWith({
    table: "conversation_threads",
    filter: "client_id=eq.client-1",
    queryKeys: [["threads", "list", "client-1"]],
    enabled: true,
  });
});

test("disables realtime subscription when clientId is empty", async () => {
  renderHook(() => useThreads(""), {
    wrapper: createWrapper(),
  });

  expect(mockUseRealtimeTable).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: false }),
  );
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-threads.test.tsx
```

Expected: FAIL — `useRealtimeTable` was never called because it's not wired into `useThreads` yet.

**Step 3: Wire realtime into `useThreads`**

Add to `src/hooks/use-threads.ts`:

```typescript
// Add import at the top (after existing imports):
import { useRealtimeTable } from "@/hooks/use-realtime";

// Add inside the useThreads function body, before the return:
export function useThreads(clientId: string | null | undefined) {
  // --- ADD THIS BLOCK ---
  useRealtimeTable({
    table: "conversation_threads",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [threadKeys.list(clientId ?? "")],
    enabled: Boolean(clientId),
  });
  // --- END ADD ---

  return useQuery({
    queryKey: threadKeys.list(clientId ?? ""),
    queryFn: () => listThreads(supabase, clientId as string),
    enabled: Boolean(clientId),
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-threads.test.tsx
```

Expected: All tests PASS (existing + 2 new).

**Step 5: Write failing test for message realtime integration**

Add to the existing test file `src/hooks/__tests__/use-chat-messages.test.tsx`:

```tsx
// --- Add this mock at the top, after the existing vi.mock blocks ---

const mockUseRealtimeTable = vi.fn();
vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (...args: unknown[]) => mockUseRealtimeTable(...args),
}));

// --- Add this test inside the "useChatMessages" describe block ---

test("wires up realtime subscription for message changes", async () => {
  mockListMessages.mockResolvedValue([]);

  renderHook(() => useChatMessages("thread-1"), {
    wrapper: createWrapper(),
  });

  expect(mockUseRealtimeTable).toHaveBeenCalledWith({
    table: "conversation_messages",
    filter: "thread_id=eq.thread-1",
    queryKeys: [["messages", "thread", "thread-1"]],
    enabled: true,
  });
});

test("disables realtime subscription when threadId is empty", async () => {
  renderHook(() => useChatMessages(""), {
    wrapper: createWrapper(),
  });

  expect(mockUseRealtimeTable).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: false }),
  );
});
```

**Step 6: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-chat-messages.test.tsx
```

Expected: FAIL — `useRealtimeTable` was never called because it's not wired into `useChatMessages` yet.

**Step 7: Wire realtime into `useChatMessages`**

Add to `src/hooks/use-chat-messages.ts`:

```typescript
// Add import at the top (after existing imports):
import { useRealtimeTable } from "@/hooks/use-realtime";

// Add inside the useChatMessages function body, before the return:
export function useChatMessages(threadId: string | null | undefined) {
  // --- ADD THIS BLOCK ---
  useRealtimeTable({
    table: "conversation_messages",
    filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    queryKeys: [messageKeys.byThread(threadId ?? "")],
    enabled: Boolean(threadId),
  });
  // --- END ADD ---

  return useQuery({
    queryKey: messageKeys.byThread(threadId ?? ""),
    queryFn: () => listMessages(supabase, threadId as string),
    enabled: Boolean(threadId),
  });
}
```

**Step 8: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-chat-messages.test.tsx
```

Expected: All tests PASS (existing + 2 new).

**Step 9: Run all hook tests together**

```bash
npx vitest run src/hooks/__tests__/
```

Expected: All tests PASS across all hook test files.

**Step 10: Commit**

```bash
git add src/hooks/use-threads.ts src/hooks/use-chat-messages.ts src/hooks/__tests__/use-threads.test.tsx src/hooks/__tests__/use-chat-messages.test.tsx
git commit -m "feat(pr9): wire realtime subscriptions into thread and message hooks"
```

---

### Task 4: CRM Query Keys + `useRealtimeCrm` Hook (Deferred)

Per approved scope, Task 4 is deferred out of PR 9 to avoid key-namespace drift with PR 10/11.
PR 9 ships only:
- migration (`enable_realtime.sql`)
- core `useRealtimeTable` hook
- realtime wiring for `useThreads` and `useChatMessages`

## Relevant Files Summary

| File | Action | Task |
|------|--------|------|
| `supabase/migrations/20260302140000_enable_realtime.sql` | Create | 1 |
| `src/hooks/use-realtime.ts` | Create | 2 |
| `src/hooks/__tests__/use-realtime.test.tsx` | Create | 2 |
| `src/hooks/use-threads.ts` | Modify (add import + `useRealtimeTable` call) | 3 |
| `src/hooks/use-chat-messages.ts` | Modify (add import + `useRealtimeTable` call) | 3 |
| `src/hooks/__tests__/use-threads.test.tsx` | Modify (add mock + 2 tests) | 3 |
| `src/hooks/__tests__/use-chat-messages.test.tsx` | Modify (add mock + 2 tests) | 3 |

## Notes

- **RLS enforces security:** Supabase Realtime respects Row Level Security on `postgres_changes`. Subscribers only receive events for rows they have SELECT access to. Our existing RLS policies (scoped by `client_id = get_my_client_id()`) protect realtime events automatically.
- **No CRM pages yet:** PR 10-11 create the CRM list/detail pages and own the canonical CRM query key factories.
- **Channel limits:** Supabase allows up to 100 concurrent channels per connection. This PR creates at most 6 channels (2 conversation + 4 CRM). Well within limits.
- **Reconnection:** The Supabase JS client handles WebSocket reconnection automatically. No custom retry logic needed.
- **Test criteria from plan:** "Have agent create a contact while CRM page is open in another tab → appears without refresh." This requires PR 10 (CRM pages) to fully verify. For PR 9 alone, verify via: (1) unit tests confirm hook behavior, (2) manual test: open browser console, subscribe to `contacts` changes, have agent create a contact via chat, confirm event fires.
