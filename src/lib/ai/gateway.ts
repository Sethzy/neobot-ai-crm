/**
 * @fileoverview Central AI Gateway access for Sunder's runtime model calls.
 */

import { createGateway } from "@ai-sdk/gateway";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

/**
 * Tier-1 model used for interactive chat and tool-calling runs.
 * This follows the approved LLM-05 decision.
 */
export const TIER_1_MODEL = "google/gemini-3-flash";

/**
 * Cheap, fast model used for background summarization tasks (thread compaction).
 * Gemini 2.5 Flash-Lite is significantly cheaper than Tier 1 and sufficient for
 * summarization — compaction does not need tool-calling or complex reasoning.
 */
export const COMPACTION_MODEL = "google/gemini-2.5-flash-lite";

/**
 * Shared Vercel AI Gateway instance.
 * Call as `gateway("provider/model-id")` when invoking AI SDK methods.
 */
export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

/**
 * BYOK provider options — routes requests through the gateway but bills to
 * our own Gemini API key instead of consuming Vercel AI Gateway credits.
 * Spread into every `streamText` / `generateText` call's options.
 */
export const gatewayProviderOptions: { gateway: GatewayProviderOptions } | undefined =
  process.env.GEMINI_API_KEY
    ? {
        gateway: {
          byok: {
            google: [{ apiKey: process.env.GEMINI_API_KEY }],
          },
        } satisfies GatewayProviderOptions,
      }
    : undefined;
