/**
 * Shared sandbox environment helpers.
 * @module lib/sandbox/env
 */

/**
 * Returns the configured Sprites API token, or null when sandbox execution is unavailable.
 */
export function getSpritesToken(): string | null {
  const token = process.env.SPRITES_TOKEN?.trim();

  return token && token.length > 0 ? token : null;
}

/**
 * Returns the configured Anthropic API key, or null when Claude CLI cannot run.
 */
export function getSandboxAnthropicApiKey(): string | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  return apiKey && apiKey.length > 0 ? apiKey : null;
}

/**
 * Returns whether Sprite-backed sandbox tooling is configured for this runtime.
 */
export function isSandboxConfigured(): boolean {
  return getSpritesToken() !== null && getSandboxAnthropicApiKey() !== null;
}
