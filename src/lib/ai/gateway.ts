/**
 * @fileoverview Central AI Gateway access for Sunder's runtime model calls.
 */

import { createGateway } from "@ai-sdk/gateway";

/**
 * Tier-1 model used for simple interactive chat in PR1.
 * This follows the approved LLM-05 decision.
 */
export const TIER_1_MODEL = "google/gemini-3-flash";

/**
 * Shared Vercel AI Gateway instance.
 * Call as `gateway("provider/model-id")` when invoking AI SDK methods.
 */
export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
