import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResolveApprovalById,
  mockAuthenticateRequest,
  mockResolveClientId,
} = vi.hoisted(() => ({
  mockResolveApprovalById: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
}));

vi.mock("@/lib/managed-agents/resolve-approval", () => ({
  resolveApprovalById: mockResolveApprovalById,
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

import { POST } from "../route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/tool-confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/tool-confirm", () => {
  beforeEach(() => {
    mockResolveApprovalById.mockReset();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {},
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
  });

  it("returns 200 when Anthropic accepts the tool confirmation", async () => {
    mockResolveApprovalById.mockResolvedValue({
      success: true,
      status: "updated",
      threadId: "thread-1",
    });

    const response = await POST(
      jsonRequest({
        approvalId: "770e8400-e29b-41d4-a716-446655440000",
        approved: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockResolveApprovalById).toHaveBeenCalledWith(
      {},
      {
        clientId: "client-1",
        approvalId: "770e8400-e29b-41d4-a716-446655440000",
        approved: true,
        denyMessage: undefined,
      },
    );
  });

  it("returns 404 for an unknown approvalId", async () => {
    mockResolveApprovalById.mockResolvedValue({
      success: false,
      status: "missing",
    });

    const response = await POST(
      jsonRequest({
        approvalId: "770e8400-e29b-41d4-a716-446655440000",
        approved: true,
      }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 when the body fails schema validation", async () => {
    const response = await POST(jsonRequest({ approvalId: 42 }));

    expect(response.status).toBe(400);
    expect(mockResolveApprovalById).not.toHaveBeenCalled();
  });

  it("returns 401 when authenticateRequest fails", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: new Response("unauth", { status: 401 }),
    });

    const response = await POST(
      jsonRequest({
        approvalId: "770e8400-e29b-41d4-a716-446655440000",
        approved: true,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns already_resolved for duplicate confirmations", async () => {
    mockResolveApprovalById.mockResolvedValue({
      success: true,
      status: "already_resolved",
      threadId: "thread-1",
    });

    const response = await POST(
      jsonRequest({
        approvalId: "770e8400-e29b-41d4-a716-446655440000",
        approved: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: "already_resolved",
    });
  });
});
