/**
 * Token + runtime cost math for Managed Agents turns.
 *
 * Single source of truth for the chat adapter and the trigger task — both
 * import the same constants so per-turn cost stays consistent across the
 * two entry points.
 *
 * @module lib/managed-agents/adapter-cost
 */

/** USD per million input tokens for the default Sonnet tier. */
export const SONNET_INPUT_PER_M = 3;
/** USD per million output tokens for the default Sonnet tier. */
export const SONNET_OUTPUT_PER_M = 15;
/** Anthropic Managed Agents session-runtime billing in USD per active hour. */
export const SESSION_RUNTIME_PER_HOUR = 0.08;

export interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TurnCostInput {
  inputTokens: number;
  outputTokens: number;
  activeSeconds: number;
}

/**
 * Folds an Anthropic `span.model_request_end` event's `model_usage` into the
 * running totals. Tolerates missing model_usage so callers don't need to
 * branch on event shape.
 */
export function accumulateModelUsage(
  usage: AccumulatedUsage,
  event: { model_usage?: { input_tokens?: number; output_tokens?: number } },
): void {
  if (!event.model_usage) return;
  usage.inputTokens += event.model_usage.input_tokens ?? 0;
  usage.outputTokens += event.model_usage.output_tokens ?? 0;
}

/**
 * Computes a per-turn dollar cost from accumulated tokens and elapsed
 * session-runtime seconds.
 */
export function computeTurnCost(input: TurnCostInput): number {
  const tokenCost =
    (input.inputTokens * SONNET_INPUT_PER_M +
      input.outputTokens * SONNET_OUTPUT_PER_M) /
    1_000_000;
  const runtimeCost = (input.activeSeconds / 3600) * SESSION_RUNTIME_PER_HOUR;
  return tokenCost + runtimeCost;
}
