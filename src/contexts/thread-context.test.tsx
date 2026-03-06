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
const mockUseArchiveThread = vi.fn();

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => mockUseClientId(),
}));

vi.mock("@/hooks/use-threads", () => ({
  useThreads: (...args: unknown[]) => mockUseThreadsQuery(...args),
  useCreateThread: (...args: unknown[]) => mockUseCreateThread(...args),
  useUpdateThreadTitle: (...args: unknown[]) => mockUseUpdateThreadTitle(...args),
  useArchiveThread: (...args: unknown[]) => mockUseArchiveThread(...args),
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

    mockUseArchiveThread.mockReturnValue({
      mutateAsync: vi.fn(async () => baseThread),
    });
  });

  it("hydrates threads from DB rows", async () => {
    const { result } = renderHook(() => useThreads(), { wrapper });

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0]).toMatchObject({
      id: "thread-1",
      title: "First chat",
      isPinned: false,
    });
  });

  it("creates a new thread and returns its id", async () => {
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
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    let newId: string | undefined;
    await act(async () => {
      newId = await result.current.createThread();
    });

    expect(mutateAsync).toHaveBeenCalledWith(null);
    expect(newId).toBe("thread-2");
  });

  it("does not auto-create a thread when none exist", async () => {
    const mutate = vi.fn();

    mockUseThreadsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseCreateThread.mockReturnValue({
      mutate,
      mutateAsync: vi.fn(async () => baseThread),
      isPending: false,
    });

    const { result } = renderHook(() => useThreads(), { wrapper });

    await waitFor(() => {
      expect(result.current.threads).toEqual([]);
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("delegates title updates to mutation hook", async () => {
    const mutate = vi.fn();
    mockUseUpdateThreadTitle.mockReturnValue({ mutate });

    const { result } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      result.current.updateThreadTitle("thread-1", "Renamed");
    });

    expect(mutate).toHaveBeenCalledWith({
      threadId: "thread-1",
      title: "Renamed",
    });
  });

  it("archives a thread and returns true on success", async () => {
    const { result } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.archiveThread("thread-1");
    });

    expect(success).toBe(true);
  });

  it("returns false when archive fails", async () => {
    mockUseArchiveThread.mockReturnValue({
      mutateAsync: vi.fn(async () => { throw new Error("fail"); }),
    });

    const { result } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.archiveThread("thread-1");
    });

    expect(success).toBe(false);
  });

  it("throws outside provider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useThreads())).toThrow(
      "useThreads must be used within a ThreadProvider",
    );

    consoleSpy.mockRestore();
  });
});
