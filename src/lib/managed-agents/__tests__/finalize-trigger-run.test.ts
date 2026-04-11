/**
 * Tests for trigger-run terminal finalization.
 * @module lib/managed-agents/__tests__/finalize-trigger-run
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeRun, runEvaluatorsForEvents } = vi.hoisted(() => ({
  completeRun: vi.fn().mockResolvedValue(undefined),
  runEvaluatorsForEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  completeRun,
}));
vi.mock("@/lib/eval/run-evaluators", () => ({
  runEvaluatorsForEvents,
}));

import { computeTurnCost } from "../adapter-cost";
import { finalizeTriggerRun } from "../finalize-trigger-run";

describe("finalizeTriggerRun", () => {
  beforeEach(() => {
    completeRun.mockClear();
    runEvaluatorsForEvents.mockClear();
  });

  it("marks end_turn runs completed and runs evaluators", async () => {
    const supabase = { __role: "service" } as never;
    const events = [
      {
        id: "evt_user",
        type: "user.message" as const,
        content: [{ type: "text" as const, text: "Review the inbound lead." }],
      },
      {
        id: "evt_terminal",
        type: "session.status_idle" as const,
        stop_reason: { type: "end_turn" as const },
      },
    ];

    await finalizeTriggerRun(supabase, "run_1", events, {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheReadInputTokens: 5_000,
      cacheCreationInputTokens: 2_000,
      runtimeSeconds: 60,
    });

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

  it("marks retries_exhausted runs failed and skips evaluators", async () => {
    const supabase = { __role: "service" } as never;
    const events = [
      {
        id: "evt_terminal",
        type: "session.status_idle" as const,
        stop_reason: { type: "retries_exhausted" as const },
      },
    ];

    await finalizeTriggerRun(supabase, "run_1", events, {
      inputTokens: 50,
      outputTokens: 5,
      runtimeSeconds: 3,
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
    expect(runEvaluatorsForEvents).not.toHaveBeenCalled();
  });
});
