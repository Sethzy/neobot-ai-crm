/**
 * Tests for the meeting send-to-agent route.
 * @module app/api/meetings/[id]/send-to-agent/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAfter,
  mockAuthenticateRequest,
  mockJsonError,
  mockResolveClientId,
  mockRunAgent,
  mockCreateMessage,
  mockMeetingSingle,
  mockConversationMessagesLimit,
  mockMeetingUpdateEq,
  mockThreadInsert,
  mockThreadDeleteEq,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockJsonError: vi.fn((message: string, status: number) =>
    Response.json({ error: message }, { status })),
  mockResolveClientId: vi.fn(),
  mockRunAgent: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockMeetingSingle: vi.fn(),
  mockConversationMessagesLimit: vi.fn(),
  mockMeetingUpdateEq: vi.fn(),
  mockThreadInsert: vi.fn(),
  mockThreadDeleteEq: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();

  return {
    ...actual,
    after: mockAfter,
  };
});

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (...args: unknown[]) => mockJsonError(...args),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
}));

import { POST } from "./route";

describe("POST /api/meetings/[id]/send-to-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAfter.mockImplementation(async (callback: () => Promise<void> | void) => {
      await callback();
    });

    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "meeting_records") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: mockMeetingSingle,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: mockMeetingUpdateEq,
              }),
            };
          }

          if (table === "conversation_messages") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: mockConversationMessagesLimit,
                }),
              }),
            };
          }

          if (table === "conversation_threads") {
            return {
              insert: mockThreadInsert,
              delete: vi.fn().mockReturnValue({
                eq: mockThreadDeleteEq,
              }),
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        }),
      },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockConversationMessagesLimit.mockResolvedValue({
      data: [{ message_id: "msg-existing" }],
      error: null,
    });
    mockMeetingSingle.mockResolvedValue({
      data: {
        meeting_record_id: "meeting-1",
        title: "Portfolio Review",
        summary: "- Discussed portfolio\n- Follow up Thursday",
        notes: "call back Thursday",
        duration_seconds: 2700,
        transcript_path: "home/meetings/2026-04-06-meeting-meeting-1.md",
        thread_id: null,
        created_at: "2026-04-06T09:30:00.000Z",
      },
      error: null,
    });
    mockThreadInsert.mockResolvedValue({ error: null });
    mockThreadDeleteEq.mockResolvedValue({ error: null });
    mockMeetingUpdateEq.mockResolvedValue({ error: null });
    mockCreateMessage.mockResolvedValue({ message_id: "msg-1" });
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { text: Promise.resolve("ok") },
    });
  });

  it("creates a thread, user message, and returns the threadId", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/meeting-1/send-to-agent", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "meeting-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.threadId).toBeDefined();
    expect(mockThreadInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-1",
        title: "Portfolio Review",
      }),
    );
    expect(mockCreateMessage).toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockRunAgent).toHaveBeenCalled();
  });

  it("repairs a partially created handoff when the thread exists without messages", async () => {
    mockMeetingSingle.mockResolvedValue({
      data: {
        meeting_record_id: "meeting-1",
        title: "Portfolio Review",
        summary: "- Discussed portfolio\n- Follow up Thursday",
        notes: "call back Thursday",
        duration_seconds: 2700,
        transcript_path: "home/meetings/2026-04-06-meeting-meeting-1.md",
        thread_id: "thread-1",
        created_at: "2026-04-06T09:30:00.000Z",
      },
      error: null,
    });
    mockConversationMessagesLimit.mockResolvedValue({
      data: [],
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/meetings/meeting-1/send-to-agent", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "meeting-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      threadId: "thread-1",
    });
    expect(mockCreateMessage).toHaveBeenCalledOnce();
    expect(mockRunAgent).toHaveBeenCalledOnce();
  });

  it("rolls back the thread link when handoff message creation fails", async () => {
    mockCreateMessage.mockRejectedValueOnce(new Error("insert failed"));

    const response = await POST(
      new Request("http://localhost/api/meetings/meeting-1/send-to-agent", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "meeting-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to send to agent",
    });
    expect(mockMeetingUpdateEq).toHaveBeenCalledTimes(2);
    expect(mockThreadDeleteEq).toHaveBeenCalledWith(
      "thread_id",
      expect.anything(),
    );
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});
