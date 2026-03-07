/**
 * Tests for the runner-backed App Router chat endpoint.
 * @module lib/ai/__tests__/chat-route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunAgent,
  mockCreateClient,
  mockResolveClientId,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockGenerateId,
  mockGenerateTitleFromUserMessage,
  mockSetActiveStreamId,
  mockClearActiveStreamId,
  mockCreateNewResumableStream,
  mockCreateResumableStreamContext,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  mockGenerateId: vi.fn(),
  mockGenerateTitleFromUserMessage: vi.fn(),
  mockSetActiveStreamId: vi.fn(),
  mockClearActiveStreamId: vi.fn(),
  mockCreateNewResumableStream: vi.fn(),
  mockCreateResumableStreamContext: vi.fn(),
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

vi.mock("ai", () => ({
  createUIMessageStream: mockCreateUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
  generateId: mockGenerateId,
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitleFromUserMessage: mockGenerateTitleFromUserMessage,
}));

vi.mock("@/lib/redis", () => ({
  setActiveStreamId: mockSetActiveStreamId,
  clearActiveStreamId: mockClearActiveStreamId,
}));

vi.mock("resumable-stream", () => ({
  createResumableStreamContext: mockCreateResumableStreamContext,
}));

import { POST } from "../../../../app/api/chat/route";

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  const threadId = "770e8400-e29b-41d4-a716-446655440000";

  function createThreadLookup(options: { threadExists: boolean; error?: { message: string } | null }) {
    const { threadExists, error = null } = options;
    const maybeSingle = vi.fn().mockResolvedValue(
      threadExists
        ? { data: { thread_id: threadId }, error }
        : { data: null, error },
    );
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn(() => ({ select }));

    return { from };
  }

  function createMissingThreadWithInsert() {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ select, insert }));

    return { from, insert };
  }

  function createMissingThreadWithInsertAndUpdate() {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));

    const insert = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));

    const from = vi.fn(() => ({ select, insert, update }));
    return { from, insert, update, updateEq };
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
        messages: [
          { id: "a1", role: "assistant", parts: [{ type: "text", text: "How can I help?" }] },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Hello, Sunder!" }] },
        ],
      }),
    );

    expect(mockResolveClientId).toHaveBeenCalledWith(mockSupabase, "user-123");
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        input: "Hello, Sunder!",
      },
      mockSupabase,
    );
    expect(mockCreateUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        execute: expect.any(Function),
        originalMessages: [
          { id: "a1", role: "assistant", parts: [{ type: "text", text: "How can I help?" }] },
          { id: "u1", role: "user", parts: [{ type: "text", text: "Hello, Sunder!" }] },
        ],
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
        input: "Hello from message payload",
      },
      mockSupabase,
    );
    expect(mockCreateUIMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        originalMessages: undefined,
      }),
    );
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
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "Reconfigure my CRM" }] },
        ],
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
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "Configure my CRM" }] },
        ],
      }),
    );

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        crmMode: "setup",
      }),
      mockSupabase,
    );
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
              url: "https://storage.example.com/chat-attachments/client-1/screenshot.png",
            },
          ],
        },
      }),
    );

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        input: "",
        fileParts: [
          {
            type: "file",
            filename: "screenshot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/screenshot.png",
          },
        ],
      },
      mockSupabase,
    );
    expect(response).toBe(streamResponse);
  });

  it("returns 202 queued when runner cannot acquire thread lock", async () => {
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Follow up" }] }],
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued" });
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
        input: "Create lazily",
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
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
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
      error: "Invalid request body: could not resolve latest user message text.",
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
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
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
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
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
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
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

  it("returns 500 when AI gateway key is missing", async () => {
    delete process.env.AI_GATEWAY_API_KEY;

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Server misconfiguration: AI_GATEWAY_API_KEY is required.",
    });
  });

  it("returns 400 when thread id is not a UUID", async () => {
    const response = await POST(
      createJsonRequest({
        id: "thread-not-uuid",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
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
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to process chat request." });
  });
});
