/**
 * Shared Apify environment helpers.
 * @module lib/apify/env
 */

/**
 * Returns the configured Apify token, or null when Apify is unavailable.
 */
export function getApifyToken(): string | null {
  const token = process.env.APIFY_TOKEN?.trim();

  return token && token.length > 0 ? token : null;
}

/**
 * Returns whether Apify-backed tooling is configured for this runtime.
 */
export function isApifyConfigured(): boolean {
  return getApifyToken() !== null;
}
