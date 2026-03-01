/**
 * Tests for the runner-backed App Router chat endpoint.
 * @module lib/ai/__tests__/chat-route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent, mockCreateClient, mockResolveClientId } = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
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

import { POST } from "../../../../app/api/chat/route";

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
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

  it("calls runAgent with AI SDK transport payload and returns stream response", async () => {
    const streamResponse = new Response("streamed", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const mockStreamResult = {
      toUIMessageStreamResponse: vi.fn(() => streamResponse),
    };

    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

    const response = await POST(
      createJsonRequest({
        id: "thread-789",
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
        threadId: "thread-789",
        triggerType: "chat",
        input: "Hello, Sunder!",
      },
      mockSupabase,
    );
    expect(mockStreamResult.toUIMessageStreamResponse).toHaveBeenCalledTimes(1);
    expect(response).toBe(streamResponse);
  });

  it("returns 202 queued when runner cannot acquire thread lock", async () => {
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const response = await POST(
      createJsonRequest({
        id: "thread-789",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Follow up" }] }],
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued" });
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
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("returns 400 when user input text cannot be resolved", async () => {
    const response = await POST(
      createJsonRequest({
        id: "thread-789",
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
        id: "thread-789",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
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
        id: "thread-789",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Server misconfiguration: AI_GATEWAY_API_KEY is required.",
    });
  });
});
