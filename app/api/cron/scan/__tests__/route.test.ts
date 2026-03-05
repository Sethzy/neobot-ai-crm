/**
 * Tests for the /api/cron/scan route.
 * @module app/api/cron/scan/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

const {
  mockRunScan,
  mockCreateAdminClient,
  mockFetch,
} = vi.hoisted(() => ({
  mockRunScan: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/triggers/scanner", () => ({
  runScan: mockRunScan,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

const validPayload: TriggerDispatchPayload = {
  triggerId: "550e8400-e29b-41d4-a716-446655440000",
  clientId: "660e8400-e29b-41d4-a716-446655440000",
  threadId: "770e8400-e29b-41d4-a716-446655440000",
  currentRunId: "880e8400-e29b-41d4-a716-446655440000",
  triggerName: "Daily briefing",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: {},
  nextFireAt: "2026-03-07T09:00:00.000Z",
};

describe("GET /api/cron/scan", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    };
    mockCreateAdminClient.mockResolvedValue({ kind: "admin-client" });
    mockRunScan.mockResolvedValue({
      claimed: 0,
      dispatched: 0,
      staleReleased: 0,
      errors: [],
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns 401 when the authorization header is missing", async () => {
    const { GET } = await import("../route");

    const response = await GET(new Request("http://localhost/api/cron/scan"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 with scan results on valid auth", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/cron/scan", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      claimed: 0,
      dispatched: 0,
      staleReleased: 0,
      errors: [],
    });
  });

  it("prefers NEXT_PUBLIC_APP_URL when dispatching claimed triggers", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      const dispatchResult = await dispatch(validPayload);

      return {
        claimed: 1,
        dispatched: dispatchResult.ok ? 1 : 0,
        staleReleased: 0,
        errors: [],
      };
    });

    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/cron/scan", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.example.com/api/trigger/run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("returns dispatch status and body details to the scanner dependency", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Execution failed: boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      const dispatchResult = await dispatch(validPayload);

      expect(dispatchResult).toEqual({
        ok: false,
        status: 500,
        error: "Execution failed: boom",
      });

      return {
        claimed: 1,
        dispatched: 0,
        staleReleased: 0,
        errors: ["dispatch failed"],
      };
    });

    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/cron/scan", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      claimed: 1,
      dispatched: 0,
      staleReleased: 0,
      errors: ["dispatch failed"],
    });
  });

  it("falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is missing", async () => {
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      VERCEL_URL: "fallback.vercel.app",
    };
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      await dispatch(validPayload);

      return {
        claimed: 1,
        dispatched: 1,
        staleReleased: 0,
        errors: [],
      };
    });

    const { GET } = await import("../route");

    await GET(
      new Request("http://localhost/api/cron/scan", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://fallback.vercel.app/api/trigger/run",
      expect.any(Object),
    );
  });

  it("returns 500 when no internal base URL is configured", async () => {
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
    };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      await dispatch(validPayload);

      return {
        claimed: 1,
        dispatched: 1,
        staleReleased: 0,
        errors: [],
      };
    });

    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/cron/scan", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("not configured");
  });

  it("returns 500 when the scanner throws", async () => {
    mockRunScan.mockRejectedValueOnce(new Error("DB down"));
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/cron/scan", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("Scan failed");
  });
});
