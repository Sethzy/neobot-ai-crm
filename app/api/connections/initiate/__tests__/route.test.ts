/**
 * Tests for the OAuth initiate route.
 * @module app/api/connections/initiate/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockGetActiveConnectionByToolkit,
  mockGetComposio,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGetActiveConnectionByToolkit: vi.fn(),
  mockGetComposio: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/connections/queries", () => ({
  getActiveConnectionByToolkit: (...args: unknown[]) =>
    mockGetActiveConnectionByToolkit(...args),
}));

vi.mock("@/lib/composio", () => ({
  getComposio: (...args: unknown[]) => mockGetComposio(...args),
}));

import { POST } from "../route";

describe("POST /api/connections/initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { marker: "server-client" },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockGetActiveConnectionByToolkit.mockResolvedValue(null);
    mockGetComposio.mockReturnValue({
      authConfigs: {
        list: vi.fn().mockResolvedValue({
          items: [{ id: "auth_existing", status: "ENABLED", isComposioManaged: true }],
        }),
        create: vi.fn(),
      },
      connectedAccounts: {
        link: vi.fn().mockResolvedValue({
          redirectUrl: "https://composio.example.com/oauth",
        }),
      },
    });
  });

  it("returns the auth error response when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body." });
  });

  it("returns 400 when toolkit is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("returns 409 when the toolkit is already connected", async () => {
    mockGetActiveConnectionByToolkit.mockResolvedValue({
      id: "row-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_existing",
      toolkit_slug: "gmail",
      display_name: "Gmail",
      status: "active",
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Service already connected." });
  });

  it("reuses an existing auth config and returns the redirect URL", async () => {
    const authConfigList = vi.fn().mockResolvedValue({
      items: [{ id: "auth_existing", status: "ENABLED", isComposioManaged: true }],
    });
    const authConfigCreate = vi.fn();
    const link = vi.fn().mockResolvedValue({
      redirectUrl: "https://composio.example.com/oauth",
    });
    mockGetComposio.mockReturnValue({
      authConfigs: {
        list: authConfigList,
        create: authConfigCreate,
      },
      connectedAccounts: {
        link,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: " Gmail " }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      redirectUrl: "https://composio.example.com/oauth",
    });
    expect(mockResolveClientId).toHaveBeenCalledWith({ marker: "server-client" }, "user-1");
    expect(mockGetActiveConnectionByToolkit).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "gmail",
    );
    expect(authConfigList).toHaveBeenCalledWith({
      toolkit: "gmail",
      isComposioManaged: true,
    });
    expect(authConfigCreate).not.toHaveBeenCalled();
    expect(link).toHaveBeenCalledWith("client-1", "auth_existing", {
      callbackUrl: "http://localhost/api/connections/callback",
    });
  });

  it("skips disabled managed auth configs and reuses the first enabled one", async () => {
    const authConfigList = vi.fn().mockResolvedValue({
      items: [
        { id: "auth_disabled", status: "DISABLED", isComposioManaged: true },
        { id: "auth_enabled", status: "ENABLED", isComposioManaged: true },
      ],
    });
    const link = vi.fn().mockResolvedValue({
      redirectUrl: "https://composio.example.com/oauth",
    });
    mockGetComposio.mockReturnValue({
      authConfigs: {
        list: authConfigList,
        create: vi.fn(),
      },
      connectedAccounts: {
        link,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(link).toHaveBeenCalledWith("client-1", "auth_enabled", {
      callbackUrl: "http://localhost/api/connections/callback",
    });
  });

  it("creates a managed auth config when one does not already exist", async () => {
    const authConfigList = vi.fn().mockResolvedValue({ items: [] });
    const authConfigCreate = vi.fn().mockResolvedValue({ id: "auth_created" });
    const link = vi.fn().mockResolvedValue({
      redirectUrl: "https://composio.example.com/oauth",
    });
    mockGetComposio.mockReturnValue({
      authConfigs: {
        list: authConfigList,
        create: authConfigCreate,
      },
      connectedAccounts: {
        link,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "googlecalendar" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(authConfigCreate).toHaveBeenCalledWith("googlecalendar", {
      type: "use_composio_managed_auth",
      name: "googlecalendar Auth Config",
    });
    expect(link).toHaveBeenCalledWith("client-1", "auth_created", {
      callbackUrl: "http://localhost/api/connections/callback",
    });
  });

  it("returns 500 when Composio initiate fails", async () => {
    mockGetComposio.mockReturnValue({
      authConfigs: {
        list: vi.fn().mockRejectedValue(new Error("boom")),
        create: vi.fn(),
      },
      connectedAccounts: {
        link: vi.fn(),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to initiate connection.",
    });
  });

  it("returns 500 when Composio does not return a redirect URL", async () => {
    mockGetComposio.mockReturnValue({
      authConfigs: {
        list: vi.fn().mockResolvedValue({
          items: [{ id: "auth_existing", status: "ENABLED", isComposioManaged: true }],
        }),
        create: vi.fn(),
      },
      connectedAccounts: {
        link: vi.fn().mockResolvedValue({ redirectUrl: "" }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to initiate connection.",
    });
  });
});
