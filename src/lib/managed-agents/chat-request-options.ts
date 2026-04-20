/**
 * Interactive chat-path request budgets for Anthropic Managed Agents.
 *
 * Keep these scoped to the user-facing chat turn path. Background jobs and
 * automations can choose different retry/timeout policies.
 *
 * @module lib/managed-agents/chat-request-options
 */

export const CHAT_ANTHROPIC_TIMEOUT_MS = 2_500;
export const CHAT_ANTHROPIC_SESSION_CREATE_TIMEOUT_MS = 5_000;

export const CHAT_ANTHROPIC_REQUEST_OPTIONS = {
  timeout: CHAT_ANTHROPIC_TIMEOUT_MS,
  maxRetries: 0,
} as const;

export const CHAT_ANTHROPIC_SESSION_CREATE_REQUEST_OPTIONS = {
  timeout: CHAT_ANTHROPIC_SESSION_CREATE_TIMEOUT_MS,
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
