/**
 * Tests CRM mode passthrough on the chat route.
 * @module lib/ai/__tests__/chat-route-crm-mode
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunAgent,
  mockCreateClient,
  mockResolveClientId,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockGenerateId,
  mockSetActiveStreamId,
  mockClearActiveStreamId,
  mockCreateNewResumableStream,
  mockCreateResumableStreamContext,
  mockEnsureClientBootstrap,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  mockGenerateId: vi.fn(),
  mockSetActiveStreamId: vi.fn(),
  mockClearActiveStreamId: vi.fn(),
  mockCreateNewResumableStream: vi.fn(),
  mockCreateResumableStreamContext: vi.fn(),
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

vi.mock("ai", () => ({
  createUIMessageStream: mockCreateUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
  generateId: mockGenerateId,
}));

vi.mock("@/lib/ai/title", () => ({
  generateTitleFromUserMessage: vi.fn().mockResolvedValue(""),
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

vi.mock("resumable-stream", () => ({
  createResumableStreamContext: mockCreateResumableStreamContext,
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

import { POST } from "../../../../app/api/chat/route";

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat crmMode", () => {
  const threadId = "770e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-key";
    process.env.REDIS_URL = "redis://localhost:6379";

    const maybeSingle = vi.fn().mockResolvedValue({
      data: { thread_id: threadId },
      error: null,
    });
    const thirdEq = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ eq: thirdEq }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: vi.fn(() => ({ select })),
    });
    mockResolveClientId.mockResolvedValue("client-456");
    mockGenerateId.mockReturnValue("stream-123");
    mockCreateResumableStreamContext.mockReturnValue({
      createNewResumableStream: mockCreateNewResumableStream,
    });
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: {
        toUIMessageStream: vi.fn(() => new ReadableStream()),
      },
    });
    mockCreateUIMessageStream.mockReturnValue(new ReadableStream());
    mockCreateUIMessageStreamResponse.mockReturnValue(new Response("streamed"));
  });

  it("passes explicit crmMode through to runAgent", async () => {
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
        clientId: "client-456",
        threadId,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: "Reconfigure my CRM",
        crmMode: "setup",
      }),
      expect.objectContaining({
        auth: expect.any(Object),
        from: expect.any(Function),
      }),
    );
  });
});
