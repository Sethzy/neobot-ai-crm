/**
 * @fileoverview Central AI Gateway access for Sunder's runtime model calls.
 */

import { createGateway } from "@ai-sdk/gateway";
import type { JSONValue } from "ai";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";

/**
 * Tier-1 model used for interactive chat and tool-calling runs.
 * This follows the approved LLM-05 decision.
 */
export const TIER_1_MODEL = DEFAULT_CHAT_MODEL;

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
 * Shared language-model lookup used by runtime callsites that accept a dynamic model ID.
 * v1 does not wrap reasoning models; the selected ID is forwarded directly.
 */
export function getLanguageModel(modelId: string) {
  return gateway.languageModel(modelId);
}

/**
 * Gateway provider options shared across runtime calls.
 * Automatic caching must always be enabled so explicit-cache providers like
 * MiniMax receive cache markers, while Google BYOK remains optional.
 */
export const gatewayProviderOptions:
  Record<string, Record<string, JSONValue>> = {
    gateway: {
      caching: "auto",
      ...(process.env.GEMINI_API_KEY
        ? {
            byok: {
              google: [{ apiKey: process.env.GEMINI_API_KEY }],
            },
          }
        : {}),
    } as Record<string, JSONValue>,
  } as Record<string, Record<string, JSONValue>>;
