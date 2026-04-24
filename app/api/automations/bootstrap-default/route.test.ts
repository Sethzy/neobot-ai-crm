/**
 * Tests for the Daily Orchestrator bootstrap route.
 * @module app/api/automations/bootstrap-default/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateAndParseBody,
  mockResolveClientId,
  mockCreateAdminClient,
  mockEnsureMainThreadForClient,
  mockBootstrapDefaultDailyOrchestrator,
} = vi.hoisted(() => ({
  mockAuthenticateAndParseBody: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockEnsureMainThreadForClient: vi.fn(),
  mockBootstrapDefaultDailyOrchestrator: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateAndParseBody: (...args: unknown[]) => mockAuthenticateAndParseBody(...args),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/chat/threads", () => ({
  ensureMainThreadForClient: (...args: unknown[]) => mockEnsureMainThreadForClient(...args),
}));

vi.mock("@/lib/automations/default-daily-orchestrator", () => ({
  bootstrapDefaultDailyOrchestrator: (...args: unknown[]) =>
    mockBootstrapDefaultDailyOrchestrator(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

describe("POST /api/automations/bootstrap-default", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the default automation for the authenticated client", async () => {
    const supabase = { marker: "supabase" };
    const adminSupabase = { marker: "admin-supabase" };
    mockAuthenticateAndParseBody.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
      body: { timezone: "Asia/Singapore" },
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateAdminClient.mockResolvedValue(adminSupabase);
    mockEnsureMainThreadForClient.mockResolvedValue({ thread_id: "thread-1" });
    mockBootstrapDefaultDailyOrchestrator.mockResolvedValue({
      seeded: true,
      triggerId: "trigger-1",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/automations/bootstrap-default", {
        method: "POST",
        body: JSON.stringify({ timezone: "Asia/Singapore" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(mockBootstrapDefaultDailyOrchestrator).toHaveBeenCalledWith({
      supabase: adminSupabase,
      clientId: "client-1",
      threadId: "thread-1",
      timezone: "Asia/Singapore",
    });
    expect(mockEnsureMainThreadForClient).toHaveBeenCalledWith(
      adminSupabase,
      "client-1",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      seeded: true,
      triggerId: "trigger-1",
    });
  });

  it("repairs the main thread before seeding instead of reading user-scoped thread state", async () => {
    const adminSupabase = { marker: "admin-supabase" };
    mockAuthenticateAndParseBody.mockResolvedValue({
      kind: "ok",
      supabase: {},
      userId: "user-1",
      body: { timezone: "Asia/Singapore" },
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateAdminClient.mockResolvedValue(adminSupabase);
    mockEnsureMainThreadForClient.mockResolvedValue({ thread_id: "thread-main" });
    mockBootstrapDefaultDailyOrchestrator.mockResolvedValue({
      seeded: false,
      triggerId: null,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/automations/bootstrap-default", {
        method: "POST",
        body: JSON.stringify({ timezone: "Asia/Singapore" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockEnsureMainThreadForClient).toHaveBeenCalledWith(
      adminSupabase,
      "client-1",
    );
    expect(mockBootstrapDefaultDailyOrchestrator).toHaveBeenCalledWith({
      supabase: adminSupabase,
      clientId: "client-1",
      threadId: "thread-main",
      timezone: "Asia/Singapore",
    });
  });
});
