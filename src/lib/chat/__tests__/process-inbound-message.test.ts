/**
 * Tests for shared inbound message orchestration.
 * @module lib/chat/__tests__/process-inbound-message
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunAgent,
  mockCreateThread,
  mockGetThreadIdForExternalConversation,
  mockEnsureExternalConversationMapping,
  mockRecordInboundDelivery,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateThread: vi.fn(),
  mockGetThreadIdForExternalConversation: vi.fn(),
  mockEnsureExternalConversationMapping: vi.fn(),
  mockRecordInboundDelivery: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}));

vi.mock("@/lib/chat/threads", () => ({
  createThread: (...args: unknown[]) => mockCreateThread(...args),
}));

vi.mock("@/lib/chat/channel-routing", () => ({
  getThreadIdForExternalConversation: (...args: unknown[]) =>
    mockGetThreadIdForExternalConversation(...args),
  ensureExternalConversationMapping: (...args: unknown[]) =>
    mockEnsureExternalConversationMapping(...args),
  recordInboundDelivery: (...args: unknown[]) => mockRecordInboundDelivery(...args),
}));

import { processInboundMessage } from "@/lib/chat/process-inbound-message";

function createThreadLookupSupabase(options: { threadExists: boolean; threadId?: string }) {
  const { threadExists, threadId = "11111111-1111-4111-8111-111111111111" } = options;
  const maybeSingle = vi.fn().mockResolvedValue(
    threadExists
      ? { data: { thread_id: threadId }, error: null }
      : { data: null, error: null },
  );
  const thirdEq = vi.fn(() => ({ maybeSingle }));
  const secondEq = vi.fn(() => ({ eq: thirdEq }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ select }));
  return { from };
}

describe("processInboundMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThreadIdForExternalConversation.mockResolvedValue(null);
    mockEnsureExternalConversationMapping.mockImplementation(
      async (_supabase: unknown, mapping: { threadId: string }) => mapping.threadId,
    );
    mockRecordInboundDelivery.mockResolvedValue(true);
    mockCreateThread.mockResolvedValue({ thread_id: "thread-created" });
  });

  it("uses mapped thread id when external conversation mapping exists", async () => {
    const supabase = createThreadLookupSupabase({ threadExists: false });
    mockGetThreadIdForExternalConversation.mockResolvedValue("thread-mapped");
    mockRunAgent.mockResolvedValue({
      status: "queued",
    });

    const result = await processInboundMessage({
      supabase: supabase as never,
      clientId: "client-123",
      channel: "web",
      externalConversationId: "external-1",
      messageText: "Hello",
      requestedThreadId: "thread-requested",
    });

    expect(result).toEqual({
      status: "queued",
      threadId: "thread-mapped",
    });
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-123",
        threadId: "thread-mapped",
        input: "Hello",
      }),
      supabase,
    );
  });

  it("reuses requested thread when it exists for the client and backfills mapping", async () => {
    const requestedThreadId = "22222222-2222-4222-8222-222222222222";
    const supabase = createThreadLookupSupabase({ threadExists: true, threadId: requestedThreadId });
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const result = await processInboundMessage({
      supabase: supabase as never,
      clientId: "client-123",
      channel: "web",
      externalConversationId: "external-1",
      messageText: "Hello",
      requestedThreadId,
    });

    expect(result).toEqual({
      status: "queued",
      threadId: requestedThreadId,
    });
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockEnsureExternalConversationMapping).toHaveBeenCalledWith(
      supabase,
      {
        clientId: "client-123",
        channel: "web",
        externalConversationId: "external-1",
        threadId: requestedThreadId,
      },
    );
  });

  it("creates a thread when mapping and requested thread are missing", async () => {
    const supabase = createThreadLookupSupabase({ threadExists: false });
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const result = await processInboundMessage({
      supabase: supabase as never,
      clientId: "client-123",
      channel: "telegram",
      externalConversationId: "tg-chat-1",
      messageText: "New external message",
    });

    expect(result).toEqual({
      status: "queued",
      threadId: "thread-created",
    });
    expect(mockCreateThread).toHaveBeenCalledWith(
      supabase,
      "client-123",
      "New external message",
    );
    expect(mockEnsureExternalConversationMapping).toHaveBeenCalledWith(
      supabase,
      {
        clientId: "client-123",
        channel: "telegram",
        externalConversationId: "tg-chat-1",
        threadId: "thread-created",
      },
    );
  });

  it("uses winning thread id from atomic mapping when race occurs", async () => {
    const supabase = createThreadLookupSupabase({ threadExists: false });
    mockCreateThread.mockResolvedValue({ thread_id: "thread-loser" });
    mockEnsureExternalConversationMapping.mockResolvedValue("thread-winner");
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const result = await processInboundMessage({
      supabase: supabase as never,
      clientId: "client-123",
      channel: "telegram",
      externalConversationId: "tg-chat-1",
      messageText: "Raced message",
    });

    expect(result.threadId).toBe("thread-winner");
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-winner" }),
      supabase,
    );
  });

  it("short-circuits duplicates when delivery id was already processed", async () => {
    const requestedThreadId = "22222222-2222-4222-8222-222222222222";
    const supabase = createThreadLookupSupabase({ threadExists: true, threadId: requestedThreadId });
    mockRecordInboundDelivery.mockResolvedValue(false);

    const result = await processInboundMessage({
      supabase: supabase as never,
      clientId: "client-123",
      channel: "telegram",
      externalConversationId: "tg-chat-1",
      messageText: "Duplicate payload",
      requestedThreadId,
      deliveryId: "delivery-1",
    });

    expect(result).toEqual({
      status: "duplicate",
      threadId: requestedThreadId,
    });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});
