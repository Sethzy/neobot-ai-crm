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
  mockGetAnthropicClient,
  mockRunManagedAgent,
  mockUpsertMessage,
  mockCreateAdminClient,
  mockMeetingSingle,
  mockConversationMessagesLimit,
  mockMeetingUpdateEq,
  mockThreadInsert,
  mockThreadDeleteEq,
  mockClientSingle,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockJsonError: vi.fn((message: string, status: number) =>
    Response.json({ error: message }, { status })),
  mockResolveClientId: vi.fn(),
  mockGetAnthropicClient: vi.fn(),
  mockRunManagedAgent: vi.fn(),
  mockUpsertMessage: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockMeetingSingle: vi.fn(),
  mockConversationMessagesLimit: vi.fn(),
  mockMeetingUpdateEq: vi.fn(),
  mockThreadInsert: vi.fn(),
  mockThreadDeleteEq: vi.fn(),
  mockClientSingle: vi.fn(),
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

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: (...args: unknown[]) => mockGetAnthropicClient(...args),
}));

vi.mock("@/lib/managed-agents/adapter", () => ({
  runManagedAgent: (...args: unknown[]) => mockRunManagedAgent(...args),
}));

vi.mock("@/lib/chat/messages", () => ({
  upsertMessage: (...args: unknown[]) => mockUpsertMessage(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

import { POST } from "./route";

describe("POST /api/meetings/[id]/send-to-agent", () => {
  let scheduledAfterCallback: (() => Promise<void> | void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledAfterCallback = null;

    const adminSupabase = {
      from: vi.fn((table: string) => {
        if (table === "clients") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: mockClientSingle,
              }),
            }),
          };
        }

        throw new Error(`Unexpected admin table: ${table}`);
      }),
    };

    mockAfter.mockImplementation(async (callback: () => Promise<void> | void) => {
      scheduledAfterCallback = callback;
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

          if (table === "clients") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockClientSingle,
                }),
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
    mockUpsertMessage.mockResolvedValue({ message_id: "msg-1" });
    mockClientSingle.mockResolvedValue({
      data: {
        client_profile: "Client profile",
        user_preferences: "User preferences",
      },
      error: null,
    });
    mockGetAnthropicClient.mockReturnValue({ id: "anthropic-client" });
    mockCreateAdminClient.mockResolvedValue(adminSupabase);
    mockRunManagedAgent.mockResolvedValue(new ReadableStream({
      start(controller) {
        controller.close();
      },
    }));
  });

  it("creates a thread, persists the handoff message, and defers the same-thread run", async () => {
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
    expect(mockUpsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: body.threadId,
        role: "user",
        source_event_id: "meeting-handoff:meeting-1",
      }),
    );
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
    expect(mockClientSingle).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(scheduledAfterCallback).toBeTypeOf("function");

    await scheduledAfterCallback?.();

    expect(mockCreateAdminClient).toHaveBeenCalledOnce();
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic: { id: "anthropic-client" },
        clientId: "client-1",
        threadId: body.threadId,
        input: expect.stringContaining("A meeting was just recorded and auto-summarized."),
        threadTitle: "Portfolio Review",
        clientProfile: "Client profile",
        userPreferences: "User preferences",
        userMessageSourceId: "meeting-handoff:meeting-1",
      }),
    );
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Use `storage_read` on that exact path."),
      }),
    );
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Do not use the built-in `read` tool"),
      }),
    );
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
    expect(mockUpsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "thread-1",
        source_event_id: "meeting-handoff:meeting-1",
      }),
    );
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();

    await scheduledAfterCallback?.();

    expect(mockCreateAdminClient).toHaveBeenCalledOnce();
    expect(mockRunManagedAgent).toHaveBeenCalledOnce();
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
      }),
    );
  });

  it("rolls back the thread link when handoff message persistence fails", async () => {
    mockUpsertMessage.mockRejectedValueOnce(new Error("insert failed"));

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
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });
});
