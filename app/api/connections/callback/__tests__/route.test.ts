/**
 * Tests for the OAuth callback route.
 * @module app/api/connections/callback/__tests__/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockDeleteConnection,
  mockGetConnectionByConnectedAccountId,
  mockGetPendingConnectionByToolkit,
  mockResolveClientId,
  mockInsertConnection,
  mockUpdateConnection,
  mockGetComposio,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockDeleteConnection: vi.fn(),
  mockGetConnectionByConnectedAccountId: vi.fn(),
  mockGetPendingConnectionByToolkit: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockInsertConnection: vi.fn(),
  mockUpdateConnection: vi.fn(),
  mockGetComposio: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/connections/queries", () => ({
  deleteConnection: (...args: unknown[]) => mockDeleteConnection(...args),
  getConnectionByConnectedAccountId: (...args: unknown[]) =>
    mockGetConnectionByConnectedAccountId(...args),
  getPendingConnectionByToolkit: (...args: unknown[]) => mockGetPendingConnectionByToolkit(...args),
  insertConnection: (...args: unknown[]) => mockInsertConnection(...args),
  updateConnection: (...args: unknown[]) => mockUpdateConnection(...args),
}));

vi.mock("@/lib/composio", () => ({
  getComposio: (...args: unknown[]) => mockGetComposio(...args),
  COMPOSIO_TOOL_FETCH_LIMIT: 200,
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
    mockDeleteConnection.mockResolvedValue(undefined);
    mockGetConnectionByConnectedAccountId.mockResolvedValue(null);
    mockGetPendingConnectionByToolkit.mockResolvedValue(null);
    mockInsertConnection.mockResolvedValue({
      id: "row-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "owner@gmail.com",
      status: "active",
      activated_tools: [],
      tool_count: 3,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockUpdateConnection.mockResolvedValue({
      id: "row-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "owner@gmail.com",
      status: "active",
      activated_tools: [],
      tool_count: 3,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "ACTIVE",
          toolkit: { slug: "gmail" },
          data: { email: "owner@gmail.com" },
          params: {},
        }),
        list: vi.fn().mockResolvedValue({
          items: [{ id: "conn_123" }],
        }),
      },
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue([
          { slug: "GMAIL_SEND_EMAIL" },
          { slug: "GMAIL_READ_EMAIL" },
          { slug: "GMAIL_DELETE_EMAIL" },
        ]),
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
    mockGetPendingConnectionByToolkit.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "pending:test",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    const response = await GET(
      new Request("http://localhost/api/connections/callback?status=success&toolkit=gmail"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=invalid_callback",
    );
    expect(mockDeleteConnection).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "pending-row-1",
    );
  });

  it("does not poison a healthy row when a malformed callback omits connected_account_id", async () => {
    const response = await GET(
      new Request("http://localhost/api/connections/callback?status=failed&toolkit=gmail"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=invalid_callback",
    );
    expect(mockUpdateConnection).not.toHaveBeenCalled();
    expect(mockDeleteConnection).not.toHaveBeenCalled();
  });

  it("redirects to settings error when Composio reports a failed callback status", async () => {
    mockGetPendingConnectionByToolkit.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "pending:test",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=failed&connected_account_id=conn_123&toolkit=gmail",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=failed",
    );
    expect(mockDeleteConnection).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "pending-row-1",
    );
  });

  it("marks an existing active row as error on failed callbacks without relying on reason=reauth", async () => {
    mockGetConnectionByConnectedAccountId.mockResolvedValue({
      id: "conn-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: "Gmail",
      account_identifier: "owner@gmail.com",
      status: "active",
      activated_tools: ["GMAIL_SEND_EMAIL"],
      tool_count: 3,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=failed&connected_account_id=conn_123&toolkit=gmail",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=failed",
    );
    expect(mockUpdateConnection).toHaveBeenCalledWith({ marker: "server-client" }, "client-1", {
      id: "conn-1",
      status: "error",
      auth_redirect_url: null,
      auth_redirect_expires_at: null,
    });
    expect(mockDeleteConnection).not.toHaveBeenCalled();
  });

  it("finalizes a matching pending row and redirects to settings success", async () => {
    const getConnectedAccount = vi.fn().mockResolvedValue({
      id: "conn_123",
      status: "ACTIVE",
      toolkit: { slug: "gmail" },
      data: { email: "owner@gmail.com" },
      params: {},
    });
    const listOwnedConnections = vi.fn().mockResolvedValue({
      items: [{ id: "conn_123" }],
    });
    const getRawComposioTools = vi.fn().mockResolvedValue([
      { slug: "GMAIL_SEND_EMAIL" },
      { slug: "GMAIL_READ_EMAIL" },
      { slug: "GMAIL_DELETE_EMAIL" },
    ]);
    mockGetConnectionByConnectedAccountId.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: ["GMAIL_SEND_EMAIL"],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: getConnectedAccount,
        list: listOwnedConnections,
      },
      tools: {
        getRawComposioTools,
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
    expect(getRawComposioTools).toHaveBeenCalledWith({
      toolkits: ["gmail"],
      limit: 200,
    });
    expect(mockGetConnectionByConnectedAccountId).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "conn_123",
    );
    expect(mockUpdateConnection).toHaveBeenCalledWith({ marker: "server-client" }, "client-1", {
      id: "pending-row-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "owner@gmail.com",
      auth_redirect_url: null,
      auth_redirect_expires_at: null,
      status: "active",
      tool_count: 3,
    });
    expect(mockDeleteConnection).not.toHaveBeenCalled();
    expect(mockInsertConnection).not.toHaveBeenCalled();
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
    mockGetPendingConnectionByToolkit.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "pending:test",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "ACTIVE",
          toolkit: { slug: "gmail" },
          data: { email: "owner@gmail.com" },
          params: {},
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
    expect(mockDeleteConnection).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "pending-row-1",
    );
    expect(mockInsertConnection).not.toHaveBeenCalled();
  });

  it("reconciles an existing connected-account row instead of inserting a duplicate", async () => {
    mockGetPendingConnectionByToolkit.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "pending:test",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetConnectionByConnectedAccountId.mockResolvedValue({
      id: "row-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "owner@gmail.com",
      status: "inactive",
      activated_tools: [],
      tool_count: 3,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(mockUpdateConnection).toHaveBeenCalledWith({ marker: "server-client" }, "client-1", {
      id: "row-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "owner@gmail.com",
      auth_redirect_url: null,
      auth_redirect_expires_at: null,
      status: "active",
      tool_count: 3,
    });
    expect(mockDeleteConnection).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "pending-row-1",
    );
    expect(mockInsertConnection).not.toHaveBeenCalled();
  });

  it("inserts a new active row when no pending or existing row exists", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(mockInsertConnection).toHaveBeenCalledWith({ marker: "server-client" }, {
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "owner@gmail.com",
      auth_redirect_url: null,
      auth_redirect_expires_at: null,
      status: "active",
      activated_tools: [],
      tool_count: 3,
    });
  });

  it("falls back to connected account params.email when data.email is absent", async () => {
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "ACTIVE",
          toolkit: { slug: "gmail" },
          data: {},
          params: { email: "params@gmail.com" },
        }),
        list: vi.fn().mockResolvedValue({
          items: [{ id: "conn_123" }],
        }),
      },
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue([
          { slug: "GMAIL_SEND_EMAIL" },
          { slug: "GMAIL_READ_EMAIL" },
          { slug: "GMAIL_DELETE_EMAIL" },
        ]),
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123",
      ),
    );

    expect(response.status).toBe(307);
    expect(mockInsertConnection).toHaveBeenCalledWith({ marker: "server-client" }, {
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: "params@gmail.com",
      auth_redirect_url: null,
      auth_redirect_expires_at: null,
      status: "active",
      activated_tools: [],
      tool_count: 3,
    });
  });

  it("redirects to settings error when the connected account is not active", async () => {
    mockGetPendingConnectionByToolkit.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "pending:test",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockResolvedValue({
          id: "conn_123",
          status: "INITIATED",
          toolkit: { slug: "gmail" },
          data: {},
          params: {},
        }),
      },
      tools: {
        getRawComposioTools: vi.fn(),
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
    expect(mockDeleteConnection).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "pending-row-1",
    );
    expect(mockInsertConnection).not.toHaveBeenCalled();
  });

  it("redirects to settings error when callback verification throws", async () => {
    mockGetPendingConnectionByToolkit.mockResolvedValue({
      id: "pending-row-1",
      client_id: "client-1",
      composio_connected_account_id: "pending:test",
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
      activated_tools: [],
      tool_count: 0,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123&toolkit=gmail",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=callback_failed",
    );
    expect(mockDeleteConnection).toHaveBeenCalledWith(
      { marker: "server-client" },
      "client-1",
      "pending-row-1",
    );
  });

  it("marks an existing active row as error when callback verification throws", async () => {
    mockGetConnectionByConnectedAccountId.mockResolvedValue({
      id: "conn-1",
      client_id: "client-1",
      composio_connected_account_id: "conn_123",
      toolkit_slug: "gmail",
      display_name: "Gmail",
      account_identifier: "owner@gmail.com",
      status: "active",
      activated_tools: ["GMAIL_SEND_EMAIL"],
      tool_count: 3,
      created_at: "2026-03-07T00:00:00.000Z",
      updated_at: "2026-03-07T00:00:00.000Z",
    });
    mockGetComposio.mockReturnValue({
      connectedAccounts: {
        get: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/connections/callback?status=success&connected_account_id=conn_123&toolkit=gmail",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/settings?connection=error&reason=callback_failed",
    );
    expect(mockUpdateConnection).toHaveBeenCalledWith({ marker: "server-client" }, "client-1", {
      id: "conn-1",
      status: "error",
      auth_redirect_url: null,
      auth_redirect_expires_at: null,
    });
    expect(mockDeleteConnection).not.toHaveBeenCalled();
  });
});
