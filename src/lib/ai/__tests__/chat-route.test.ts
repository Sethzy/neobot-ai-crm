/**
 * Tests for the runner-backed App Router chat endpoint.
 * @module lib/ai/__tests__/chat-route
 */
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockResolveClientId, mockProcessInboundMessage } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockProcessInboundMessage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/chat/process-inbound-message", () => ({
  processInboundMessage: (...args: unknown[]) => mockProcessInboundMessage(...args),
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

  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-key";

    mockCreateClient.mockResolvedValue(mockSupabase);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockResolveClientId.mockResolvedValue("client-456");
  });

  it("delegates to processInboundMessage and streams response with canonical header", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const mockStreamResult = {
      toUIMessageStreamResponse: vi.fn(() => streamResponse),
    };

    mockProcessInboundMessage.mockResolvedValue({
      status: "streaming",
      threadId: "thread-canonical",
      streamResult: mockStreamResult,
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "Hello from UI message" }],
        },
      }),
    );

    expect(mockResolveClientId).toHaveBeenCalledWith(mockSupabase, "user-123");
    expect(mockProcessInboundMessage).toHaveBeenCalledWith({
      supabase: mockSupabase,
      clientId: "client-456",
      channel: "web",
      externalConversationId: threadId,
      requestedThreadId: threadId,
      messageText: "Hello from UI message",
      triggerType: "chat",
    });
    expect(mockStreamResult.toUIMessageStreamResponse).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-thread-id")).toBe("thread-canonical");
  });

  it("returns 202 queued with canonical header", async () => {
    mockProcessInboundMessage.mockResolvedValue({
      status: "queued",
      threadId: "thread-canonical",
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Follow up" }] }],
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("x-thread-id")).toBe("thread-canonical");
    expect(await response.json()).toEqual({ status: "queued" });
  });

  it("returns duplicate status with canonical header when delivery is already processed", async () => {
    mockProcessInboundMessage.mockResolvedValue({
      status: "duplicate",
      threadId: "thread-canonical",
    });

    const response = await POST(
      createJsonRequest({
        id: threadId,
        message: { id: "u1", role: "user", parts: [{ type: "text", text: "Duplicate" }] },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-thread-id")).toBe("thread-canonical");
    expect(await response.json()).toEqual({ status: "duplicate" });
  });

  it("returns 400 when thread id is missing", async () => {
    const response = await POST(
      createJsonRequest({
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request body: id (thread id) is required.",
    });
    expect(mockProcessInboundMessage).not.toHaveBeenCalled();
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
    expect(mockProcessInboundMessage).not.toHaveBeenCalled();
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
    expect(mockProcessInboundMessage).not.toHaveBeenCalled();
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
    expect(await response.json()).toEqual({ error: "Invalid JSON payload." });
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
      error: "Invalid request body: thread id must be a UUID.",
    });
    expect(mockProcessInboundMessage).not.toHaveBeenCalled();
  });

  it("returns 500 with a stable payload when inbound orchestration fails", async () => {
    mockProcessInboundMessage.mockRejectedValue(new Error("database unavailable"));

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
