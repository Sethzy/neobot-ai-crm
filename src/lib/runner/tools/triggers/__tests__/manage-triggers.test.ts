/**
 * Tests for the manage_active_triggers tool.
 * @module lib/runner/tools/triggers/__tests__/manage-triggers
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockComputeNextFireAt,
  mockRunAgent,
  mockCreateMessage,
} = vi.hoisted(() => ({
  mockComputeNextFireAt: vi.fn(),
  mockRunAgent: vi.fn(),
  mockCreateMessage: vi.fn(),
}));

vi.mock("@/lib/triggers/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/triggers/cron-utils")>();
  return {
    ...actual,
    computeNextFireAt: mockComputeNextFireAt,
  };
});

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: mockCreateMessage,
}));

import { createManageTriggersTool } from "../manage-triggers";

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

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

describe("createManageTriggersTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-07T01:00:00.000Z"));
    mockRunAgent.mockResolvedValue({ status: "queued" });
    mockCreateMessage.mockResolvedValue({ message_id: "message-1" });
  });

  it("requires approval only for delete actions when mutations are allowed", async () => {
    const supabase = createMockSupabase();
    const { manage_active_triggers } = createManageTriggersTool(
      supabase as never,
      CLIENT_ID,
    );

    const needsApproval = (
      manage_active_triggers as {
        needsApproval?: (input: { action: string }) => boolean | Promise<boolean>;
      }
    ).needsApproval;

    expect(typeof needsApproval).toBe("function");
    expect(await needsApproval?.({ action: "delete" })).toBe(true);
    expect(await needsApproval?.({ action: "edit" })).toBe(false);
    expect(await needsApproval?.({ action: "simulate" })).toBe(false);
    expect(await needsApproval?.({ action: "list" })).toBe(false);
  });

  it("does not add approval gating in read-only mode", () => {
    const supabase = createMockSupabase();
    const { manage_active_triggers } = createManageTriggersTool(
      supabase as never,
      CLIENT_ID,
      { readOnly: true },
    );

    expect(manage_active_triggers).not.toHaveProperty("needsApproval");
  });

  it("limits read-only mode to list and view actions", () => {
    const supabase = createMockSupabase();
    const { manage_active_triggers } = createManageTriggersTool(
      supabase as never,
      CLIENT_ID,
      { readOnly: true },
    );

    expect(
      manage_active_triggers.inputSchema.safeParse({
        action: "view",
        trigger_instance_id: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
    expect(
      manage_active_triggers.inputSchema.safeParse({
        action: "delete",
        trigger_instance_id: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
  });

  it("lists non-pulse triggers with tasklet-style fields", async () => {
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
    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      { action: "list" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.neq).toHaveBeenCalledWith("trigger_type", "pulse");
    expect(result.triggers).toEqual([
      {
        id: "trigger-1",
        name: "Daily briefing",
        title: "schedule",
        instruction_path: "/agent/memory/briefing.md",
        invocationMessage: "Check listings",
        arguments: {
          cron_expression: "0 9 * * *",
          timezone: "Asia/Singapore",
        },
      },
    ]);
  });

  it("views a single trigger with normalized invocation fields", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-1",
        name: "Daily briefing",
        trigger_type: "schedule",
        thread_id: "thread-1",
        instruction_path: "subagents/triggers/daily-briefing.md",
        cron_expression: "0 9 * * *",
        payload: { timezone: "Asia/Singapore" },
        invocation_message: "Check listings",
      },
      error: null,
    });
    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      {
        action: "view",
        trigger_instance_id: "trigger-1",
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.trigger).toMatchObject({
      id: "trigger-1",
      instruction_path: "/agent/subagents/triggers/daily-briefing.md",
      invocationMessage: "Check listings",
      arguments: {
        cron_expression: "0 9 * * *",
        timezone: "Asia/Singapore",
      },
    });
  });

  it("ignores non-object payload values when formatting trigger arguments", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-1",
        name: "Daily briefing",
        trigger_type: "schedule",
        thread_id: "thread-1",
        instruction_path: "subagents/triggers/daily-briefing.md",
        cron_expression: "0 9 * * *",
        payload: ["Asia/Singapore"],
        invocation_message: "Check listings",
      },
      error: null,
    });
    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      {
        action: "view",
        trigger_instance_id: "trigger-1",
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.trigger).toMatchObject({
      arguments: {
        cron_expression: "0 9 * * *",
      },
    });
    expect(result.trigger.arguments).not.toHaveProperty("0");
  });

  it("deletes a trigger for the current client", async () => {
    const supabase = createMockSupabase();
    supabase.chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);
    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      {
        action: "delete",
        trigger_instance_id: "trigger-1",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deleted: true, trigger_id: "trigger-1" });
    expect(supabase.chain.delete).toHaveBeenCalled();
  });

  it("edits schedule trigger config, recomputes next_fire_at, and resets retry_count", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single
      .mockResolvedValueOnce({
        data: {
          id: "trigger-1",
          trigger_type: "schedule",
          name: "Daily briefing",
          cron_expression: "0 9 * * *",
          payload: { timezone: "Asia/Singapore" },
          invocation_message: "Check listings",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "trigger-1",
          client_id: CLIENT_ID,
          trigger_type: "schedule",
          cron_expression: "0 8 * * *",
          name: "Daily briefing",
          thread_id: "thread-1",
          instruction_path: "subagents/triggers/daily-briefing.md",
          payload: {
            cron: "0 8 * * *",
            timezone: "Asia/Singapore",
          },
          invocation_message: null,
          next_fire_at: "2026-03-07T01:00:00.000Z",
          retry_count: 0,
        },
        error: null,
      });
    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      {
        action: "edit",
        trigger_instance_id: "trigger-1",
        edit_params: {
          cron: "0 8 * * *",
        },
        invocation_message: null,
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockComputeNextFireAt).toHaveBeenCalledWith(
      "0 8 * * *",
      expect.any(Date),
      "Asia/Singapore",
    );
    expect(supabase.chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        cron_expression: "0 8 * * *",
        next_fire_at: "2026-03-07T01:00:00.000Z",
        retry_count: 0,
        invocation_message: null,
        payload: {
          cron: "0 8 * * *",
          timezone: "Asia/Singapore",
        },
      }),
    );
  });

  it("edits webhook triggers by updating the webhook_secret column", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single
      .mockResolvedValueOnce({
        data: {
          id: "trigger-1",
          client_id: CLIENT_ID,
          trigger_type: "webhook",
          name: "Inbound leads",
          thread_id: "thread-1",
          instruction_path: "state/triggers/inbound-leads.md",
          cron_expression: null,
          payload: {},
          webhook_secret: "old-secret",
          invocation_message: "Review inbound leads",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "trigger-1",
          client_id: CLIENT_ID,
          trigger_type: "webhook",
          name: "Inbound leads",
          thread_id: "thread-1",
          instruction_path: "state/triggers/inbound-leads.md",
          payload: {},
          webhook_secret: "new-secret",
          invocation_message: "Review inbound leads",
        },
        error: null,
      });

    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      {
        action: "edit",
        trigger_instance_id: "trigger-1",
        edit_params: {
          webhook_secret: "new-secret",
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        webhook_secret: "new-secret",
        payload: {},
        retry_count: 0,
      }),
    );
  });

  it("simulates a trigger by persisting an event and starting a real cron-style run", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-1",
        client_id: CLIENT_ID,
        thread_id: "thread-1",
        trigger_type: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
      },
      error: null,
    });
    const { manage_active_triggers } = createManageTriggersTool(supabase as never, CLIENT_ID);

    const result = await manage_active_triggers.execute(
      {
        action: "simulate",
        trigger_instance_id: "trigger-1",
        payload: {
          test: true,
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateMessage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        thread_id: "thread-1",
        role: "system",
        content: expect.stringContaining("<trigger-event>"),
      }),
    );
    const persistedMessage = mockCreateMessage.mock.calls[0]?.[1];
    expect(persistedMessage.content).toContain(
      "instruction_path: /agent/subagents/triggers/daily-briefing.md",
    );
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT_ID,
        threadId: "thread-1",
        triggerType: "cron",
        input: "Process the most recent trigger event for this thread.",
      },
      supabase,
    );
    expect(result).toEqual({
      success: true,
      status: "queued",
      message: "Trigger simulation queued for execution.",
    });
  });
});
