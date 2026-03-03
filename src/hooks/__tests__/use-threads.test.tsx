/**
 * Tests TanStack Query hooks for conversation thread operations.
 * @module hooks/__tests__/use-threads
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  useCreateThread,
  useThreads,
  useUpdateThreadTitle,
} from "../use-threads";

const mockListThreads = vi.fn();
const mockCreateThread = vi.fn();
const mockUpdateThreadTitle = vi.fn();
const mockUseRealtimeTable = vi.fn();

vi.mock("@/lib/chat/threads", () => ({
  listThreads: (...args: unknown[]) => mockListThreads(...args),
  createThread: (...args: unknown[]) => mockCreateThread(...args),
  updateThreadTitle: (...args: unknown[]) => mockUpdateThreadTitle(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { marker: "browser-client" },
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (...args: unknown[]) => mockUseRealtimeTable(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads threads for the given client id", async () => {
    const rows = [
      {
        thread_id: "thread-1",
        client_id: "client-1",
        title: "First thread",
        is_pinned: false,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
    ];
    mockListThreads.mockResolvedValue(rows);

    const { result } = renderHook(() => useThreads("client-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    expect(mockListThreads).toHaveBeenCalledWith(expect.any(Object), "client-1");
  });

  test("does not run the query until client id is resolved", async () => {
    const { result } = renderHook(() => useThreads(""), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockListThreads).not.toHaveBeenCalled();
  });

  test("wires realtime subscription for conversation thread changes", () => {
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

  test("disables realtime subscription when client id is empty", () => {
    renderHook(() => useThreads(""), {
      wrapper: createWrapper(),
    });

    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "conversation_threads",
      filter: undefined,
      queryKeys: [["threads", "list", ""]],
      enabled: false,
    });
  });
});

describe("useCreateThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates a thread through the DAL", async () => {
    const row = {
      thread_id: "thread-new",
      client_id: "client-1",
      title: null,
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    mockCreateThread.mockResolvedValue(row);

    const { result } = renderHook(() => useCreateThread("client-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(null)).resolves.toEqual(row);
    expect(mockCreateThread).toHaveBeenCalledWith(expect.any(Object), "client-1", null);
  });
});

describe("useUpdateThreadTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("updates a thread title through the DAL", async () => {
    const row = {
      thread_id: "thread-1",
      client_id: "client-1",
      title: "Renamed thread",
      is_pinned: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    mockUpdateThreadTitle.mockResolvedValue(row);

    const { result } = renderHook(() => useUpdateThreadTitle("client-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ threadId: "thread-1", title: "Renamed thread" }),
    ).resolves.toEqual(row);

    expect(mockUpdateThreadTitle).toHaveBeenCalledWith(
      expect.any(Object),
      "thread-1",
      "Renamed thread",
    );
  });
});
