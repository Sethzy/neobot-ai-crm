/**
 * Unit tests for the pure LLM cost calculation utility.
 * @module lib/ai/__tests__/cost.test
 */
import { describe, expect, it } from "vitest";

import { computeRunCost, type TokenUsageForCost } from "@/lib/ai/cost";
import type { ModelPricing } from "@/lib/ai/models";

// Sonnet 4.6 pricing — mirrors the constants in
// `src/lib/managed-agents/adapter-cost.ts`. `computeRunCost` now has
// only helper-call callers (e.g. AI-SDK eval scripts); the main chat
// adapter computes its own Anthropic-shaped cost via `computeTurnCost`.
const sonnet: ModelPricing = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3 };

describe("computeRunCost", () => {
  it("computes cost with no cache (all input is fresh)", () => {
    const usage: TokenUsageForCost = { inputTokens: 10_000, outputTokens: 500 };
    const cost = computeRunCost(usage, sonnet);
    // (10000/1M)*3 + (500/1M)*15 = 0.03 + 0.0075 = 0.0375
    expect(cost).toBe(0.0375);
  });

  it("computes cost with partial cache hit", () => {
    const usage: TokenUsageForCost = {
      inputTokens: 30_000,
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 25_000 },
    };
    const cost = computeRunCost(usage, sonnet);
    // fresh = 30000 - 25000 = 5000
    // (5000/1M)*3 + (25000/1M)*0.3 + (200/1M)*15
    // = 0.015 + 0.0075 + 0.003 = 0.0255
    expect(cost).toBe(0.0255);
  });

  it("computes cost with full cache hit", () => {
    const usage: TokenUsageForCost = {
      inputTokens: 20_000,
      outputTokens: 100,
      inputTokenDetails: { cacheReadTokens: 20_000 },
    };
    const cost = computeRunCost(usage, sonnet);
    // fresh = 0, all cached
    // (0)*3 + (20000/1M)*0.3 + (100/1M)*15
    // = 0 + 0.006 + 0.0015 = 0.0075
    expect(cost).toBe(0.0075);
  });

  it("returns 0 for zero tokens", () => {
    expect(computeRunCost({}, sonnet)).toBe(0);
    expect(computeRunCost({ inputTokens: 0, outputTokens: 0 }, sonnet)).toBe(0);
  });

  it("handles undefined inputTokenDetails gracefully", () => {
    const usage: TokenUsageForCost = { inputTokens: 1000, outputTokens: 100 };
    const cost = computeRunCost(usage, sonnet);
    // (1000/1M)*3 + (100/1M)*15 = 0.003 + 0.0015 = 0.0045
    expect(cost).toBe(0.0045);
  });

  it("rounds to 6 decimal places", () => {
    const usage: TokenUsageForCost = { inputTokens: 1, outputTokens: 1 };
    const cost = computeRunCost(usage, sonnet);
    // (1/1M)*3 + (1/1M)*15 = 0.000003 + 0.000015 = 0.000018
    expect(cost).toBe(0.000018);
  });
});
