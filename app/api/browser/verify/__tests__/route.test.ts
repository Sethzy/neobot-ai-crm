/**
 * Tests for the browser auth verification route.
 * @module app/api/browser/verify/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockUpsertProfile,
  mockGetBrowserUseClient,
  mockTasksCreate,
  mockTasksWait,
  mockSessionsStop,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockUpsertProfile: vi.fn(),
  mockGetBrowserUseClient: vi.fn(),
  mockTasksCreate: vi.fn(),
  mockTasksWait: vi.fn(),
  mockSessionsStop: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/browser-use/profiles", () => ({
  upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
}));

vi.mock("@/lib/browser-use/client", () => ({
  getBrowserUseClient: (...args: unknown[]) => mockGetBrowserUseClient(...args),
}));

import { POST } from "../route";

describe("POST /api/browser/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { from: vi.fn() },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("660e8400-e29b-41d4-a716-446655440000");
    mockUpsertProfile.mockResolvedValue({ label: "PropNex ProMap" });
    mockTasksCreate.mockResolvedValue({ id: "task_123" });
    mockTasksWait.mockResolvedValue({
      isSuccess: true,
      output: { loggedIn: true },
    });
    mockSessionsStop.mockResolvedValue(undefined);
    mockGetBrowserUseClient.mockReturnValue({
      tasks: {
        create: mockTasksCreate,
        wait: mockTasksWait,
      },
      sessions: {
        stop: mockSessionsStop,
      },
    });
  });

  it("saves the profile when login is verified", async () => {
    const response = await POST(
      new Request("http://localhost/api/browser/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session_123",
          browserUseProfileId: "profile_123",
          platform: "propnex",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      platform: "propnex",
      label: "PropNex ProMap",
    });
    expect(mockUpsertProfile).toHaveBeenCalledWith(expect.anything(), {
      clientId: "660e8400-e29b-41d4-a716-446655440000",
      platform: "propnex",
      browserUseProfileId: "profile_123",
      label: "propnex",
    });
    expect(mockSessionsStop).toHaveBeenCalledWith("session_123");
  });

  it("returns a user-facing error when login is not verified", async () => {
    mockTasksWait.mockResolvedValueOnce({
      isSuccess: true,
      output: { loggedIn: false },
    });

    const response = await POST(
      new Request("http://localhost/api/browser/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session_123",
          browserUseProfileId: "profile_123",
          platform: "propnex",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Login could not be verified. Please try logging in again.",
    });
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(mockSessionsStop).toHaveBeenCalledWith("session_123");
  });

  it("accepts stringified structured output", async () => {
    mockTasksWait.mockResolvedValueOnce({
      isSuccess: true,
      output: "{\"loggedIn\":true}",
    });

    const response = await POST(
      new Request("http://localhost/api/browser/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session_123",
          browserUseProfileId: "profile_123",
          platform: "propnex",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      platform: "propnex",
      label: "PropNex ProMap",
    });
  });

  it("fails closed when structured output is invalid", async () => {
    mockTasksWait.mockResolvedValueOnce({
      isSuccess: true,
      output: { loggedIn: "yes" },
    });

    const response = await POST(
      new Request("http://localhost/api/browser/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session_123",
          browserUseProfileId: "profile_123",
          platform: "propnex",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Login could not be verified. Please try logging in again.",
    });
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(mockSessionsStop).toHaveBeenCalledWith("session_123");
  });
});
