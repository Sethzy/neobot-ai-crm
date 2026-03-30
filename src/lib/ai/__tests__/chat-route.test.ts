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
  mockRunAgent,
  mockCreateClient,
  mockResolveClientId,
  mockCaptureServerEvent,
  mockCaptureServerEvents,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockGenerateId,
  mockGenerateTitleFromUserMessage,
  mockSetActiveStreamId,
  mockClearActiveStreamId,
  mockCreateNewResumableStream,
  mockCreateResumableStreamContext,
  mockResolveApprovalEvent,
  mockEnsureClientBootstrap,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCaptureServerEvent: vi.fn(),
  mockCaptureServerEvents: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  mockGenerateId: vi.fn(),
  mockGenerateTitleFromUserMessage: vi.fn(),
  mockSetActiveStreamId: vi.fn(),
  mockClearActiveStreamId: vi.fn(),
  mockCreateNewResumableStream: vi.fn(),
  mockCreateResumableStreamContext: vi.fn(),
  mockResolveApprovalEvent: vi.fn(),
  mockEnsureClientBootstrap: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
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

vi.mock("@/lib/approvals/queries", () => ({
  resolveApprovalEvent: mockResolveApprovalEvent,
}));

vi.mock("ai", () => ({
  createUIMessageStream: mockCreateUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
  generateId: mockGenerateId,
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitleFromUserMessage: mockGenerateTitleFromUserMessage,
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  setActiveStreamId: mockSetActiveStreamId,
  clearActiveStreamId: mockClearActiveStreamId,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
}));

