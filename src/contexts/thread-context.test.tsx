/**
 * Tests for thread context backed by database query hooks.
 * @module contexts/thread-context.test
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadProvider, useThreads } from "./thread-context";

const mockUseClientId = vi.fn();
const mockUseThreadsQuery = vi.fn();
const mockUseCreateThread = vi.fn();
const mockUseUpdateThreadTitle = vi.fn();

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => mockUseClientId(),
}));

vi.mock("@/hooks/use-threads", () => ({
  useThreads: (...args: unknown[]) => mockUseThreadsQuery(...args),
  useCreateThread: (...args: unknown[]) => mockUseCreateThread(...args),
  useUpdateThreadTitle: (...args: unknown[]) => mockUseUpdateThreadTitle(...args),
}));

const baseThread = {
  thread_id: "thread-1",
  client_id: "client-1",
  title: "First chat",
  is_pinned: false,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThreadProvider>{children}</ThreadProvider>
);

describe("thread context", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseClientId.mockReturnValue({
      data: "client-1",
      isLoading: false,
    });

    mockUseThreadsQuery.mockReturnValue({
      data: [baseThread],
      isLoading: false,
    });

    mockUseCreateThread.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => baseThread),
      isPending: false,
    });

    mockUseUpdateThreadTitle.mockReturnValue({
      mutate: vi.fn(),
    });
  });

  it("hydrates threads from DB rows and selects first as active", async () => {
    const { result } = renderHook(() => useThreads(), { wrapper });

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0]).toMatchObject({
      id: "thread-1",
      title: "First chat",
    });
    expect(result.current.activeThreadId).toBe("thread-1");
  });

  it("creates a new thread and makes it active", async () => {
    const newThread = {
      ...baseThread,
      thread_id: "thread-2",
      title: null,
    };

    const mutateAsync = vi.fn(async () => newThread);
    mockUseCreateThread.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
    });

    const { result } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(result.current.activeThreadId).toBe("thread-1"));

    await act(async () => {
      await result.current.createThread();
    });

    expect(mutateAsync).toHaveBeenCalledWith(null);
    expect(result.current.activeThreadId).toBe("thread-2");
  });

  it("does not change active thread for unknown ids", async () => {
    const { result } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(result.current.activeThreadId).toBe("thread-1"));

    act(() => {
      result.current.selectThread("thread-does-not-exist");
    });

    expect(result.current.activeThreadId).toBe("thread-1");
  });

  it("delegates title updates to mutation hook", async () => {
    const mutate = vi.fn();
    mockUseUpdateThreadTitle.mockReturnValue({ mutate });

    const { result } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(result.current.activeThreadId).toBe("thread-1"));

    act(() => {
      result.current.updateThreadTitle("thread-1", "Renamed");
    });

    expect(mutate).toHaveBeenCalledWith({
      threadId: "thread-1",
      title: "Renamed",
    });
  });

  it("throws outside provider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useThreads())).toThrow(
      "useThreads must be used within a ThreadProvider",
    );

    consoleSpy.mockRestore();
  });
});
