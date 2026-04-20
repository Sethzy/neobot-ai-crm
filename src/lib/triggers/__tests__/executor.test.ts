/**
 * Tests for trigger execution logic.
 * @module lib/triggers/__tests__/executor
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutomationAlreadyRunningError } from "@/lib/managed-agents/spawn-trigger-run";
import type { TriggerDispatchPayload } from "../schemas";

const {
  mockSpawnTriggerRun,
  mockAutomationAlreadyRunningError,
  mockCreateMessage,
  mockCollectNewRssItems,
  mockCreateAgentFileClient,
  mockCaptureServerEvent,
} = vi.hoisted(() => ({
  mockSpawnTriggerRun: vi.fn(),
  mockAutomationAlreadyRunningError: class AutomationAlreadyRunningError extends Error {
    constructor(triggerId: string) {
      super(`Automation ${triggerId} already has a running run.`);
      this.name = "AutomationAlreadyRunningError";
    }
  },
  mockCreateMessage: vi.fn(),
  mockCollectNewRssItems: vi.fn(),
  mockCreateAgentFileClient: vi.fn(),
  mockCaptureServerEvent: vi.fn(),
}));

vi.mock("@/lib/managed-agents/spawn-trigger-run", () => ({
  spawnTriggerRun: mockSpawnTriggerRun,
  AutomationAlreadyRunningError: mockAutomationAlreadyRunningError,
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

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
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
    mockSpawnTriggerRun.mockResolvedValue({
      runId: validPayload.currentRunId,
      sessionId: "session_1",
      taskHandle: { id: "task_1" },
    });
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
    expect(mockSpawnTriggerRun).not.toHaveBeenCalled();
  });

  it("spawns the managed run with trigger metadata (no origin-thread system message)", async () => {
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

    // No system message persisted to the origin thread anymore
    expect(mockCreateMessage).not.toHaveBeenCalled();

    expect(mockSpawnTriggerRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        runId: validPayload.currentRunId,
        clientId: validPayload.clientId,
        threadId: validPayload.threadId,
        triggerType: "cron",
        triggerId: validPayload.triggerId,
        triggerName: validPayload.triggerName,
      }),
    );
    expect(mockSpawnTriggerRun.mock.calls[0]?.[1]?.invocationMessage).toContain("<trigger-event>");
    expect(mockSpawnTriggerRun.mock.calls[0]?.[1]?.invocationMessage).toContain(
      "Process the most recent trigger event for this thread.",
    );
    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-07T09:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "queued",
    });
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: validPayload.clientId,
      event: "trigger_executed",
      properties: {
        trigger_id: validPayload.triggerId,
        thread_id: validPayload.threadId,
        trigger_type: "cron",
        result_status: "queued",
        success: false,
        duration_ms: expect.any(Number),
      },
    });
    expect(result).toEqual({ status: "queued" });
  });

  it("releases the claim as failed when trigger spawning throws", async () => {
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
    mockSpawnTriggerRun.mockRejectedValueOnce(new Error("queue failed"));

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_advance_next_fire_at: false,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "failed",
    });
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: validPayload.clientId,
      event: "trigger_executed",
      properties: expect.objectContaining({
        trigger_id: validPayload.triggerId,
        thread_id: validPayload.threadId,
        trigger_type: "cron",
        result_status: "failed",
        success: false,
      }),
    });
    expect(result).toEqual({ status: "failed" });
  });

  it("releases the claim as skipped_thread_busy when the automation is already running", async () => {
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
    mockSpawnTriggerRun.mockRejectedValueOnce(
      new AutomationAlreadyRunningError(validPayload.triggerId),
    );

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: validPayload.nextFireAt,
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "skipped_thread_busy",
    });
    expect(result).toEqual({ status: "skipped_busy" });
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
    mockSpawnTriggerRun.mockRejectedValueOnce(new Error("queue failed"));

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
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
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "queued",
    });
    expect(result).toEqual({ status: "queued" });
  });

  it("queues pulse triggers through the managed trigger listener without persisting a trigger-event system message", async () => {
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
    expect(mockSpawnTriggerRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        runId: validPayload.currentRunId,
        clientId: validPayload.clientId,
        threadId: validPayload.threadId,
        triggerType: "autopilot",
        invocationMessage: expect.stringContaining("You are running an autonomous pulse"),
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-07T09:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "queued",
    });
    expect(result).toEqual({ status: "queued" });
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
    expect(mockSpawnTriggerRun).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-07T09:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "completed",
    });
    expect(result).toEqual({ status: "completed" });
  });

  it("creates a trigger-event and spawns the managed run when rss polling finds new items", async () => {
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

    // No system message persisted to the origin thread anymore
    expect(mockCreateMessage).not.toHaveBeenCalled();
    expect(mockSpawnTriggerRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        triggerType: "cron",
        triggerId: validPayload.triggerId,
        triggerName: "PropertyGuru monitor",
      }),
    );
    // The invocation message should contain RSS item data
    expect(mockSpawnTriggerRun.mock.calls[0]?.[1]?.invocationMessage).toContain("listing-2");
    expect(result).toEqual({ status: "queued" });
  });

  it("marks pulse triggers as failed when listener queueing throws", async () => {
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
    mockSpawnTriggerRun.mockRejectedValueOnce(new Error("pulse queue failed"));

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
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: validPayload.clientId,
      event: "trigger_executed",
      properties: expect.objectContaining({
        trigger_id: validPayload.triggerId,
        thread_id: validPayload.threadId,
        trigger_type: "pulse",
        result_status: "failed",
        success: false,
      }),
    });
    expect(result).toEqual({ status: "failed" });
  });

  it("queues pulse triggers and advances to the next slot on success", async () => {
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
        nextFireAt: "2026-03-06T12:00:00.000Z",
      },
    });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-06T12:00:00.000Z",
      p_advance_next_fire_at: true,
      p_trigger_id: validPayload.triggerId,
      p_run_id: validPayload.currentRunId,
      p_status: "queued",
    });
    expect(result).toEqual({ status: "queued" });
  });
});