vi.mock("@/lib/memory/bootstrap", () => ({
  ensureClientBootstrap: mockEnsureClientBootstrap,
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/instrumentation", () => ({
  langfuseSpanProcessor: { forceFlush: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@json-render/core", () => ({
  pipeJsonRender: vi.fn((stream: unknown) => stream),
}));

vi.mock("resumable-stream", () => ({
  createResumableStreamContext: mockCreateResumableStreamContext,
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

  /** Returns a mock for the `clients` table — SELECT crm_config_mode_until query. */
  function createClientLookup() {
    const single = vi.fn().mockResolvedValue({
      data: { crm_config_mode_until: null },
      error: null,
    });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    return { select, single };
  }

  function createThreadLookup(options: { threadExists: boolean; error?: { message: string } | null }) {
    const { threadExists, error = null } = options;
    const clientLookup = createClientLookup();
    const maybeSingle = vi.fn().mockResolvedValue(
      threadExists
        ? { data: { thread_id: threadId }, error }
        : { data: null, error },
    );
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn((table: string) => {
      if (table === "clients") return clientLookup;
      return { select };
    });

    return { from };
  }

  function createMissingThreadWithInsert() {
    const clientLookup = createClientLookup();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "clients") return clientLookup;
      return { select, insert };
    });

    return { from, insert };
  }

  function createMissingThreadWithInsertAndUpdate() {
    const clientLookup = createClientLookup();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));

    const insert = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const deleteClientEq = vi.fn().mockResolvedValue({ error: null });
    const deleteThreadEq = vi.fn(() => ({ eq: deleteClientEq }));
    const deleteRow = vi.fn(() => ({ eq: deleteThreadEq }));

    const from = vi.fn((table: string) => {
      if (table === "clients") return clientLookup;
      return { select, insert, update, delete: deleteRow };
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
    process.env.REDIS_URL = "redis://localhost:6379";

    mockCreateClient.mockResolvedValue(mockSupabase);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSupabase.from = createThreadLookup({ threadExists: true }).from;
    mockResolveClientId.mockResolvedValue("client-456");
    mockGenerateId.mockReturnValue("stream-123");
    mockCreateResumableStreamContext.mockReturnValue({
      createNewResumableStream: mockCreateNewResumableStream,
    });
  });

  it("calls runAgent with AI SDK transport payload and returns stream response", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const uiStream = new ReadableStream();
    const wrappedStream = new ReadableStream();
    const mockStreamResult = {
      toUIMessageStream: vi.fn(() => uiStream),
    };
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);

    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

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
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: "Hello, Sunder!",
        crmMode: undefined,
      },
      mockSupabase,
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

    const onFinish = mockCreateUIMessageStream.mock.calls[0][0].onFinish as () => Promise<void>;
    await onFinish();

    expect(mockStreamResult.toUIMessageStream).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith(uiStream);
    expect(mockClearActiveStreamId).toHaveBeenCalledWith(threadId);

    const responseOptions = mockCreateUIMessageStreamResponse.mock.calls[0][0] as {
      stream: ReadableStream;
      consumeSseStream: (args: { stream: ReadableStream }) => Promise<void>;
    };
    expect(responseOptions.stream).toBe(wrappedStream);
    expect(typeof responseOptions.consumeSseStream).toBe("function");

    await responseOptions.consumeSseStream({ stream: uiStream });

    expect(mockSetActiveStreamId).toHaveBeenCalledWith(threadId, "stream-123");
    expect(mockCreateNewResumableStream).toHaveBeenCalledWith("stream-123", expect.any(Function));

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
    mockRunAgent.mockResolvedValue({
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

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: "Hello from message payload",
        crmMode: undefined,
      },
      mockSupabase,
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

  it("passes the explicit crmMode flag through to runAgent", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    const mockStreamResult = {
      toUIMessageStream: vi.fn(() => new ReadableStream()),
    };
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

    await POST(
      createJsonRequest({
        id: threadId,
        crmMode: "setup",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Reconfigure my CRM" }],
        },
      }),
    );

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        crmMode: "setup",
      }),
      mockSupabase,
    );
  });

  it("passes crmMode through to runAgent when explicitly requested", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    const mockStreamResult = {
      toUIMessageStream: vi.fn(() => new ReadableStream()),
    };
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

    await POST(
      createJsonRequest({
        id: threadId,
        crmMode: "setup",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Configure my CRM" }],
        },
      }),
    );

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        crmMode: "setup",
      }),
      mockSupabase,
    );
  });

  it("passes selectedChatModel through to runAgent when the model is allowed", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    const mockStreamResult = {
      toUIMessageStream: vi.fn(() => new ReadableStream()),
    };
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

    await POST(
      createJsonRequest({
        id: threadId,
        selectedChatModel: "minimax/minimax-m2.7",
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          parts: [{ type: "text", text: "Use MiniMax for this." }],
        },
      }),
    );

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedChatModel: "minimax/minimax-m2.7",
      }),
      mockSupabase,
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("accepts image-only user messages and forwards file parts to the runner", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: {
        toUIMessageStream: vi.fn(() => new ReadableStream()),
      },
    });

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

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: "",
        fileParts: [
          {
            type: "file",
            filename: "screenshot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/agent-files/client-1/uploads/screenshot.png?token=signed",
            storagePath: "uploads/screenshot.png",
          },
        ],
        crmMode: undefined,
      }),
      mockSupabase,
    );
    expect(response).toBe(streamResponse);
  });

  it("resolves approval events from approval-responded message parts before continuing the run", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const wrappedStream = new ReadableStream();
    mockCreateUIMessageStream.mockReturnValue(wrappedStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockResolveApprovalEvent.mockResolvedValue({
      success: true,
      status: "updated",
      event: { status: "approved", tool_name: "delete_contact" },
    });
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: {
        toUIMessageStream: vi.fn(() => new ReadableStream()),
      },
    });

    await POST(
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

    expect(mockResolveApprovalEvent).toHaveBeenCalledWith(mockSupabase, {
      clientId: "client-456",
      approvalId: "approval-1",
      approved: true,
    });
    expect(mockCaptureServerEvents).toHaveBeenCalledWith([
      {
        distinctId: "client-456",
        event: "approval_resolved",
        properties: {
          tool_name: "delete_contact",
          approval_id: "approval-1",
          outcome: "approved",
        },
      },
    ]);
    expect(mockCaptureServerEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "chat_message_sent" }),
    );
    expect(mockResolveApprovalEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockRunAgent.mock.invocationCallOrder[0],
    );
  });

  it("returns 500 without continuing the run when approval event resolution fails", async () => {
    mockResolveApprovalEvent.mockResolvedValue({
      success: false,
      error: "update failed",
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
    expect(await response.json()).toEqual({
      error: "Failed to process chat request.",
    });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("returns 500 when approval resolution returns an unexpected success status", async () => {
    mockResolveApprovalEvent.mockResolvedValue({
      success: true,
      status: "unknown",
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
    expect(await response.json()).toEqual({
      error: "Failed to process chat request.",
    });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("returns 409 when runner cannot acquire thread lock (message queued)", async () => {
    mockRunAgent.mockResolvedValue({ status: "queued" });

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
      error: "Another response is still in progress. Your message has been queued.",
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
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: {
        toUIMessageStream: vi.fn(() => uiStream),
      },
    });

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
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: "Create lazily",
        crmMode: undefined,
      },
      mockSupabase,
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
    mockRunAgent.mockResolvedValue({
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    expect(mockRunAgent).not.toHaveBeenCalled();
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
    mockRunAgent.mockResolvedValue({
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
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("returns 500 with a stable payload when runner throws", async () => {
    mockRunAgent.mockRejectedValue(new Error("database unavailable"));

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
    mockRunAgent.mockRejectedValue(
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
    mockRunAgent.mockRejectedValue(
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

  it("returns 500 without calling runAgent when ensureClientBootstrap fails", async () => {
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
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("awaits ensureClientBootstrap before calling runAgent", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    mockCreateUIMessageStream.mockReturnValue(new ReadableStream());
    mockCreateUIMessageStreamResponse.mockReturnValue(streamResponse);
    mockRunAgent.mockResolvedValue({
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
      mockRunAgent.mock.invocationCallOrder[0],
    );
  });
});
