/**
 * Unit tests for the pure LLM cost calculation utility.
 * @module lib/ai/__tests__/cost.test
 */
import { describe, expect, it } from "vitest";

import { computeRunCost, type TokenUsageForCost } from "@/lib/ai/cost";
import type { ModelPricing } from "@/lib/ai/models";

const minimax: ModelPricing = { inputPerM: 0.30, outputPerM: 1.20, cacheReadPerM: 0.06 };
const gemini: ModelPricing = { inputPerM: 0.50, outputPerM: 3.00, cacheReadPerM: 0.125 };

describe("computeRunCost", () => {
  it("computes cost with no cache (all input is fresh)", () => {
    const usage: TokenUsageForCost = { inputTokens: 10_000, outputTokens: 500 };
    const cost = computeRunCost(usage, minimax);
    // (10000/1M)*0.30 + (500/1M)*1.20 = 0.003 + 0.0006 = 0.0036
    expect(cost).toBe(0.0036);
  });

  it("computes cost with partial cache hit", () => {
    const usage: TokenUsageForCost = {
      inputTokens: 30_000,
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 25_000 },
    };
    const cost = computeRunCost(usage, minimax);
    // fresh = 30000 - 25000 = 5000
    // (5000/1M)*0.30 + (25000/1M)*0.06 + (200/1M)*1.20
    // = 0.0015 + 0.0015 + 0.00024 = 0.00324
    expect(cost).toBe(0.00324);
  });

  it("computes cost with full cache hit", () => {
    const usage: TokenUsageForCost = {
      inputTokens: 20_000,
      outputTokens: 100,
      inputTokenDetails: { cacheReadTokens: 20_000 },
    };
    const cost = computeRunCost(usage, minimax);
    // fresh = 0, all cached
    // (0)*0.30 + (20000/1M)*0.06 + (100/1M)*1.20
    // = 0 + 0.0012 + 0.00012 = 0.00132
    expect(cost).toBe(0.00132);
  });

  it("returns 0 for zero tokens", () => {
    expect(computeRunCost({}, minimax)).toBe(0);
    expect(computeRunCost({ inputTokens: 0, outputTokens: 0 }, minimax)).toBe(0);
  });

  it("handles undefined inputTokenDetails gracefully", () => {
    const usage: TokenUsageForCost = { inputTokens: 1000, outputTokens: 100 };
    const cost = computeRunCost(usage, gemini);
    // (1000/1M)*0.50 + (100/1M)*3.00 = 0.0005 + 0.0003 = 0.0008
    expect(cost).toBe(0.0008);
  });

  it("matches Vercel Gateway billing for a real MiniMax generation", () => {
    // From thread b9d126ef, step 7 of Run 2:
    // Vercel: Input=7.3K, Cache Read=28K, Total=$0.0041
    const usage: TokenUsageForCost = {
      inputTokens: 35_324, // total = 7310 fresh + 28014 cached
      outputTokens: 173,
      inputTokenDetails: { cacheReadTokens: 28_014 },
    };
    const cost = computeRunCost(usage, minimax);
    // fresh = 35324 - 28014 = 7310
    // (7310/1M)*0.30 + (28014/1M)*0.06 + (173/1M)*1.20
    // = 0.002193 + 0.001681 + 0.000208 = 0.004082
    expect(cost).toBeCloseTo(0.0041, 3);
  });

  it("rounds to 6 decimal places", () => {
    const usage: TokenUsageForCost = { inputTokens: 1, outputTokens: 1 };
    const cost = computeRunCost(usage, minimax);
    // (1/1M)*0.30 + (1/1M)*1.20 = 0.0000003 + 0.0000012 = 0.0000015
    expect(cost).toBe(0.000002); // rounded to 6dp
  });
});
