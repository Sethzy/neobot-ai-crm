/**
 * Tests for thread context backed by database query hooks.
 * @module contexts/thread-context.test
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadProvider, useThreads } from "./thread-context";

let mockPathname = "/chat";
const mockUseClientId = vi.fn();
const mockUseThreadsQuery = vi.fn();
const mockUseCreateThread = vi.fn();
const mockUseUpdateThreadTitle = vi.fn();
const mockUseArchiveThread = vi.fn();
const mockUseMarkThreadRead = vi.fn();
const mockPostHogIdentify = vi.fn();
const mockPostHogRegister = vi.fn();
const mockPostHogCapture = vi.fn();
const mockSupabaseGetUser = vi.fn();
const mockClientsMaybeSingle = vi.fn();
const mockConsumePendingPostHogAuthEvent = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => mockUseClientId(),
}));

vi.mock("@/hooks/use-threads", () => ({
  threadKeys: {
    all: ["threads"],
    list: (clientId: string) => ["threads", "list", clientId],
  },
  useThreads: (...args: unknown[]) => mockUseThreadsQuery(...args),
  useCreateThread: (...args: unknown[]) => mockUseCreateThread(...args),
  useUpdateThreadTitle: (...args: unknown[]) => mockUseUpdateThreadTitle(...args),
  useArchiveThread: (...args: unknown[]) => mockUseArchiveThread(...args),
  useMarkThreadRead: (...args: unknown[]) => mockUseMarkThreadRead(...args),
}));

vi.mock("posthog-js", () => ({
  default: {
    identify: (...args: unknown[]) => mockPostHogIdentify(...args),
    register: (...args: unknown[]) => mockPostHogRegister(...args),
    capture: (...args: unknown[]) => mockPostHogCapture(...args),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockSupabaseGetUser(...args),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: unknown[]) => mockClientsMaybeSingle(...args),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/analytics/posthog-auth-events", () => ({
  consumePendingPostHogAuthEvent: () => mockConsumePendingPostHogAuthEvent(),
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ThreadProvider>{children}</ThreadProvider>
  </QueryClientProvider>
);

describe("thread context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/chat";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT = "production";
    process.env.NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS = "sunder.com";

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
    mockUseMarkThreadRead.mockReturnValue({
      mutateAsync: vi.fn(async () => baseThread),
    });
    mockSupabaseGetUser.mockResolvedValue({
      data: {
        user: {
          email: "founder@sunder.com",
          user_metadata: {
            full_name: "Seth Lim",
          },
        },
      },
      error: null,
    });
    mockClientsMaybeSingle.mockResolvedValue({
      data: {
        plan_name: "Pro",
        subscription_status: "active",
      },
      error: null,
    });
    mockConsumePendingPostHogAuthEvent.mockReturnValue(null);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT;
    delete process.env.NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS;
  });

  it("hydrates threads from DB rows", async () => {
    const { result } = renderHook(() => useThreads(), { wrapper });

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0]).toMatchObject({
      id: "thread-1",
      title: "First chat",
      isPinned: false,
      isUnread: true,
    });
  });

  it("derives unread state for never-read, stale, and fresh threads", async () => {
    mockUseThreadsQuery.mockReturnValue({
      data: [
        { ...baseThread, thread_id: "never-read", last_read_at: null },
        { ...baseThread, thread_id: "stale", last_read_at: "2026-04-22T09:00:00Z" },
        { ...baseThread, thread_id: "fresh", last_read_at: "2026-04-22T11:00:00Z" },
      ],
      isLoading: false,
    });

    const { result } = renderHook(() => useThreads(), { wrapper });

    await waitFor(() => expect(result.current.threads).toHaveLength(3));
    expect(result.current.threads.map((thread) => thread.isUnread)).toEqual([true, true, false]);
    expect(result.current.unreadCount).toBe(2);
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

  it("optimistically marks the active unread thread as read", async () => {
    mockPathname = "/chat/thread-1";

    const mutateAsync = vi.fn(async () => baseThread);
    mockUseMarkThreadRead.mockReturnValue({
      mutateAsync,
    });

    const { result } = renderHook(() => useThreads(), { wrapper });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(0);
    });
    expect(result.current.threads[0]?.isUnread).toBe(false);
    expect(mutateAsync).toHaveBeenCalled();
    expect(mutateAsync).toHaveBeenCalledWith({
      threadId: "thread-1",
      lastReadAt: expect.any(String),
    });
  });

  it("syncs PostHog identity with environment and internal-user markers", async () => {
    mockConsumePendingPostHogAuthEvent.mockReturnValue({
      event: "signed_in",
      method: "email",
    });

    renderHook(() => useThreads(), { wrapper });

    await waitFor(() => {
      expect(mockPostHogIdentify).toHaveBeenCalledWith("client-1", {
        email: "founder@sunder.com",
        name: "Seth Lim",
        plan_name: "Pro",
        subscription_status: "active",
        environment: "production",
        is_internal: true,
      });
    });

    expect(mockPostHogRegister).toHaveBeenCalledWith({
      environment: "production",
      is_internal: true,
    });
    expect(mockPostHogCapture).toHaveBeenCalledWith("signed_in", {
      method: "email",
      environment: "production",
      is_internal: true,
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
