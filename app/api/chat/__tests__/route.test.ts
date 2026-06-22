/**
 * Tests for the unified browser chat route.
 * @module app/api/chat/__tests__/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessageQuotaError,
  messageQuotaErrorCodes,
} from "@/lib/usage/message-quota";

const {
  authenticateRequest,
  resolveClientId,
  checkRateLimit,
  generateTitleFromUserMessage,
  runManagedAgent,
  resumeManagedAgentFromApproval,
  getAnthropicClient,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveClientId: vi.fn(),
  checkRateLimit: vi.fn(),
  generateTitleFromUserMessage: vi.fn(),
  runManagedAgent: vi.fn(),
  resumeManagedAgentFromApproval: vi.fn(),
  getAnthropicClient: vi.fn(),
}));

const maybeSingle = vi.fn();
const single = vi.fn();
const insertFn = vi.fn();
const threadAbortSignal = vi.fn();
const clientAbortSignal = vi.fn();

vi.mock("@/lib/api/route-helpers", async () => {
  const { buildAuthenticateAndParseBody } = await import("@/test/mocks/route-helpers");

  return {
    authenticateRequest,
    authenticateAndParseBody: buildAuthenticateAndParseBody(
      authenticateRequest,
      (message: string, status: number) =>
        new Response(JSON.stringify({ error: message }), { status }),
    ),
    jsonError: (message: string, status: number) =>
      new Response(JSON.stringify({ error: message }), { status }),
  };
});
vi.mock("@/lib/ai/title", () => ({ generateTitleFromUserMessage }));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/managed-agents/adapter", () => ({
  runManagedAgent,
  resumeManagedAgentFromApproval,
}));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({ getAnthropicClient }));

import { POST } from "../route";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const threadQuery = {
      eq: vi.fn(),
      abortSignal: threadAbortSignal,
      maybeSingle,
    };
    threadQuery.eq.mockImplementation(() => threadQuery);
    threadQuery.abortSignal.mockImplementation(() => threadQuery);

    const clientQuery = {
      eq: vi.fn(),
      abortSignal: clientAbortSignal,
      single,
    };
    clientQuery.eq.mockImplementation(() => clientQuery);
    clientQuery.abortSignal.mockImplementation(() => clientQuery);

    authenticateRequest.mockResolvedValue({
      kind: "ok",
      userId: "u1",
      supabase: {
        from: (table: string) => {
          if (table === "conversation_threads") {
            return {
              select: () => threadQuery,
              insert: insertFn,
            };
          }

          if (table === "clients") {
            return {
              select: () => clientQuery,
            };
          }

          return {};
        },
      },
    });
    maybeSingle.mockResolvedValue({
      data: { thread_id: "t1", title: "Thread 1", session_id: null },
      error: null,
    });
    single.mockResolvedValue({
      data: { client_profile: "profile", user_preferences: "prefs" },
      error: null,
    });
    insertFn.mockReturnValue({ error: null });
    resolveClientId.mockResolvedValue("c1");
    checkRateLimit.mockResolvedValue({ allowed: true });
    generateTitleFromUserMessage.mockResolvedValue("Generated title");
    getAnthropicClient.mockReturnValue({});
    runManagedAgent.mockResolvedValue(new ReadableStream());
    resumeManagedAgentFromApproval.mockResolvedValue({
      status: "streaming",
      stream: new ReadableStream(),
      threadId: "t1",
    });
  });

  it("delegates a normal user message to runManagedAgent", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "c1",
        threadId: "t1",
        input: "hello",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns a JSON error when managed-agent startup fails before streaming", async () => {
    runManagedAgent.mockRejectedValueOnce(new Error("missing agent env"));

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "NeoBot could not start the agent runtime. Please try again in a minute.",
    });
  });

  it("preserves message quota errors as structured JSON", async () => {
    runManagedAgent.mockRejectedValueOnce(
      new MessageQuotaError(
        messageQuotaErrorCodes.limitReached,
        "Monthly message limit reached.",
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Monthly message limit reached.",
      code: "message-quota-exceeded",
    });
  });

  it("returns 400 for invalid body", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body.",
    });
  });

  it("returns 400 for invalid selected chat model", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
          selectedChatModel: "not-a-real-model",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid selected chat model.",
    });
  });

  it("returns 400 when the last message has no text or files", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message must contain text or files.",
    });
  });

  it("loads thread and client context before calling runManagedAgent", async () => {
    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTitle: "Thread 1",
        existingSessionId: null,
        clientProfile: "profile",
        userPreferences: "prefs",
      }),
    );
  });

  it("passes through an existing session id for warm turns", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { thread_id: "t1", title: "Thread 1", session_id: "sess_1" },
      error: null,
    });

    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        existingSessionId: "sess_1",
      }),
    );
  });

  it("skips client context lookup when the thread already has a session", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { thread_id: "t1", title: "Thread 1", session_id: "sess_1" },
      error: null,
    });

    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      }),
    );

    expect(single).not.toHaveBeenCalled();
    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        existingSessionId: "sess_1",
        clientProfile: null,
        userPreferences: null,
      }),
    );
  });

  it("starts title generation for a brand-new thread and seeds the placeholder title", async () => {
    const titlePromise = Promise.resolve("Fresh title");
    generateTitleFromUserMessage.mockReturnValueOnce(titlePromise);
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "new-thread",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "plan my week" }],
            },
          ],
        }),
      }),
    );

    expect(insertFn).toHaveBeenCalledWith({
      thread_id: "new-thread",
      client_id: "c1",
      title: "New Chat",
      chat_model: "anthropic/claude-sonnet-4-6",
    });
    expect(generateTitleFromUserMessage).toHaveBeenCalledWith("plan my week");
    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTitle: "New Chat",
        generatedTitlePromise: titlePromise,
      }),
    );
  });

  it("skips title generation for brand-new file-only threads", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "new-thread",
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [
                {
                  type: "file",
                  url: "https://example.com/test.csv",
                  mediaType: "text/csv",
                  filename: "test.csv",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(generateTitleFromUserMessage).not.toHaveBeenCalled();
    expect(runManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTitle: "New Chat",
        generatedTitlePromise: null,
      }),
    );
  });

  it("routes approval responses to resumeManagedAgentFromApproval", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              parts: [
                {
                  type: "tool-invocation",
                  toolCallId: "toolu_123",
                  toolName: "browser",
                  state: "approval-responded",
                  approval: { approved: true },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(resumeManagedAgentFromApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "toolu_123",
        approved: true,
      }),
    );
    expect(runManagedAgent).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("routes v6 typed tool approval (tool-<name>) to resumeManagedAgentFromApproval", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              parts: [
                {
                  type: "tool-bash",
                  toolCallId: "BV7LR5qz",
                  state: "approval-responded",
                  approval: { id: "BV7LR5qz", approved: true },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(resumeManagedAgentFromApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "BV7LR5qz",
        approved: true,
      }),
    );
    expect(runManagedAgent).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
