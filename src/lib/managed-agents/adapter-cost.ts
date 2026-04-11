/**
 * Token + runtime cost math for Managed Agents turns.
 *
 * Single source of truth for the chat adapter and the trigger task — both
 * import the same constants so per-turn cost stays consistent across the
 * two entry points.
 *
 * Pricing (Sonnet 4.6, verify against Anthropic pricing page on changes):
 *   - Uncached input: $3 / M
 *   - Cache write (5-minute TTL): $3.75 / M
 *   - Cache read: $0.30 / M
 *   - Output: $15 / M
 *   - Session runtime: $0.08 / hour
 *
 * Cache accounting note: Anthropic exposes `input_tokens` as the *total*
 * input on a request. `cache_read_input_tokens` and
 * `cache_creation_input_tokens` are *subsets* — the uncached portion is
 * `input_tokens - cache_read_input_tokens - cache_creation_input_tokens`.
 *
 * @module lib/managed-agents/adapter-cost
 */

/** USD per million uncached input tokens. */
export const SONNET_INPUT_PER_M = 3;
/** USD per million output tokens. */
export const SONNET_OUTPUT_PER_M = 15;
/** USD per million cache-read input tokens (~10% of uncached). */
export const CACHE_READ_PER_M = 0.3;
/** USD per million cache-creation input tokens (~125% of uncached). */
export const CACHE_CREATION_PER_M = 3.75;
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
 * cache-creation buckets per Anthropic's pricing model.
 */
export function computeTurnCost(input: TurnCostInput): number {
  const uncachedInput = Math.max(
    0,
    input.inputTokens - input.cacheReadInputTokens - input.cacheCreationInputTokens,
  );
  const tokenCost =
    (uncachedInput * SONNET_INPUT_PER_M +
      input.cacheReadInputTokens * CACHE_READ_PER_M +
      input.cacheCreationInputTokens * CACHE_CREATION_PER_M +
      input.outputTokens * SONNET_OUTPUT_PER_M) /
    1_000_000;
  const runtimeCost = (input.activeSeconds / 3600) * SESSION_RUNTIME_PER_HOUR;
  return tokenCost + runtimeCost;
}
