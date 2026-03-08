/**
 * Tests for the OAuth initiate route.
 * @module app/api/connections/initiate/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

const {
  mockAuthenticateRequest,
  mockInsertConnection,
  mockResolveClientId,
  mockGetComposio,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockInsertConnection: vi.fn(),
  mockResolveClientId: vi.fn(),
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
  insertConnection: (...args: unknown[]) => mockInsertConnection(...args),
}));

vi.mock("@/lib/composio", () => ({
  getComposio: (...args: unknown[]) => mockGetComposio(...args),
}));

import { POST } from "../route";

describe("POST /api/connections/initiate", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: mockSupabase,
      userId: "user-1",
    });
    mockInsertConnection.mockResolvedValue({
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
    mockResolveClientId.mockResolvedValue("client-1");
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

  afterEach(() => {
    vi.useRealTimers();
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

  it("returns 409 when a pending OAuth flow already exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T04:00:00.000Z"));
    mockSupabase = createMockSupabaseClient({
      selectResult: {
        data: [{ id: "pending-row-1", created_at: "2026-03-09T03:55:00.000Z" }],
        error: null,
      },
    });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: mockSupabase,
      userId: "user-1",
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "An OAuth flow for this service is already in progress.",
    });
  });

  it("checks only for pending duplicates before starting a new flow", async () => {
    await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(mockSupabase.calls.from).toContain("connections");
    expect(mockSupabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "pending"],
    });
    expect(mockSupabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("clears a stale pending row and allows the user to retry the OAuth flow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T04:30:00.000Z"));
    mockSupabase = createMockSupabaseClient({
      selectResult: {
        data: [{ id: "pending-row-1", created_at: "2026-03-09T04:00:00.000Z" }],
        error: null,
      },
      deleteResult: { data: null, error: null },
    });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: mockSupabase,
      userId: "user-1",
    });

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSupabase.calls.methods).toContainEqual(
      expect.objectContaining({ method: "delete" }),
    );
    expect(mockSupabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["id", "pending-row-1"],
    });
    expect(mockInsertConnection).toHaveBeenCalledTimes(1);
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
    expect(mockResolveClientId).toHaveBeenCalledWith(mockSupabase, "user-1");
    expect(authConfigList).toHaveBeenCalledWith({
      toolkit: "gmail",
      isComposioManaged: true,
    });
    expect(authConfigCreate).not.toHaveBeenCalled();
    expect(link).toHaveBeenCalledWith("client-1", "auth_existing", {
      callbackUrl: "http://localhost/api/connections/callback?toolkit=gmail",
    });
    expect(mockInsertConnection).toHaveBeenCalledWith(mockSupabase, {
      client_id: "client-1",
      composio_connected_account_id: expect.stringMatching(/^pending:/),
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
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
      callbackUrl: "http://localhost/api/connections/callback?toolkit=gmail",
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
      callbackUrl: "http://localhost/api/connections/callback?toolkit=googlecalendar",
    });
  });

  it("persists a pending connection row before returning the redirect URL", async () => {
    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockInsertConnection).toHaveBeenCalledTimes(1);
    expect(mockInsertConnection).toHaveBeenCalledWith(mockSupabase, {
      client_id: "client-1",
      composio_connected_account_id: expect.stringMatching(/^pending:/),
      toolkit_slug: "gmail",
      display_name: null,
      account_identifier: null,
      status: "pending",
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
    await expect(response.json()).resolves.toEqual({ error: "Failed to initiate connection." });
  });

  it("returns 500 when pending-row persistence fails", async () => {
    mockInsertConnection.mockRejectedValue(new Error("insert failed"));

    const response = await POST(
      new Request("http://localhost/api/connections/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to initiate connection." });
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
    await expect(response.json()).resolves.toEqual({ error: "Failed to initiate connection." });
    expect(mockInsertConnection).not.toHaveBeenCalled();
  });
});
