import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResumeManagedAgentFromApproval,
  mockAuthenticateRequest,
  mockResolveClientId,
  mockGetAnthropicClient,
  mockAfter,
} = vi.hoisted(() => ({
  mockResumeManagedAgentFromApproval: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGetAnthropicClient: vi.fn(),
  mockAfter: vi.fn(),
}));

vi.mock("@/lib/managed-agents/adapter", () => ({
  resumeManagedAgentFromApproval: mockResumeManagedAgentFromApproval,
}));

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: mockGetAnthropicClient,
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: mockAuthenticateRequest,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => mockAfter(fn),
}));

import { POST } from "../route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/tool-confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function createClosedStream(): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

describe("POST /api/tool-confirm", () => {
  beforeEach(() => {
    mockResumeManagedAgentFromApproval.mockReset();
    mockAfter.mockReset();
    mockAfter.mockImplementation((fn: () => unknown) => {
      void fn();
    });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {},
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockGetAnthropicClient.mockReturnValue({ beta: {} });
  });

  it("returns 200 and drains the resume stream on a successful confirmation", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "streaming",
      stream: createClosedStream(),
      threadId: "thread-1",
      approved: true,
    });

    const response = await POST(
      jsonRequest({
        approvalId: "toolu_abc123",
        approved: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      status: "updated",
      approved: true,
    });
    expect(mockResumeManagedAgentFromApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-1",
        approvalId: "toolu_abc123",
        approved: true,
        denyMessage: undefined,
      }),
    );
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown approvalId", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "missing",
    });

    const response = await POST(
      jsonRequest({
        approvalId: "toolu_abc123",
        approved: true,
      }),
    );

    expect(response.status).toBe(404);
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails schema validation", async () => {
    const response = await POST(jsonRequest({ approvalId: 42 }));

    expect(response.status).toBe(400);
    expect(mockResumeManagedAgentFromApproval).not.toHaveBeenCalled();
  });

  it("returns 400 when the approvalId is an empty string", async () => {
    const response = await POST(
      jsonRequest({ approvalId: "", approved: true }),
    );

    expect(response.status).toBe(400);
    expect(mockResumeManagedAgentFromApproval).not.toHaveBeenCalled();
  });

  it("accepts non-UUID tool_use ids (Anthropic `tu_*` / `toolu_*` shape)", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "streaming",
      stream: createClosedStream(),
      threadId: "thread-1",
      approved: true,
    });

    const response = await POST(
      jsonRequest({ approvalId: "tu_01abc_XYZ", approved: true }),
    );

    expect(response.status).toBe(200);
    expect(mockResumeManagedAgentFromApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: "tu_01abc_XYZ" }),
    );
  });

  it("returns 401 when authenticateRequest fails", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: new Response("unauth", { status: 401 }),
    });

    const response = await POST(
      jsonRequest({
        approvalId: "toolu_abc123",
        approved: true,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns already_resolved with the authoritative approval decision", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "already_resolved",
      threadId: "thread-1",
      approved: false,
    });

    const response = await POST(
      jsonRequest({
        approvalId: "toolu_abc123",
        approved: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: "already_resolved",
      approved: false,
    });
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("returns 500 when the resume fails with an internal error", async () => {
    mockResumeManagedAgentFromApproval.mockResolvedValue({
      status: "error",
      error: "Approval event missing session_id",
    });

    const response = await POST(
      jsonRequest({
        approvalId: "toolu_abc123",
        approved: true,
      }),
    );

    expect(response.status).toBe(500);
    expect(mockAfter).not.toHaveBeenCalled();
  });
});
