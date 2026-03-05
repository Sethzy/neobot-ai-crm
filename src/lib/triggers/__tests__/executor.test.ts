/**
 * Tests for trigger execution logic.
 * @module lib/triggers/__tests__/executor
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TriggerDispatchPayload } from "../schemas";

const {
  mockRunAgent,
  mockCreateMessage,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateMessage: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: mockCreateMessage,
}));

import { executeTrigger } from "../executor";

function createMockSupabase() {
  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    single: vi.fn(),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "agent_triggers") {
        return selectChain;
      }

      throw new Error(`Unexpected table access: ${table}`);
    }),
    rpc: vi.fn(),
    selectChain,
  };
}

const validPayload: TriggerDispatchPayload = {
  triggerId: "550e8400-e29b-41d4-a716-446655440000",
  clientId: "660e8400-e29b-41d4-a716-446655440000",
  threadId: "770e8400-e29b-41d4-a716-446655440000",
  currentRunId: "880e8400-e29b-41d4-a716-446655440000",
  triggerName: "Daily <briefing> & sync",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: { source: "cron" },
};

describe("executeTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgent.mockResolvedValue({ status: "streaming" });
    mockCreateMessage.mockResolvedValue({ message_id: "msg-001" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns claim_mismatch when the current claim no longer matches", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: { id: validPayload.triggerId, current_run_id: "different-run-id" },
      error: null,
    });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(result).toEqual({ status: "claim_mismatch" });
    expect(mockCreateMessage).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("persists a trigger-event system message and executes the runner", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: { id: validPayload.triggerId, current_run_id: validPayload.currentRunId },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(mockCreateMessage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        thread_id: validPayload.threadId,
        role: "system",
        content: expect.stringContaining("<trigger-event>"),
      }),
    );

    const persistedMessage = mockCreateMessage.mock.calls[0]?.[1];
    expect(persistedMessage.content).toContain("trigger_instance_id");
    expect(persistedMessage.content).toContain("trigger_type: schedule");
    expect(persistedMessage.content).toContain("&lt;briefing&gt;");
    expect(persistedMessage.content).toContain("&amp;");

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: validPayload.clientId,
        threadId: validPayload.threadId,
        triggerType: "cron",
      }),
      supabase,
    );
    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "completed",
    });
    expect(result).toEqual({ status: "completed" });
  });

  it("releases the claim as failed when the runner throws", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: { id: validPayload.triggerId, current_run_id: validPayload.currentRunId },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockRunAgent.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "failed",
    });
    expect(result).toEqual({ status: "failed" });
  });
});
