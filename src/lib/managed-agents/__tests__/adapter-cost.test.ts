/**
 * @module lib/managed-agents/__tests__/adapter-cost.test
 *
 * Tests for the per-turn cost math helpers shared by the chat adapter and
 * trigger task. These need to be deterministic and side-effect free.
 */
import { describe, it, expect } from "vitest";

import {
  accumulateModelUsage,
  computeTurnCost,
  SESSION_RUNTIME_PER_HOUR,
  SONNET_INPUT_PER_M,
  SONNET_OUTPUT_PER_M,
} from "../adapter-cost";

describe("accumulateModelUsage", () => {
  it("sums input/output tokens across multiple model_request_end events", () => {
    const usage = { inputTokens: 0, outputTokens: 0 };
    accumulateModelUsage(usage, {
      model_usage: { input_tokens: 100, output_tokens: 50 },
    });
    accumulateModelUsage(usage, {
      model_usage: { input_tokens: 200, output_tokens: 75 },
    });
    expect(usage).toEqual({ inputTokens: 300, outputTokens: 125 });
  });

  it("tolerates missing model_usage", () => {
    const usage = { inputTokens: 10, outputTokens: 5 };
    accumulateModelUsage(usage, {});
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe("computeTurnCost", () => {
  it("computes token + runtime cost", () => {
    const cost = computeTurnCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      activeSeconds: 3600,
    });
    // 1M * $3 / 1M = $3 input
    // 500k * $15 / 1M = $7.50 output
    // 3600s / 3600 * $0.08 = $0.08 runtime
    // Total $10.58
    expect(cost).toBeCloseTo(10.58, 2);
  });

  it("returns zero for a zero-work turn", () => {
    expect(
      computeTurnCost({ inputTokens: 0, outputTokens: 0, activeSeconds: 0 }),
    ).toBe(0);
  });

  it("exposes pricing constants", () => {
    expect(SONNET_INPUT_PER_M).toBe(3);
    expect(SONNET_OUTPUT_PER_M).toBe(15);
    expect(SESSION_RUNTIME_PER_HOUR).toBe(0.08);
  });
});
