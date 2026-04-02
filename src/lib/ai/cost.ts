/**
 * Pure cost calculation from AI SDK token usage and model pricing.
 * @module lib/ai/cost
 */
import type { ModelPricing } from "./models";

export interface TokenUsageForCost {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
  };
}

/**
 * Computes run cost in USD from token usage and model pricing.
 *
 * AI SDK's `inputTokens` is the total input count (cached + non-cached).
 * `inputTokenDetails.cacheReadTokens` is the cached subset, billed at the
 * lower cache-read rate. The remainder is billed at the full input rate.
 */
export function computeRunCost(
  usage: TokenUsageForCost,
  pricing: ModelPricing,
): number {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const nonCachedInput = Math.max(0, inputTokens - cacheReadTokens);

  const cost =
    (nonCachedInput / 1_000_000) * pricing.inputPerM +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPerM +
    (outputTokens / 1_000_000) * pricing.outputPerM;

  return Math.round(cost * 1_000_000) / 1_000_000;
}
