/**
 * Tests for the OAuth initiate route.
 * @module app/api/connections/initiate/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

const {
  mockAuthenticateRequest,
  mockInitiateOAuthFlow,
  mockInsertConnection,
  mockResolveClientId,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockInitiateOAuthFlow: vi.fn(),
  mockInsertConnection: vi.fn(),
  mockResolveClientId: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/composio/connection-flow", () => ({
  initiateOAuthFlow: (...args: unknown[]) => mockInitiateOAuthFlow(...args),
}));

vi.mock("@/lib/connections/queries", () => ({
  insertConnection: (...args: unknown[]) => mockInsertConnection(...args),
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
    mockInitiateOAuthFlow.mockResolvedValue({
      redirectUrl: "https://composio.example.com/oauth",
      connectedAccountId: "connected-account-123",
      authRedirectExpiresAt: "2026-04-21T09:45:00.000Z",
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

  it("reuses a pending OAuth flow when the stored auth link is still live", async () => {
    mockSupabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          id: "pending-row-1",
          auth_redirect_url: "https://composio.example.com/existing",
          auth_redirect_expires_at: "2099-03-09T04:15:00.000Z",
        }],
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      redirectUrl: "https://composio.example.com/existing",
      expiresAt: "2099-03-09T04:15:00.000Z",
    });
    expect(mockInitiateOAuthFlow).not.toHaveBeenCalled();
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

  it("clears an expired pending row and allows the user to retry the OAuth flow", async () => {
    mockSupabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          id: "pending-row-1",
          auth_redirect_url: "https://composio.example.com/expired",
          auth_redirect_expires_at: "2026-03-09T04:00:00.000Z",
        }],
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
    expect(mockInitiateOAuthFlow).toHaveBeenCalledTimes(1);
  });

  it("delegates OAuth initiation to the shared helper and returns the redirect URL", async () => {
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
      expiresAt: "2026-04-21T09:45:00.000Z",
    });
    expect(mockResolveClientId).toHaveBeenCalledWith(mockSupabase, "user-1");
    expect(mockInitiateOAuthFlow).toHaveBeenCalledWith({
      composioUserId: "client-1",
      toolkitSlug: "gmail",
      callbackUrl: "http://localhost/api/connections/callback?toolkit=gmail",
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
      auth_redirect_url: "https://composio.example.com/oauth",
      auth_redirect_expires_at: "2026-04-21T09:45:00.000Z",
      status: "pending",
      activated_tools: [],
      tool_count: 0,
    });
  });

  it("returns 500 when the shared OAuth helper throws", async () => {
    mockInitiateOAuthFlow.mockRejectedValue(new Error("boom"));

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
});
