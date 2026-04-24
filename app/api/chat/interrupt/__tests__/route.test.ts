import { beforeEach, describe, expect, it, vi } from "vitest";

const { interruptSession, authenticateRequest, resolveClientId, getAnthropicClient } =
  vi.hoisted(() => ({
    interruptSession: vi.fn().mockResolvedValue(undefined),
    authenticateRequest: vi.fn(),
    resolveClientId: vi.fn(),
    getAnthropicClient: vi.fn(),
  }));

const maybeSingle = vi.fn();

vi.mock("@/lib/managed-agents/interrupt-session", () => ({
  interruptSession,
}));

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

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId,
}));

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient,
}));

import { POST } from "../route";

describe("POST /api/chat/interrupt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockReset();
    authenticateRequest.mockResolvedValue({
      kind: "ok",
      userId: "u1",
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle }) }),
          }),
        }),
      },
    });
    resolveClientId.mockResolvedValue("c1");
    getAnthropicClient.mockReturnValue({});
  });

  it("sends user.interrupt for a valid thread", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: "sess_abc" },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/chat/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "thread_1" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(interruptSession).toHaveBeenCalledWith({}, "sess_abc");
  });

  it("returns 404 when the thread has no cached session", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: null },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/chat/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "thread_1" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(interruptSession).not.toHaveBeenCalled();
  });

  it("rejects missing threadId", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(interruptSession).not.toHaveBeenCalled();
  });
});
