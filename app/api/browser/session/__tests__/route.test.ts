/**
 * Tests for the browser auth session route.
 * @module app/api/browser/session/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockGetProfileForPlatform,
  mockGetBrowserUseClient,
  mockProfilesCreate,
  mockSessionsCreate,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGetProfileForPlatform: vi.fn(),
  mockGetBrowserUseClient: vi.fn(),
  mockProfilesCreate: vi.fn(),
  mockSessionsCreate: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", async () => {
  const { buildAuthenticateAndParseBody } = await import("@/test/mocks/route-helpers");

  return {
    authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
    authenticateAndParseBody: buildAuthenticateAndParseBody(
      () => mockAuthenticateRequest(),
      (message: string, status: number) => Response.json({ error: message }, { status }),
    ),
    jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
  };
});

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/browser-use/profiles", () => ({
  getProfileForPlatform: (...args: unknown[]) => mockGetProfileForPlatform(...args),
}));

vi.mock("@/lib/browser-use/client", () => ({
  getBrowserUseClient: (...args: unknown[]) => mockGetBrowserUseClient(...args),
}));

import { POST } from "../route";

describe("POST /api/browser/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-secret";

    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { from: vi.fn() },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("660e8400-e29b-41d4-a716-446655440000");
    mockGetProfileForPlatform.mockResolvedValue(null);
    mockProfilesCreate.mockResolvedValue({ id: "profile_123" });
    mockSessionsCreate.mockResolvedValue({
      id: "session_123",
      liveUrl: "https://live.browser-use.com/session_123",
    });
    mockGetBrowserUseClient.mockReturnValue({
      profiles: { create: mockProfilesCreate },
      sessions: { create: mockSessionsCreate },
    });
  });

  it("creates a new Browser-Use profile on first connect", async () => {
    const response = await POST(
      new Request("http://localhost/api/browser/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "propnex" }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload.sessionId).toBe("session_123");
    expect(payload.liveUrl).toBe("https://live.browser-use.com/session_123");
    expect(payload.platform).toBe("propnex");
    expect(typeof payload.authToken).toBe("string");
    expect(mockGetProfileForPlatform).toHaveBeenCalledWith(
      expect.anything(),
      "660e8400-e29b-41d4-a716-446655440000",
      "propnex",
    );
    expect(mockProfilesCreate).toHaveBeenCalledOnce();
    expect(mockSessionsCreate).toHaveBeenCalledWith({
      profileId: "profile_123",
      startUrl: "https://promap.propnex.com/login",
    });
  });

  it("reuses an existing Browser-Use profile on reconnect", async () => {
    mockGetProfileForPlatform.mockResolvedValueOnce({
      browser_use_profile_id: "profile_existing",
    });

    const response = await POST(
      new Request("http://localhost/api/browser/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "propnex" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProfilesCreate).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledWith({
      profileId: "profile_existing",
      startUrl: "https://promap.propnex.com/login",
    });
  });

  it("returns 400 for an invalid request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/browser/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("returns the auth error response when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(
      new Request("http://localhost/api/browser/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "propnex" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });
});
