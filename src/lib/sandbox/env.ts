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
 * Returns whether Sprite-backed sandbox tooling is configured for this runtime.
 */
export function isSandboxConfigured(): boolean {
  return getSpritesToken() !== null;
}
