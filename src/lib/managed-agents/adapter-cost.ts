/**
 * Token + runtime cost math for Managed Agents turns.
 *
 * Single source of truth for the chat adapter and the trigger task — both
 * import the same constants so per-turn cost stays consistent across the
 * two entry points.
 *
 * Per-model pricing (verify against Anthropic pricing page on changes):
 *
 * | Model       | Input $/M | Cache-write $/M | Cache-read $/M | Output $/M |
 * |-------------|-----------|-----------------|----------------|------------|
 * | Sonnet 4.6  |      3.00 |            3.75 |           0.30 |      15.00 |
 * | Haiku 4.5   |      1.00 |            1.25 |           0.10 |       5.00 |
 * | Opus 4.6    |      5.00 |            6.25 |           0.50 |      25.00 |
 *
 * Cache accounting note: Anthropic exposes `input_tokens` as the *total*
 * input on a request. `cache_read_input_tokens` and
 * `cache_creation_input_tokens` are *subsets* — the uncached portion is
 * `input_tokens - cache_read_input_tokens - cache_creation_input_tokens`.
 *
 * @module lib/managed-agents/adapter-cost
 */

/** Per-model pricing in USD per million tokens. */
export interface ModelTokenPricing {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheCreationPerM: number;
}

const SONNET_PRICING: ModelTokenPricing = {
  inputPerM: 3,
  outputPerM: 15,
  cacheReadPerM: 0.3,
  cacheCreationPerM: 3.75,
};

const HAIKU_PRICING: ModelTokenPricing = {
  inputPerM: 1,
  outputPerM: 5,
  cacheReadPerM: 0.1,
  cacheCreationPerM: 1.25,
};

const OPUS_PRICING: ModelTokenPricing = {
  inputPerM: 5,
  outputPerM: 25,
  cacheReadPerM: 0.5,
  cacheCreationPerM: 6.25,
};

const PRICING_BY_MODEL: Record<string, ModelTokenPricing> = {
  "claude-sonnet-4-6": SONNET_PRICING,
  "claude-haiku-4-5": HAIKU_PRICING,
  "claude-opus-4-6": OPUS_PRICING,
};

/** Resolve pricing for a model. Falls back to Sonnet if unknown. */
export function getModelTokenPricing(
  anthropicModelId: string,
): ModelTokenPricing {
  return PRICING_BY_MODEL[anthropicModelId] ?? SONNET_PRICING;
}

/** Anthropic Managed Agents session-runtime billing in USD per active hour. */
export const SESSION_RUNTIME_PER_HOUR = 0.08;

export interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface TurnCostInput {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  activeSeconds: number;
  /** Anthropic model ID for pricing lookup. Defaults to Sonnet. */
  anthropicModelId?: string;
}

/** Initial usage shape — exported so callers don't have to remember the four fields. */
export function emptyUsage(): AccumulatedUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
}

/**
 * Folds an Anthropic `span.model_request_end` event's `model_usage` into
 * the running totals. Tolerates missing model_usage and missing cache
 * fields so callers don't need to branch on event shape.
 */
export function accumulateModelUsage(
  usage: AccumulatedUsage,
  event: {
    model_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  },
): void {
  if (!event.model_usage) return;
  usage.inputTokens += event.model_usage.input_tokens ?? 0;
  usage.outputTokens += event.model_usage.output_tokens ?? 0;
  usage.cacheReadInputTokens += event.model_usage.cache_read_input_tokens ?? 0;
  usage.cacheCreationInputTokens += event.model_usage.cache_creation_input_tokens ?? 0;
}

/**
 * Computes a per-turn dollar cost from accumulated tokens and elapsed
 * session-runtime seconds. Splits input into uncached / cache-read /
 * cache-creation buckets per Anthropic's pricing model. When
 * `anthropicModelId` is provided, uses that model's pricing; otherwise
 * falls back to Sonnet.
 */
export function computeTurnCost(input: TurnCostInput): number {
  const pricing = getModelTokenPricing(input.anthropicModelId ?? "claude-sonnet-4-6");
  const uncachedInput = Math.max(
    0,
    input.inputTokens - input.cacheReadInputTokens - input.cacheCreationInputTokens,
  );
  const tokenCost =
    (uncachedInput * pricing.inputPerM +
      input.cacheReadInputTokens * pricing.cacheReadPerM +
      input.cacheCreationInputTokens * pricing.cacheCreationPerM +
      input.outputTokens * pricing.outputPerM) /
    1_000_000;
  const runtimeCost = (input.activeSeconds / 3600) * SESSION_RUNTIME_PER_HOUR;
  return tokenCost + runtimeCost;
}
