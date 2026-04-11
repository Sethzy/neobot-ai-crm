/**
 * Tests for trigger-run terminal finalization.
 * @module lib/managed-agents/__tests__/finalize-trigger-run
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  completeRun,
  runEvaluatorsForEvents,
  upsertMessage,
  deliverToExternalChannels,
} = vi.hoisted(() => ({
  completeRun: vi.fn().mockResolvedValue(undefined),
  runEvaluatorsForEvents: vi.fn().mockResolvedValue(undefined),
  upsertMessage: vi.fn().mockResolvedValue(undefined),
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  completeRun,
}));
vi.mock("@/lib/eval/run-evaluators", () => ({
  runEvaluatorsForEvents,
}));
vi.mock("@/lib/chat/messages", () => ({
  upsertMessage,
}));
vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels,
}));

import { computeTurnCost } from "../adapter-cost";
import {
  finalizeTriggerRun,
  persistTriggerRunSnapshot,
} from "../finalize-trigger-run";

describe("finalizeTriggerRun", () => {
  beforeEach(() => {
    completeRun.mockClear();
    runEvaluatorsForEvents.mockClear();
    upsertMessage.mockClear();
    deliverToExternalChannels.mockClear();
  });

  it("persists assistant output, delivers externally, and marks end_turn runs completed", async () => {
    const supabase = { __role: "service" } as never;
    const events = [
      {
        id: "evt_user",
        type: "user.message" as const,
        content: [{ type: "text" as const, text: "Review the inbound lead." }],
      },
      {
        id: "evt_msg",
        type: "agent.message" as const,
        content: [{ type: "text" as const, text: "Lead reviewed." }],
      },
      {
        id: "evt_terminal",
        type: "session.status_idle" as const,
        stop_reason: { type: "end_turn" as const },
      },
    ];

    await finalizeTriggerRun(supabase, {
      runId: "run_1",
      threadId: "thread_1",
      clientId: "client_1",
      events,
      cost: {
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadInputTokens: 5_000,
        cacheCreationInputTokens: 2_000,
        runtimeSeconds: 60,
      },
    });

    // Assistant message persisted with the stable run id so incremental
    // updates keep rewriting the same row.
    expect(upsertMessage).toHaveBeenCalledTimes(1);
    expect(upsertMessage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        thread_id: "thread_1",
        role: "assistant",
        source_event_id: "run:run_1",
      }),
    );

    // External channel delivery runs after persistence (same args as chat adapter).
    expect(deliverToExternalChannels).toHaveBeenCalledTimes(1);
    expect(deliverToExternalChannels).toHaveBeenCalledWith(
      supabase,
      "thread_1",
      "client_1",
      expect.any(String),
      expect.any(Array),
      "run:run_1",
    );

    expect(completeRun).toHaveBeenCalledTimes(1);
    const completion = completeRun.mock.calls[0][1];
    expect(completion).toMatchObject({
      runId: "run_1",
      status: "completed",
      model: "claude-sonnet-4-6",
      tokensIn: 100_000,
      tokensOut: 10_000,
      cacheReadTokens: 5_000,
    });
    expect(completion.costUsd).toBeCloseTo(
      computeTurnCost({
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadInputTokens: 5_000,
        cacheCreationInputTokens: 2_000,
        activeSeconds: 60,
      }),
      10,
    );
    expect(runEvaluatorsForEvents).toHaveBeenCalledWith(
      events,
      "run_1",
      supabase,
      { conversationInput: "Review the inbound lead." },
    );
  });

  it("marks retries_exhausted runs failed and still scores the terminal event stream", async () => {
    const supabase = { __role: "service" } as never;
    const events = [
      {
        id: "evt_terminal",
        type: "session.status_idle" as const,
        stop_reason: { type: "retries_exhausted" as const },
      },
    ];

    await finalizeTriggerRun(supabase, {
      runId: "run_1",
      threadId: "thread_1",
      clientId: "client_1",
      events,
      cost: {
        inputTokens: 50,
        outputTokens: 5,
        runtimeSeconds: 3,
      },
    });

    expect(completeRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        runId: "run_1",
        status: "failed",
        tokensIn: 50,
        tokensOut: 5,
      }),
    );
    expect(runEvaluatorsForEvents).toHaveBeenCalledWith(
      events,
      "run_1",
      supabase,
      { conversationInput: "" },
    );
  });

  it("does not persist or deliver when the session produced no assistant content", async () => {
    const supabase = { __role: "service" } as never;
    const events = [
      {
        id: "evt_terminal",
        type: "session.status_terminated" as const,
      },
    ];

    await finalizeTriggerRun(supabase, {
      runId: "run_1",
      threadId: "thread_1",
      clientId: "client_1",
      events,
      cost: {
        inputTokens: 10,
        outputTokens: 0,
        runtimeSeconds: 1,
      },
    });

    expect(upsertMessage).not.toHaveBeenCalled();
    expect(deliverToExternalChannels).not.toHaveBeenCalled();
    expect(completeRun).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("upserts the in-flight assistant snapshot using the stable run key", async () => {
    const supabase = { __role: "service" } as never;

    await persistTriggerRunSnapshot(supabase, {
      runId: "run_9",
      threadId: "thread_9",
      events: [
        {
          id: "evt_msg",
          type: "agent.message" as const,
          content: [{ type: "text" as const, text: "Halfway there." }],
        },
      ],
    });

    expect(upsertMessage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        thread_id: "thread_9",
        role: "assistant",
        source_event_id: "run:run_9",
      }),
    );
  });
});
