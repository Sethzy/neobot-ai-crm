/**
 * Tests for the manual automation run route.
 * @module app/api/automations/[triggerId]/run/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockSpawnTriggerRun,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockSpawnTriggerRun: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: () => mockAuthenticateRequest(),
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/managed-agents/spawn-trigger-run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/managed-agents/spawn-trigger-run")>();

  return {
    ...actual,
    spawnTriggerRun: (...args: unknown[]) => mockSpawnTriggerRun(...args),
  };
});

function createMockSupabaseWithTrigger() {
  const triggerSingle = vi.fn().mockResolvedValue({
    data: {
      id: "trigger-1",
      client_id: "client-1",
      thread_id: "thread-1",
      trigger_type: "schedule",
      name: "Daily briefing",
      instruction_path: "state/triggers/daily-briefing.md",
      payload: {},
      invocation_message: "Run the daily briefing",
    },
    error: null,
  });
  const triggerChain = {
    select: vi.fn(() => triggerChain),
    eq: vi.fn(() => triggerChain),
    single: triggerSingle,
  };

  const runsLimit = vi.fn().mockResolvedValue({
    data: [],
    error: null,
  });
  const runsChain = {
    select: vi.fn(() => runsChain),
    eq: vi.fn(() => runsChain),
    limit: runsLimit,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "agent_triggers") {
        return triggerChain;
      }

      if (table === "runs") {
        return runsChain;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("POST /api/automations/[triggerId]/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "success",
      supabase: createMockSupabaseWithTrigger(),
    });
  });

  it("returns 409 when spawnTriggerRun says the automation is already running", async () => {
    const { AutomationAlreadyRunningError } = await import("@/lib/managed-agents/spawn-trigger-run");

    mockSpawnTriggerRun.mockRejectedValueOnce(
      new AutomationAlreadyRunningError("trigger-1"),
    );

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ triggerId: "trigger-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A run is already in progress for this automation",
    });
  });
});
