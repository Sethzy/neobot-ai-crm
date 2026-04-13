/**
 * @fileoverview Central AI Gateway access for Sunder's runtime model calls.
 */

import { createGateway } from "@ai-sdk/gateway";
import type { JSONValue } from "ai";

/**
 * Tier-1 model for AI-SDK helper calls that still go through the Vercel
 * Gateway — today that's a small set of AI-SDK helper calls and eval scripts.
 * This is deliberately NOT the main chat model:
 *
 * - Main chat runs on Anthropic Managed Agents (Sonnet 4.6), pinned by
 *   `ANTHROPIC_AGENT_VERSION`. See `src/lib/managed-agents/adapter.ts`.
 * - Helper calls that do not need Sonnet quality should stay on cheap
 *   Gemini models to avoid wasted spend.
 *
 * If you want to change what runs in the chat surface, update
 * `scripts/managed-agents/create-agent.ts` and re-run it, not this file.
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
