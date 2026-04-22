/**
 * @module lib/managed-agents/__tests__/recover-orphaned-run.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/chat/messages", () => ({
  upsertMessage: vi.fn().mockResolvedValue({ message_id: "msg_1" }),
}));

vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  completeRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/eval/run-evaluators", () => ({
  runEvaluatorsForEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../download-session-files", () => ({
  downloadSessionFiles: vi.fn().mockResolvedValue([]),
}));

const { upsertMessage } = await import("@/lib/chat/messages");
const { completeRun } = await import("@/lib/runner/run-lifecycle");
const { downloadSessionFiles } = await import("../download-session-files");

import { recoverOrphanedRun } from "../recover-orphaned-run";

function makeRun() {
  return {
    runId: "run_1",
    threadId: "thread_1",
    clientId: "client_1",
    sessionId: "sesn_abc",
    model: "claude-sonnet-4-6",
  };
}

function makeAnthropic(events: unknown[]) {
  return {
    beta: {
      sessions: {
        events: {
          list: vi.fn().mockResolvedValue({ data: events }),
        },
        retrieve: vi.fn().mockResolvedValue({
          stats: { active_seconds: 10 },
        }),
      },
    },
  } as never;
}

function makeSupabase() {
  return {} as never;
}

const userMessage = {
  id: "sevt_user1",
  type: "user.message",
  content: [{ type: "text", text: "hello" }],
};

const agentMessage = {
  id: "sevt_agent1",
  type: "agent.message",
  content: [{ type: "text", text: "Here is the result" }],
};

const idleEndTurn = {
  id: "sevt_idle1",
  type: "session.status_idle",
  stop_reason: { type: "end_turn" },
};

describe("recoverOrphanedRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a run with events — persists message and completes run", async () => {
    const result = await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([userMessage, agentMessage, idleEndTurn]),
      run: makeRun(),
      stopReasonType: "end_turn",
    });

    expect(result.recovered).toBe(true);
    expect(upsertMessage).toHaveBeenCalledOnce();
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runId: "run_1", status: "completed" }),
    );
  });

  it("skips recovery for requires_action (approval pause)", async () => {
    const result = await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([]),
      run: makeRun(),
      stopReasonType: "requires_action",
    });

    expect(result.recovered).toBe(false);
    expect(result.reason).toContain("approval pause");
    expect(upsertMessage).not.toHaveBeenCalled();
  });

  it("marks run failed when no events found", async () => {
    const result = await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([]),
      run: makeRun(),
      stopReasonType: "end_turn",
    });

    expect(result.recovered).toBe(false);
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("extracts current turn events from multi-turn session", async () => {
    const turn1User = { ...userMessage, id: "sevt_old_user" };
    const turn1Agent = { ...agentMessage, id: "sevt_old_agent" };
    const turn1Idle = { ...idleEndTurn, id: "sevt_old_idle" };
    const turn2User = { ...userMessage, id: "sevt_new_user" };
    const turn2Agent = { ...agentMessage, id: "sevt_new_agent" };
    const turn2Idle = { ...idleEndTurn, id: "sevt_new_idle" };

    await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([
        turn1User, turn1Agent, turn1Idle,
        turn2User, turn2Agent, turn2Idle,
      ]),
      run: makeRun(),
      stopReasonType: "end_turn",
    });

    // The source_event_id should come from the LAST idle event (turn 2)
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source_event_id: "sevt_new_idle" }),
    );
  });

  it("handles completeRun failure gracefully (race with SSE handler)", async () => {
    vi.mocked(completeRun).mockRejectedValueOnce(new Error("Run already completed"));

    const result = await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([userMessage, agentMessage, idleEndTurn]),
      run: makeRun(),
      stopReasonType: "end_turn",
    });

    // Still reports recovered because the message was persisted
    expect(result.recovered).toBe(true);
  });

  it("continues when file download fails", async () => {
    vi.mocked(downloadSessionFiles).mockRejectedValueOnce(new Error("Download failed"));

    const result = await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([userMessage, agentMessage, idleEndTurn]),
      run: makeRun(),
      stopReasonType: "end_turn",
    });

    expect(result.recovered).toBe(true);
    expect(upsertMessage).toHaveBeenCalledOnce();
  });

  it("marks run as failed for retries_exhausted", async () => {
    const idleRetries = {
      ...idleEndTurn,
      stop_reason: { type: "retries_exhausted" },
    };

    await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([userMessage, agentMessage, idleRetries]),
      run: makeRun(),
      stopReasonType: "retries_exhausted",
    });

    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("persists only the post-approval follow-up after request_approval resolves", async () => {
    await recoverOrphanedRun({
      supabase: makeSupabase(),
      anthropic: makeAnthropic([
        {
          id: "sevt_user1",
          type: "user.message",
          content: [{ type: "text", text: "Delete duplicates" }],
        },
        {
          id: "toolu_request_1",
          type: "agent.custom_tool_use",
          name: "request_approval",
          input: {
            summary: "Delete duplicates",
            action_type: "crm.delete_records",
          },
        },
        {
          id: "toolr_request_1",
          type: "user.custom_tool_result",
          custom_tool_use_id: "toolu_request_1",
          content: [{ type: "text", text: '{"success":true,"approved":true}' }],
        },
        {
          id: "sevt_agent2",
          type: "agent.message",
          content: [{ type: "text", text: "Deleted the duplicates." }],
        },
        {
          id: "sevt_idle2",
          type: "session.status_idle",
          stop_reason: { type: "end_turn" },
        },
      ]),
      run: makeRun(),
      stopReasonType: "end_turn",
    });

    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Deleted the duplicates.",
        source_event_id: "sevt_idle2",
      }),
    );
  });
});
