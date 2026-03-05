/**
 * Tests for the /api/trigger/run route.
 * @module app/api/trigger/run/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecuteTrigger,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockExecuteTrigger: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("@/lib/triggers/executor", () => ({
  executeTrigger: mockExecuteTrigger,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

const validBody = {
  triggerId: "550e8400-e29b-41d4-a716-446655440000",
  clientId: "660e8400-e29b-41d4-a716-446655440000",
  threadId: "770e8400-e29b-41d4-a716-446655440000",
  currentRunId: "880e8400-e29b-41d4-a716-446655440000",
  triggerType: "schedule",
  triggerName: "Daily briefing",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: {},
};

describe("POST /api/trigger/run", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
    };
    mockCreateAdminClient.mockResolvedValue({ kind: "admin-client" });
    mockExecuteTrigger.mockResolvedValue({ status: "completed" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 401 without valid auth", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer test-secret",
        },
        body: "{bad-json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid payload", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer test-secret",
        },
        body: JSON.stringify({ bad: "payload" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 200 with the execution result on success", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer test-secret",
        },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "completed" });
  });

  it("returns 409 when the claim no longer matches", async () => {
    mockExecuteTrigger.mockResolvedValueOnce({ status: "claim_mismatch" });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer test-secret",
        },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(409);
  });

  it("returns 500 when the executor throws", async () => {
    mockExecuteTrigger.mockRejectedValueOnce(new Error("crash"));
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer test-secret",
        },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("Execution failed");
  });
});
