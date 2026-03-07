/**
 * Tests for the OAuth callback route.
 * @module app/api/connections/callback/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockUpsertConnection,
  mockGetComposio,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockUpsertConnection: vi.fn(),
  mockGetComposio: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/connections/queries", () => ({
  upsertConnection: (...args: unknown[]) => mockUpsertConnection(...args),
}));

vi.mock("@/lib/composio", () => ({
  getComposio: (...args: unknown[]) => mockGetComposio(...args),
}));

import { GET } from "../route";

describe("GET /api/connections/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { marker: "server-client" },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockUpsertConnection.mockResolvedValue({
      id: "row-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      status: "active",
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "ACTIVE",
          toolkit: { slug: "gmail" },
        }),
        list: vi.fn().mockResolvedValue({
          items: [{ id: "conn_123" }],
        }),
      },
    });
  });

  it("redirects to settings error when the browser session is unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=unauthorized",
    );
  });

  it("redirects to settings error when callback params are missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/connections/callback?status=success"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=invalid_callback",
    );
  });

  it("redirects to settings error when Composio reports a failed callback status", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=failed&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=failed",
    );
  });

  it("accepts the official callback params, verifies the account, upserts the row, and redirects to settings success", async () => {
    const getConnectedAccount = vi.fn().mockResolvedValue({
      id: "conn_123",
      status: "ACTIVE",
      toolkit: { slug: "gmail" },
    });
    const listOwnedConnections = vi.fn().mockResolvedValue({
      items: [{ id: "conn_123" }],
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: getConnectedAccount,
        list: listOwnedConnections,
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=success&toolkit=gmail",
    );
    expect(mockResolveClientId).toHaveBeenCalledWith({ marker: "server-client" }, "user-1");
    expect(getConnectedAccount).toHaveBeenCalledWith("conn_123");
    expect(listOwnedConnections).toHaveBeenCalledWith({
      userIds: ["client-1"],
      statuses: ["ACTIVE"],
      toolkitSlugs: ["gmail"],
      limit: 100,
    });
    expect(mockUpsertConnection).toHaveBeenCalledWith({ marker: "server-client" }, {
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      status: "active",
    });
  });

  it("also accepts camelCase callback aliases defensively", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?connectionStatus=success&connectedAccountId=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=success&toolkit=gmail",
    );
  });

  it("redirects to settings error when the callback account does not belong to the current client", async () => {
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "ACTIVE",
          toolkit: { slug: "gmail" },
        }),
        list: vi.fn().mockResolvedValue({
          items: [{ id: "conn_other" }],
        }),
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=ownership",
    );
    expect(mockUpsertConnection).not.toHaveBeenCalled();
  });

  it("redirects to settings error when the connected account is not active", async () => {
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "INITIATED",
          toolkit: { slug: "gmail" },
        }),
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=inactive",
    );
    expect(mockUpsertConnection).not.toHaveBeenCalled();
  });

  it("redirects to settings error when callback verification throws", async () => {
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=callback_failed",
    );
  });
});
