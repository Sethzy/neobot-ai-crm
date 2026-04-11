/**
 * Tests for the runner-backed App Router chat endpoint.
 * @module lib/ai/__tests__/chat-route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MessageQuotaError,
  messageQuotaErrorCodes,
} from "@/lib/usage/message-quota";

const {
  mockRunManagedAgent,
  mockResumeManagedAgentFromApproval,
  mockCreateClient,
  mockResolveClientId,
  mockCaptureServerEvent,
  mockCaptureServerEvents,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockGenerateTitleFromUserMessage,
  mockEnsureClientBootstrap,
  mockGetAnthropicClient,
  mockGetOrCreateSession,
  mockAttachFileToSession,
} = vi.hoisted(() => ({
  mockRunManagedAgent: vi.fn(),
  mockResumeManagedAgentFromApproval: vi.fn(),
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCaptureServerEvent: vi.fn(),
  mockCaptureServerEvents: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  mockGenerateTitleFromUserMessage: vi.fn(),
  mockEnsureClientBootstrap: vi.fn().mockResolvedValue(undefined),
  mockGetAnthropicClient: vi.fn(),
  mockGetOrCreateSession: vi.fn(),
  mockAttachFileToSession: vi.fn(),
}));

vi.mock("@/lib/managed-agents/adapter", () => ({
  runManagedAgent: mockRunManagedAgent,
  resumeManagedAgentFromApproval: mockResumeManagedAgentFromApproval,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
  captureServerEvents: (...args: unknown[]) => mockCaptureServerEvents(...args),
}));


vi.mock("ai", () => ({
  createUIMessageStream: mockCreateUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitleFromUserMessage: mockGenerateTitleFromUserMessage,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
}));

vi.mock("@/lib/runner/skills/ensure-client-bootstrap", () => ({
  ensureClientBootstrap: mockEnsureClientBootstrap,
}));

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: mockGetAnthropicClient,
}));

vi.mock("@/lib/managed-agents/session-kickoff", () => ({
  getOrCreateSession: mockGetOrCreateSession,
}));

vi.mock("@/lib/managed-agents/attach-session-file", () => ({
  attachFileToSession: mockAttachFileToSession,
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@json-render/core", () => ({
  pipeJsonRender: vi.fn((stream: unknown) => stream),
}));

import { POST, maxDuration } from "../../../../app/api/chat/route";

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  const threadId = "770e8400-e29b-41d4-a716-446655440000";

  it("exports a 300 second maxDuration (Pro-plan ceiling) for chat runs", () => {
    expect(maxDuration).toBe(300);
  });

  function createThreadLookup(options: { threadExists: boolean; error?: { message: string } | null }) {
    const { threadExists, error = null } = options;
    const threadMaybeSingle = vi.fn().mockResolvedValue(
      threadExists
        ? { data: { thread_id: threadId, title: "Existing thread" }, error }
        : { data: null, error },
    );
    const clientSingle = vi.fn().mockResolvedValue({
      data: { client_profile: null, user_preferences: null },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "conversation_threads") {
        const thirdEq = vi.fn(() => ({ maybeSingle: threadMaybeSingle }));
        const secondEq = vi.fn(() => ({ eq: thirdEq }));
        const firstEq = vi.fn(() => ({ eq: secondEq }));
        const select = vi.fn(() => ({ eq: firstEq }));
        return { select };
      }

      if (table === "clients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: clientSingle })),
          })),
        };
      }

      if (table === "conversation_messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    return { from };
  }

  function createMissingThreadWithInsert() {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "conversation_threads") {
        const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        const thirdEq = vi.fn(() => ({ maybeSingle }));
        const secondEq = vi.fn(() => ({ eq: thirdEq }));
        const firstEq = vi.fn(() => ({ eq: secondEq }));
        const select = vi.fn(() => ({ eq: firstEq }));
        return { select, insert };
      }

      if (table === "clients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { client_profile: null, user_preferences: null },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "conversation_messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    return { from, insert };
  }

  function createMissingThreadWithInsertAndUpdate() {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const deleteClientEq = vi.fn().mockResolvedValue({ error: null });
    const deleteThreadEq = vi.fn(() => ({ eq: deleteClientEq }));
    const deleteRow = vi.fn(() => ({ eq: deleteThreadEq }));
    const from = vi.fn((table: string) => {
      if (table === "conversation_threads") {
        const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        const thirdEq = vi.fn(() => ({ maybeSingle }));
        const secondEq = vi.fn(() => ({ eq: thirdEq }));
        const firstEq = vi.fn(() => ({ eq: secondEq }));
        const select = vi.fn(() => ({ eq: firstEq }));
        return { select, insert, update, delete: deleteRow };
      }

      if (table === "clients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { client_profile: null, user_preferences: null },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "conversation_messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
    return { from, insert, update, updateEq, deleteRow, deleteThreadEq, deleteClientEq };
  }

  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-key";

    mockCreateClient.mockResolvedValue(mockSupabase);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSupabase.from = createThreadLookup({ threadExists: true }).from;
    mockResolveClientId.mockResolvedValue("client-456");
    mockGetAnthropicClient.mockReturnValue({ apiKey: "test" });
    mockGetOrCreateSession.mockResolvedValue({ id: "session-1", created: false });
    mockAttachFileToSession.mockResolvedValue({
      attached: true,
      anthropicFileId: "file-1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Blob(["image-data"], { type: "image/png" })),
      ),
    );
  });

  it("calls runManagedAgent with AI SDK transport payload and returns stream response", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const uiStream = new ReadableStream();
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue(uiStream);

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello, Sunder!" }],
        },
      }),
    );

    expect(mockResolveClientId).toHaveBeenCalledWith(mockSupabase, "user-123");
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic: { apiKey: "test" },
        supabase: mockSupabase,
        clientId: "client-456",
        threadId,
        input: "Hello, Sunder!",
        userMessageSourceId: "11111111-1111-4111-8111-111111111111",
        clientProfile: null,
        userPreferences: null,
        threadTitle: "Existing thread",
      }),
    );
    expect(mockCreateUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        execute: expect.any(Function),
        originalMessages: undefined,
      }),
    );
    const execute = mockCreateUIMessageStream.mock.calls[0][0].execute as (args: {
      writer: { merge: (stream: ReadableStream) => void };
    }) => Promise<void>;
    const merge = vi.fn();
    await execute({ writer: { merge } });

    expect(merge).toHaveBeenCalledWith(uiStream);

    const responseOptions = mockCreateUIMessageStreamResponse.mock.calls[0][0] as {
      stream: ReadableStream;
    };
    expect(responseOptions.stream).toBe(wrappedStream);

    expect(response).toBe(streamResponse);
  });

  it("accepts message payload as a user UIMessage object", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    const mockStreamResult = {
      toUIMessageStream: vi.fn(() => new ReadableStream()),
    };
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello from message payload" }],
        },
      }),
    );

    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic: { apiKey: "test" },
        supabase: mockSupabase,
        clientId: "client-456",
        threadId,
        input: "Hello from message payload",
        userMessageSourceId: "11111111-1111-4111-8111-111111111111",
        clientProfile: null,
        userPreferences: null,
        threadTitle: "Existing thread",
      }),
    );
    expect(mockCreateUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        originalMessages: undefined,
      }),
    );
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: "client-456",
      event: "chat_message_sent",
      properties: {
        thread_id: threadId,
        is_new_thread: false,
        has_files: false,
        file_count: 0,
      },
    });
    expect(response).toBe(streamResponse);
  });

  it("accepts selectedChatModel when the model is allowed but ignores it downstream", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue(new ReadableStream());

    await POST(
      createJsonRequest({
        id: threadId,
        selectedChatModel: "anthropic/claude-sonnet-4-6",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Use Sonnet for this." }],
        },
      }),
    );

    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Use Sonnet for this.",
      }),
    );
  });

  it("returns 400 when selectedChatModel is not in the allowed model set", async () => {
    const response = await POST(
      createJsonRequest({
        id: threadId,
        selectedChatModel: "invalid/model-id",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid selected chat model.",
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 400 when selectedChatModel is an empty string", async () => {
    const response = await POST(
      createJsonRequest({
        id: threadId,
        selectedChatModel: "",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid selected chat model.",
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("accepts image-only user messages and forwards file parts to the runner", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue(new ReadableStream());

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [
            {
              type: "file",
              filename: "screenshot.png",
              mediaType: "image/png",
              url: "https://storage.example.com/agent-files/client-1/uploads/screenshot.png?token=signed",
              storagePath: "uploads/screenshot.png",
            },
          ],
        },
      }),
    );

    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-456",
        threadId,
        input: "",
        userMessageSourceId: "11111111-1111-4111-8111-111111111111",
        fileParts: [
          {
            type: "file",
            filename: "screenshot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/agent-files/client-1/uploads/screenshot.png?token=signed",
            storagePath: "uploads/screenshot.png",
          },
        ],
        anthropic: { apiKey: "test" },
      }),
    );
    expect(mockGetOrCreateSession).not.toHaveBeenCalled();
    expect(mockAttachFileToSession).not.toHaveBeenCalled();
    expect(response).toBe(streamResponse);
  });

  it("routes approval-responded parts through resumeManagedAgentFromApproval", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "streaming",
      stream: new ReadableStream(),
      threadId,
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-delete_contact",
                toolCallId: "tool-call-1",
                state: "approval-responded",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Proceed." }] },
        ],
      }),
    );

    expect(response).toBe(streamResponse);
    expect(mockResumeManagedAgentFromApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: mockSupabase,
        clientId: "client-456",
        approvalId: "approval-1",
        approved: true,
      }),
    );
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
    expect(mockCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "approval_resolved",
        properties: expect.objectContaining({
          approval_id: "approval-1",
          outcome: "approved",
          source: "web",
        }),
      }),
    );
    expect(mockCaptureServerEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "chat_message_sent" }),
    );
  });

  it("returns 404 when the approval event is missing", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "missing",
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-delete_contact",
                toolCallId: "tool-call-1",
                state: "approval-responded",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Proceed." }] },
        ],
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Approval not found." });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 409 when the approval was already resolved", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "already_resolved",
      threadId,
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-delete_contact",
                toolCallId: "tool-call-1",
                state: "approval-responded",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Proceed." }] },
        ],
      }),
    );

    expect(response.status).toBe(409);
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 500 when the resume adapter reports an internal error", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "error",
      error: "approval event missing session_id",
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-delete_contact",
                toolCallId: "tool-call-1",
                state: "approval-responded",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Proceed." }] },
        ],
      }),
    );

    expect(response.status).toBe(500);
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 409 when runner cannot acquire thread lock", async () => {
    mockRunManagedAgent.mockResolvedValue({ status: "queued" });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Follow up" }],
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Another response is still in progress for this thread. Please wait and try again.",
    });
  });

  it("creates thread lazily when thread does not exist and request contains user message", async () => {
    const { from, insert, update, updateEq } = createMissingThreadWithInsertAndUpdate();
    mockSupabase.from = from;
    mockGenerateTitleFromUserMessage.mockResolvedValue("Generated title");

    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const uiStream = new ReadableStream();
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue(uiStream);

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Create lazily" }],
        },
      }),
    );

    expect(insert).toHaveBeenCalledWith({
      thread_id: threadId,
      client_id: "client-456",
      title: null,
    });
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic: { apiKey: "test" },
        supabase: mockSupabase,
        clientId: "client-456",
        threadId,
        input: "Create lazily",
        userMessageSourceId: "11111111-1111-4111-8111-111111111111",
        clientProfile: null,
        userPreferences: null,
        threadTitle: null,
      }),
    );
    const execute = mockCreateUIMessageStream.mock.calls[0][0].execute as (args: {
      writer: { merge: (stream: ReadableStream) => void; write: (part: unknown) => void };
    }) => Promise<void>;
    const merge = vi.fn();
    const write = vi.fn();
    await execute({ writer: { merge, write } });
    expect(mockGenerateTitleFromUserMessage).toHaveBeenCalledWith("Create lazily");
    expect(merge).toHaveBeenCalledWith(uiStream);
    expect(write).toHaveBeenCalledWith({
      type: "data-chat-title",
      data: "Generated title",
    });
    expect(update).toHaveBeenCalledWith({ title: "Generated title" });
    expect(updateEq).toHaveBeenCalledWith("thread_id", threadId);
    expect(response).toBe(streamResponse);
  });

  it("does not generate a chat title for a new thread when the opening message only contains files", async () => {
    const { from, insert } = createMissingThreadWithInsert();
    mockSupabase.from = from;

    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const uiStream = new ReadableStream();
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue({
      status: "streaming",
      streamResult: {
        toUIMessageStream: vi.fn(() => uiStream),
      },
    });

    await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [
            {
              type: "file",
              filename: "brief.png",
              mediaType: "image/png",
              url: "https://storage.example.com/chat-attachments/client-1/brief.png",
            },
          ],
        },
      }),
    );

    expect(insert).toHaveBeenCalledWith({
      thread_id: threadId,
      client_id: "client-456",
      title: null,
    });
    expect(mockGenerateTitleFromUserMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when thread id is missing", async () => {
    const response = await POST(
      createJsonRequest({
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request body.",
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 400 when only legacy threadId is sent", async () => {
    const response = await POST(
      createJsonRequest({
        threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 400 when user input text cannot be resolved", async () => {
    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [{ id: "a1", role: "assistant", parts: [{ type: "text", text: "Only assistant" }] }],
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request body: normal user turns must use `message`.",
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 400 when a full messages payload only contains historical approval responses", async () => {
    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-delete_contact",
                toolCallId: "tool-call-1",
                state: "approval-responded",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Approved earlier" }] },
          { id: "a2", role: "assistant", parts: [{ type: "text", text: "Done" }] },
          { id: "u2", role: "user", parts: [{ type: "text", text: "Fresh request" }] },
        ],
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request body: normal user turns must use `message`.",
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 401 when request is unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
  });

  it("returns 404 when the thread is missing for the client", async () => {
    mockSupabase.from = createThreadLookup({ threadExists: false }).from;

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-delete_contact",
                toolCallId: "tool-call-1",
                state: "approval-responded",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        ],
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Thread not found." });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 500 when thread lookup fails", async () => {
    mockSupabase.from = createThreadLookup({
      threadExists: false,
      error: { message: "database unavailable" },
    }).from;

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to process chat request." });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body." });
  });

  it("does not fail at the route level when AI gateway key is missing (validation deferred to runner)", async () => {
    delete process.env.AI_GATEWAY_API_KEY;

    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    mockCreateUIMessageStream.mockReturnValue(new ReadableStream());
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { toUIMessageStream: vi.fn(() => new ReadableStream()) },
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    // Route proceeds — AI_GATEWAY_API_KEY is validated by getServerEnv() inside the runner
    expect(response).toBe(streamResponse);
  });

  it("returns 400 when thread id is not a UUID", async () => {
    const response = await POST(
      createJsonRequest({
        id: "thread-not-uuid",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request body.",
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("returns 500 with a stable payload when runner throws", async () => {
    mockRunManagedAgent.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to process chat request." });
  });

  it("returns 402 with structured quota payload when the monthly message cap is reached", async () => {
    mockRunManagedAgent.mockRejectedValue(
      new MessageQuotaError(
        messageQuotaErrorCodes.limitReached,
        "Monthly message limit reached.",
        {
          quota: {
            allowed: false,
            clientId: "client-456",
            planName: "Free",
            monthlyMessageLimit: 100,
            messagesUsed: 100,
            messagesRemaining: 0,
            periodStart: "2026-03-01",
            nextResetDate: "2026-04-01",
          },
        },
      ),
    );

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: "Monthly message limit reached.",
      code: "message-quota-exceeded",
      quota: {
        allowed: false,
        clientId: "client-456",
        planName: "Free",
        monthlyMessageLimit: 100,
        messagesUsed: 100,
        messagesRemaining: 0,
        periodStart: "2026-03-01",
        nextResetDate: "2026-04-01",
      },
    });
  });

  it("deletes a newly-created thread when the opening message is blocked by quota", async () => {
    const { from, insert, deleteRow, deleteThreadEq, deleteClientEq } =
      createMissingThreadWithInsertAndUpdate();
    mockSupabase.from = from;
    mockRunManagedAgent.mockRejectedValue(
      new MessageQuotaError(
        messageQuotaErrorCodes.limitReached,
        "Monthly message limit reached.",
        {
          quota: {
            allowed: false,
            clientId: "client-456",
            planName: "Free",
            monthlyMessageLimit: 100,
            messagesUsed: 100,
            messagesRemaining: 0,
            periodStart: "2026-03-01",
            nextResetDate: "2026-04-01",
          },
        },
      ),
    );

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Create lazily" }],
        },
      }),
    );

    expect(response.status).toBe(402);
    expect(insert).toHaveBeenCalledWith({
      thread_id: threadId,
      client_id: "client-456",
      title: null,
    });
    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(deleteThreadEq).toHaveBeenCalledWith("thread_id", threadId);
    expect(deleteClientEq).toHaveBeenCalledWith("client_id", "client-456");
  });

  it("returns 500 without calling runManagedAgent when ensureClientBootstrap fails", async () => {
    mockEnsureClientBootstrap.mockRejectedValueOnce(new Error("storage down"));

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to process chat request." });
    expect(mockRunManagedAgent).not.toHaveBeenCalled();
  });

  it("awaits ensureClientBootstrap before calling runManagedAgent", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    mockCreateUIMessageStream.mockReturnValue(new ReadableStream());
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunManagedAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { toUIMessageStream: vi.fn(() => new ReadableStream()) },
    });

    await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      }),
    );

    expect(mockEnsureClientBootstrap).toHaveBeenCalledWith(mockSupabase, "client-456");
    expect(mockEnsureClientBootstrap.mock.invocationCallOrder[0]).toBeLessThan(
      mockRunManagedAgent.mock.invocationCallOrder[0],
    );
  });
});
