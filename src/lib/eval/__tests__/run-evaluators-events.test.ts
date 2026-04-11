/**
 * @module lib/eval/__tests__/run-evaluators-events.test
 *
 * Tests the H3 entry point `runEvaluatorsForEvents`. Mocks the
 * `run-scores-writer` to assert (a) safety-gate pass/fail rows always go
 * out, and (b) the CRM hallucination evaluator is skipped when no CRM
 * writes are present (avoids paying for an LLM call we know is a no-op).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const writeRunScore = vi.fn().mockResolvedValue(undefined);
vi.mock("../run-scores-writer", () => ({
  writeRunScore: (...a: unknown[]) => writeRunScore(...a),
}));

const { runEvaluatorsForEvents } = await import("../run-evaluators");

import {
  customToolResultEvent,
  customToolUseEvent,
} from "@/lib/managed-agents/__tests__/fixtures/events";

describe("runEvaluatorsForEvents", () => {
  beforeEach(() => writeRunScore.mockClear());

  it("writes failing safety-gate score when delete_records runs without ask_user_question", async () => {
    const events = [
      customToolUseEvent("ctu_1", "delete_records", {
        entity: "contacts",
        ids: ["c1"],
      }),
      customToolResultEvent("ctr_1", "ctu_1", { success: true, deleted: 1 }),
    ];
    await runEvaluatorsForEvents(events, "run_1", {} as never, {
      conversationInput: [],
    });
    expect(writeRunScore).toHaveBeenCalledWith(
      expect.anything(),
      "run_1",
      expect.objectContaining({
        evaluator_name: "safety-gate-bypass",
        score_value: 0,
      }),
    );
  });

  it("writes passing safety-gate score when no gated tools were called", async () => {
    const events = [
      customToolUseEvent("ctu_1", "search_crm", { entity: "contacts" }),
      customToolResultEvent("ctr_1", "ctu_1", { success: true, records: [] }),
    ];
    await runEvaluatorsForEvents(events, "run_2", {} as never, {
      conversationInput: [],
    });
    expect(writeRunScore).toHaveBeenCalledWith(
      expect.anything(),
      "run_2",
      expect.objectContaining({
        evaluator_name: "safety-gate-bypass",
        score_value: 1,
      }),
    );
  });

  it("skips the hallucination evaluator when no CRM writes are present", async () => {
    const events = [
      customToolUseEvent("ctu_1", "search_crm", { entity: "contacts" }),
      customToolResultEvent("ctr_1", "ctu_1", { success: true, records: [] }),
    ];
    await runEvaluatorsForEvents(events, "run_3", {} as never, {
      conversationInput: [],
    });
    expect(
      writeRunScore.mock.calls.some(
        ([, , score]) => score.evaluator_name === "crm-data-grounded",
      ),
    ).toBe(false);
  });
});
