/**
 * Tests for server-side chat thread route loading.
 * @module app/(dashboard)/chat/[threadId]/page.test
 */
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ChatThreadPage from "./page";

const VALID_THREAD_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_THREAD_ID = "22222222-2222-4222-8222-222222222222";

const mockCreateClient = vi.fn();
const mockResolveClientId = vi.fn();
const mockListMessages = vi.fn();
const mockLoadCurrentMessageQuota = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/chat/messages", () => ({
  listMessages: (...args: unknown[]) => mockListMessages(...args),
}));

vi.mock("@/lib/usage/message-quota-server", () => ({
  loadCurrentMessageQuota: (...args: unknown[]) => mockLoadCurrentMessageQuota(...args),
}));

vi.mock("./chat-thread-page-client", () => ({
  ChatThreadPageClient: ({
    threadId,
    initialMessages,
    initialQuota,
  }: {
    threadId: string;
    initialMessages: Array<{ id: string; role: string; parts: unknown[] }>;
    initialQuota?: { messagesRemaining: number } | null;
  }) => (
    <div>
      <div data-testid="thread-id">{threadId}</div>
      <div data-testid="initial-message-count">{initialMessages.length}</div>
      <div data-testid="first-message-text">
        {String((initialMessages[0]?.parts?.[0] as { text?: string } | undefined)?.text ?? "")}
      </div>
      <div data-testid="quota-remaining">{String(initialQuota?.messagesRemaining ?? "none")}</div>
    </div>
  ),
}));

vi.mock("@/components/chat/data-stream-handler", () => ({
  DataStreamHandler: () => <div data-testid="data-stream-handler" />,
}));

function createThreadLookupSupabase(options: {
  threadExists: boolean;
  error?: { message: string } | null;
}) {
  const { threadExists, error = null } = options;
  const maybeSingle = vi.fn().mockResolvedValue(
    threadExists
      ? { data: { thread_id: VALID_THREAD_ID }, error }
      : { data: null, error },
  );
  const thirdEq = vi.fn(() => ({ maybeSingle }));
  const secondEq = vi.fn(() => ({ eq: thirdEq }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ select }));

  return { from };
}

describe("/chat/[threadId] page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCurrentMessageQuota.mockResolvedValue({
      clientId: "client-123",
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 20,
      messagesRemaining: 80,
      periodStart: "2026-03-01",
      nextResetDate: "2026-04-01",
    });
  });

  it("loads thread messages server-side and passes mapped initialMessages to client page", async () => {
    const supabase = createThreadLookupSupabase({ threadExists: true });
    mockCreateClient.mockResolvedValue(supabase);
    mockResolveClientId.mockResolvedValue("client-123");
    mockListMessages.mockResolvedValue([
      {
        message_id: "m1",
        role: "assistant",
        content: "Loaded from server",
        parts: null,
      },
    ]);

    const element = await ChatThreadPage({
      params: Promise.resolve({ threadId: VALID_THREAD_ID }),
    });
    render(element);

    expect(screen.getByTestId("thread-id")).toHaveTextContent(VALID_THREAD_ID);
    expect(screen.getByTestId("initial-message-count")).toHaveTextContent("1");
    expect(screen.getByTestId("first-message-text")).toHaveTextContent("Loaded from server");
    expect(screen.getByTestId("quota-remaining")).toHaveTextContent("80");
    expect(screen.getByTestId("data-stream-handler")).toBeInTheDocument();
    expect(mockListMessages).toHaveBeenCalledWith(supabase, VALID_THREAD_ID);
  });

  it("redirects to /chat when thread does not exist for the client", async () => {
    const supabase = createThreadLookupSupabase({ threadExists: false });
    mockCreateClient.mockResolvedValue(supabase);
    mockResolveClientId.mockResolvedValue("client-123");

    const element = await ChatThreadPage({
      params: Promise.resolve({ threadId: MISSING_THREAD_ID }),
    });

    expect(element).toBeNull();
    expect(redirect).toHaveBeenCalledWith("/chat");
    expect(mockListMessages).not.toHaveBeenCalled();
  });

  it("throws when thread lookup fails", async () => {
    const supabase = createThreadLookupSupabase({
      threadExists: false,
      error: { message: "database unavailable" },
    });
    mockCreateClient.mockResolvedValue(supabase);
    mockResolveClientId.mockResolvedValue("client-123");

    await expect(
      ChatThreadPage({
        params: Promise.resolve({ threadId: VALID_THREAD_ID }),
      }),
    ).rejects.toThrow("Failed to load thread.");
    expect(mockListMessages).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /chat for invalid threadId format before DB lookup", async () => {
    await ChatThreadPage({
      params: Promise.resolve({ threadId: "not-a-uuid" }),
    });

    expect(redirect).toHaveBeenCalledWith("/chat");
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockListMessages).not.toHaveBeenCalled();
  });
});
