import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

const {
  mockComputeNextFireAt,
  mockSpawnTriggerRun,
  mockCreateMessage,
} = vi.hoisted(() => ({
  mockComputeNextFireAt: vi.fn(),
  mockSpawnTriggerRun: vi.fn(),
  mockCreateMessage: vi.fn(),
}));

vi.mock("@/lib/triggers/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/triggers/cron-utils")>();
  return { ...actual, computeNextFireAt: mockComputeNextFireAt };
});

vi.mock("@/lib/managed-agents/spawn-trigger-run", () => ({
  spawnTriggerRun: mockSpawnTriggerRun,
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: mockCreateMessage,
}));

import { manageActiveTriggersTool } from "../manage-active-triggers";

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";

function createMockSupabase() {
  const chain = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(),
    then: undefined as unknown,
  };

  chain.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve);

  return {
    from: vi.fn(() => chain),
    chain,
  };
}

function makeContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("manageActiveTriggersTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-07T01:00:00.000Z"));
    mockSpawnTriggerRun.mockResolvedValue({
      runId: "run-1",
      sessionId: "session-1",
      taskHandle: { id: "task-1" },
    });
    mockCreateMessage.mockResolvedValue({ message_id: "message-1" });
  });

  it("lists non-pulse triggers with an explicit client_id filter", async () => {
    const supabase = createMockSupabase();
    supabase.chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve({
        data: [
          {
            id: "trigger-1",
            name: "Daily briefing",
            trigger_type: "schedule",
            instruction_path: "memory/briefing.md",
            cron_expression: "0 9 * * *",
            payload: { timezone: "Asia/Singapore" },
            invocation_message: "Check listings",
          },
        ],
        error: null,
      }).then(resolve);

    const result = await manageActiveTriggersTool.execute(
      { action: "list" },
      makeContext(supabase),
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(supabase.chain.neq).toHaveBeenCalledWith("trigger_type", "pulse");
  });

  it("deletes a trigger for the current client", async () => {
    const supabase = createMockSupabase();
    supabase.chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    const result = await manageActiveTriggersTool.execute(
      { action: "delete", trigger_instance_id: "11111111-1111-4111-8111-111111111111" },
      makeContext(supabase),
    );

    expect(result).toMatchObject({ success: true, deleted: true });
    expect(supabase.chain.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("simulates a trigger by enqueuing a run", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Daily briefing",
        trigger_type: "schedule",
        thread_id: "thread-1",
        instruction_path: "memory/briefing.md",
        cron_expression: "0 9 * * *",
        payload: {},
        invocation_message: "Check listings",
      },
      error: null,
    });

    const result = await manageActiveTriggersTool.execute(
      {
        action: "simulate",
        trigger_instance_id: "11111111-1111-4111-8111-111111111111",
        payload: { source: "test" },
      },
      makeContext(supabase),
    );

    expect(mockCreateMessage).toHaveBeenCalled();
    expect(mockSpawnTriggerRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        clientId: CLIENT_ID,
        threadId: "thread-1",
        triggerType: "cron",
      }),
    );
    expect(result).toEqual({
      success: true,
      status: "queued",
      message: "Trigger simulation queued for execution.",
    });
  });
});
