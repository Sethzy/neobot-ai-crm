/**
 * Tests for trigger execution logic.
 * @module lib/triggers/__tests__/executor
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TriggerDispatchPayload } from "../schemas";

const {
  mockRunAgent,
  mockRunAutopilot,
  mockCreateMessage,
  mockCollectNewRssItems,
  mockCreateAgentFileClient,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockRunAutopilot: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockCollectNewRssItems: vi.fn(),
  mockCreateAgentFileClient: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/runner/run-autopilot", () => ({
  runAutopilot: mockRunAutopilot,
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: mockCreateMessage,
}));

vi.mock("../rss", () => ({
  collectNewRssItems: mockCollectNewRssItems,
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
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
  triggerType: "schedule",
  triggerName: "Daily <briefing> & sync",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: { source: "cron" },
  invocationMessage: "Run the daily briefing",
  nextFireAt: "2026-03-07T09:00:00.000Z",
};

describe("executeTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgent.mockResolvedValue({ status: "streaming" });
    mockRunAutopilot.mockResolvedValue({ status: "completed" });
    mockCreateMessage.mockResolvedValue({ message_id: "msg-001" });
    mockCreateAgentFileClient.mockReturnValue({ kind: "file-client" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns claim_mismatch when the current claim no longer matches", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: "different-run-id",
        retry_count: 0,
      },
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
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
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
    expect(persistedMessage.content).toContain(
      "invocation_message: Run the daily briefing",
    );
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
      p_next_fire_at: "2026-03-07T09:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "completed",
    });
    expect(result).toEqual({ status: "completed" });
  });

  it("releases the claim as failed when the runner throws", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockRunAgent.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: null,
      p_advance_next_fire_at: false,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "failed",
    });
    expect(result).toEqual({ status: "failed" });
  });

  it("marks exhausted runner failures as failed_permanent", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 2,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockRunAgent.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: null,
      p_advance_next_fire_at: false,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "failed_permanent",
    });
    expect(result).toEqual({ status: "failed" });
  });

  it("does not send next_fire_at for non-schedule trigger payloads", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: {
        ...validPayload,
        nextFireAt: undefined,
      },
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: null,
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "completed",
    });
    expect(result).toEqual({ status: "completed" });
  });

  it("routes pulse triggers to runAutopilot without persisting a trigger-event system message", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: {
        ...validPayload,
        triggerType: "pulse",
        triggerName: "Autopilot Pulse",
        instructionPath: "autopilot/pulse",
      },
    });

    expect(mockCreateMessage).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
    expect(mockRunAutopilot).toHaveBeenCalledWith({
      clientId: validPayload.clientId,
      threadId: validPayload.threadId,
      supabase: supabase as never,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-07T09:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "completed",
    });
    expect(result).toEqual({ status: "completed" });
  });

  it("completes rss triggers without invoking the runner when no new items are found", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockCollectNewRssItems.mockResolvedValueOnce({
      feed: {
        title: "PropertyGuru",
        description: null,
        items: [],
      },
      newItems: [],
      seenGuids: ["listing-1"],
      statePath: "state/trigger-1/seen.json",
      isFirstSync: false,
    });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: {
        ...validPayload,
        triggerType: "rss",
        triggerName: "PropertyGuru monitor",
        triggerPayload: {
          feed_url: "https://example.com/feed.xml",
        },
      },
    });

    expect(mockCollectNewRssItems).toHaveBeenCalled();
    expect(mockCreateMessage).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-07T09:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "completed",
    });
    expect(result).toEqual({ status: "completed" });
  });

  it("creates a trigger-event and runs the agent when rss polling finds new items", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockCollectNewRssItems.mockResolvedValueOnce({
      feed: {
        title: "PropertyGuru",
        description: null,
        items: [],
      },
      newItems: [
        {
          id: "listing-2",
          title: "2 Bedroom Condo",
          link: "https://example.com/listing-2",
          summary: "High floor",
          publishedAt: "2026-03-06T09:00:00Z",
        },
      ],
      seenGuids: ["listing-1", "listing-2"],
      statePath: "state/trigger-1/seen.json",
      isFirstSync: false,
    });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: {
        ...validPayload,
        triggerType: "rss",
        triggerName: "PropertyGuru monitor",
        triggerPayload: {
          feed_url: "https://example.com/feed.xml",
        },
      },
    });

    const persistedMessage = mockCreateMessage.mock.calls[0]?.[1];
    expect(persistedMessage.content).toContain("listing-2");
    expect(persistedMessage.content).toContain("new_item_count");
    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: "cron",
      }),
      supabase,
    );
    expect(result).toEqual({ status: "completed" });
  });

  it("marks pulse triggers as skipped_busy when the autopilot thread lock is already held", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockRunAutopilot.mockResolvedValueOnce({ status: "skipped_busy" });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: {
        ...validPayload,
        triggerType: "pulse",
        triggerName: "Autopilot Pulse",
        instructionPath: "autopilot/pulse",
        nextFireAt: "2026-03-06T12:00:00.000Z",
      },
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-06T12:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "skipped_thread_busy",
    });
    expect(result).toEqual({ status: "skipped_busy" });
  });

  it("does not retry pulse failures and advances to the next slot", async () => {
    const supabase = createMockSupabase();
    supabase.selectChain.single.mockResolvedValue({
      data: {
        id: validPayload.triggerId,
        current_run_id: validPayload.currentRunId,
        retry_count: 0,
      },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: true, error: null });
    mockRunAutopilot.mockResolvedValueOnce({ status: "failed" });

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: {
        ...validPayload,
        triggerType: "pulse",
        triggerName: "Autopilot Pulse",
        instructionPath: "autopilot/pulse",
        nextFireAt: "2026-03-06T12:00:00.000Z",
      },
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-06T12:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "failed",
    });
    expect(result).toEqual({ status: "failed" });
  });
});
