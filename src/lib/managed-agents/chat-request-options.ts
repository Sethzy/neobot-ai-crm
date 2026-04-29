/**
 * Interactive chat-path request options for Anthropic Managed Agents.
 *
 * Streaming chat is interactive — retries belong at the user-experience layer,
 * not buried in the SDK. We keep `maxRetries: 0` and rely on the platform's
 * function timeout (Vercel `maxDuration`) for the upper bound, instead of a
 * hardcoded per-request budget that's hostile to slow dev networks.
 *
 * @module lib/managed-agents/chat-request-options
 */

export const CHAT_ANTHROPIC_REQUEST_OPTIONS = {
  maxRetries: 0,
} as const;

export const CHAT_ANTHROPIC_SESSION_CREATE_REQUEST_OPTIONS = {
  maxRetries: 0,
} as const;

export function buildChatAnthropicRequestOptions(signal?: AbortSignal) {
  return signal
    ? {
        ...CHAT_ANTHROPIC_REQUEST_OPTIONS,
        signal,
      }
    : {
        ...CHAT_ANTHROPIC_REQUEST_OPTIONS,
      };
}
