/**
 * Tests for the CRM config mode toggle endpoint.
 * @module app/api/settings/crm-config-mode/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockFrom,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

import { POST } from "./route";

function setupAuthSuccess() {
  const supabase = { from: mockFrom };
  mockAuthenticateRequest.mockResolvedValue({
    kind: "ok",
    supabase,
    userId: "user-1",
  });
  mockResolveClientId.mockResolvedValue("client-1");
  return supabase;
}

function setupDbResult(result: { error: null | { message: string } }) {
  const mockEq = vi.fn().mockResolvedValue(result);
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
  return { mockUpdate, mockEq };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/crm-config-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/crm-config-mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(makeRequest({ action: "enable" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 400 for invalid action", async () => {
    setupAuthSuccess();

    const response = await POST(makeRequest({ action: "invalid" }));

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing body", async () => {
    setupAuthSuccess();

    const response = await POST(
      new Request("http://localhost/api/settings/crm-config-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("enables config mode with a ~1h TTL", async () => {
    setupAuthSuccess();
    const { mockUpdate, mockEq } = setupDbResult({ error: null });

    const before = Date.now();
    const response = await POST(makeRequest({ action: "enable" }));
    const after = Date.now();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("enable");

    // Verify expiresAt is approximately 1 hour from now
    const expiresAt = new Date(body.expiresAt).getTime();
    const oneHourMs = 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + oneHourMs - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + oneHourMs + 1000);

    // Verify Supabase received a timestamp string (not null)
    expect(mockFrom).toHaveBeenCalledWith("clients");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ crm_config_mode_until: expect.any(String) }),
    );
    expect(mockEq).toHaveBeenCalledWith("client_id", "client-1");
  });

  it("disables config mode by setting null", async () => {
    setupAuthSuccess();
    const { mockUpdate, mockEq } = setupDbResult({ error: null });

    const response = await POST(makeRequest({ action: "disable" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("disable");
    expect(body.expiresAt).toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledWith({ crm_config_mode_until: null });
    expect(mockEq).toHaveBeenCalledWith("client_id", "client-1");
  });

  it("returns 500 when DB update fails", async () => {
    setupAuthSuccess();
    setupDbResult({ error: { message: "Connection refused" } });

    const response = await POST(makeRequest({ action: "enable" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update CRM configuration mode.",
    });
  });

  it("returns 500 when resolveClientId throws", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { from: mockFrom },
      userId: "user-1",
    });
    mockResolveClientId.mockRejectedValue(new Error("Client not found"));

    const response = await POST(makeRequest({ action: "enable" }));

    expect(response.status).toBe(500);
  });
});
