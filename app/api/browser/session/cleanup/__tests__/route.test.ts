/**
 * Tests for browser auth session cleanup.
 * @module app/api/browser/session/cleanup/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBrowserAuthToken } from "@/lib/browser-use/auth-state";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockGetProfileForPlatform,
  mockGetBrowserUseClient,
  mockSessionsStop,
  mockProfilesDelete,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGetProfileForPlatform: vi.fn(),
  mockGetBrowserUseClient: vi.fn(),
  mockSessionsStop: vi.fn(),
  mockProfilesDelete: vi.fn(),
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

describe("POST /api/browser/session/cleanup", () => {
  const clientId = "660e8400-e29b-41d4-a716-446655440000";
  const authToken = () =>
    createBrowserAuthToken({
      clientId,
      platform: "propnex",
      sessionId: "session_123",
      browserUseProfileId: "profile_123",
    });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-secret";

    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { from: vi.fn() },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue(clientId);
    mockGetProfileForPlatform.mockResolvedValue(null);
    mockSessionsStop.mockResolvedValue(undefined);
    mockProfilesDelete.mockResolvedValue(undefined);
    mockGetBrowserUseClient.mockReturnValue({
      sessions: { stop: mockSessionsStop },
      profiles: { delete: mockProfilesDelete },
    });
  });

  it("stops the session and deletes an unpersisted first-connect profile", async () => {
    const response = await POST(
      new Request("http://localhost/api/browser/session/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: authToken() }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockSessionsStop).toHaveBeenCalledWith("session_123");
    expect(mockProfilesDelete).toHaveBeenCalledWith("profile_123");
  });

  it("does not delete a persisted profile during reconnect cleanup", async () => {
    mockGetProfileForPlatform.mockResolvedValueOnce({
      browser_use_profile_id: "profile_123",
    });

    const response = await POST(
      new Request("http://localhost/api/browser/session/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: authToken() }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSessionsStop).toHaveBeenCalledWith("session_123");
    expect(mockProfilesDelete).not.toHaveBeenCalled();
  });
});
