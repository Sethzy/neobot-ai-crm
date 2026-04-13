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
  getModelTokenPricing,
  SESSION_RUNTIME_PER_HOUR,
} from "../adapter-cost";

describe("accumulateModelUsage", () => {
  it("sums input/output tokens across multiple model_request_end events", () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    accumulateModelUsage(usage, {
      model_usage: { input_tokens: 100, output_tokens: 50 },
    });
    accumulateModelUsage(usage, {
      model_usage: { input_tokens: 200, output_tokens: 75 },
    });
    expect(usage).toEqual({
      inputTokens: 300,
      outputTokens: 125,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });

  it("accumulates cache_read and cache_creation tokens", () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    accumulateModelUsage(usage, {
      model_usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    accumulateModelUsage(usage, {
      model_usage: {
        input_tokens: 1500,
        output_tokens: 200,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 0,
      },
    });
    expect(usage).toEqual({
      inputTokens: 2500,
      outputTokens: 300,
      cacheReadInputTokens: 800,
      cacheCreationInputTokens: 0,
    });
  });

  it("tolerates missing model_usage", () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    accumulateModelUsage(usage, {});
    expect(usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });
});

describe("computeTurnCost", () => {
  it("computes token + runtime cost with no cache hits", () => {
    const cost = computeTurnCost({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      activeSeconds: 3600,
    });
    // Uncached input: 1M * $3 / 1M = $3
    // Output: 500k * $15 / 1M = $7.50
    // Runtime: 3600s / 3600 * $0.08 = $0.08
    // Total $10.58
    expect(cost).toBeCloseTo(10.58, 2);
  });

  it("discounts cache_read tokens at $0.30/M and overcharges cache_creation at $3.75/M", () => {
    // input_tokens is the *total* — cache fields are subsets per Anthropic.
    // So uncached = input_tokens - cache_read - cache_creation.
    const cost = computeTurnCost({
      inputTokens: 2_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000, // costs $0.30
      cacheCreationInputTokens: 500_000, // costs $1.875
      activeSeconds: 0,
    });
    // uncached = 2_000_000 - 1_000_000 - 500_000 = 500_000
    // uncached × $3 / 1M = $1.50
    // cache_read × $0.30 / 1M = $0.30
    // cache_creation × $3.75 / 1M = $1.875
    // Total = $3.675
    expect(cost).toBeCloseTo(3.675, 3);
  });

  it("returns zero for a zero-work turn", () => {
    expect(
      computeTurnCost({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        activeSeconds: 0,
      }),
    ).toBe(0);
  });

  it("returns correct pricing for each model", () => {
    expect(getModelTokenPricing("claude-sonnet-4-6")).toMatchObject({ inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheCreationPerM: 3.75 });
    expect(getModelTokenPricing("claude-haiku-4-5")).toMatchObject({ inputPerM: 1, outputPerM: 5, cacheReadPerM: 0.1, cacheCreationPerM: 1.25 });
    expect(getModelTokenPricing("claude-opus-4-6")).toMatchObject({ inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheCreationPerM: 6.25 });
    expect(SESSION_RUNTIME_PER_HOUR).toBe(0.08);
  });
});
