/**
 * Tests TanStack Query hooks for chat message persistence.
 * @module hooks/__tests__/use-chat-messages
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatMessages, useSaveMessages } from "../use-chat-messages";

const mockListMessages = vi.fn();
const mockCreateMessages = vi.fn();

vi.mock("@/lib/chat/messages", () => ({
  listMessages: (...args: unknown[]) => mockListMessages(...args),
  createMessages: (...args: unknown[]) => mockCreateMessages(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { marker: "browser-client" },
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

describe("useChatMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads thread messages in chronological order", async () => {
    const rows = [
      {
        message_id: "message-1",
        thread_id: "thread-1",
        role: "user",
        content: "Hello",
        parts: null,
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        message_id: "message-2",
        thread_id: "thread-1",
        role: "assistant",
        content: "Hi!",
        parts: [{ type: "text", text: "Hi!" }],
        created_at: "2026-03-01T00:00:01Z",
      },
    ];
    mockListMessages.mockResolvedValue(rows);

    const { result } = renderHook(() => useChatMessages("thread-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    expect(mockListMessages).toHaveBeenCalledWith(expect.any(Object), "thread-1");
  });

  test("does not query until a thread id exists", async () => {
    const { result } = renderHook(() => useChatMessages(""), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockListMessages).not.toHaveBeenCalled();
  });
});

describe("useSaveMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("persists a batch of messages for the current thread", async () => {
    const rows = [
      {
        message_id: "message-1",
        thread_id: "thread-1",
        role: "user",
        content: "Hello",
        parts: null,
        created_at: "2026-03-01T00:00:00Z",
      },
    ];
    mockCreateMessages.mockResolvedValue(rows);

    const { result } = renderHook(() => useSaveMessages("thread-1"), {
      wrapper: createWrapper(),
    });

    const payload = [{ role: "user", content: "Hello", parts: null }];
    await expect(result.current.mutateAsync(payload)).resolves.toEqual(rows);
    expect(mockCreateMessages).toHaveBeenCalledWith(expect.any(Object), [
      {
        thread_id: "thread-1",
        role: "user",
        content: "Hello",
        parts: null,
      },
    ]);
  });
});
