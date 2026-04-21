/**
 * Helpers for temporary Composio auth-link state stored on connection rows.
 * @module lib/connections/auth-link
 */

/**
 * Normalizes a persisted auth-link expiry string into a unix timestamp.
 */
export function parseAuthRedirectExpiry(
  expiresAt: string | null | undefined,
): number | null {
  if (!expiresAt) {
    return null;
  }

  const parsedTimestamp = Date.parse(expiresAt);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
}

/**
 * Returns true when a temporary auth link has reached or passed its expiry.
 */
export function isAuthRedirectExpired(
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  const expiryTimestamp = parseAuthRedirectExpiry(expiresAt);

  return expiryTimestamp !== null && expiryTimestamp <= now;
}

/**
 * Returns true when a persisted auth-link row still has a usable Composio
 * redirect URL and Composio has not marked it expired yet.
 */
export function hasLiveAuthRedirect(
  redirectUrl: string | null | undefined,
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  const trimmedRedirectUrl = redirectUrl?.trim() ?? "";

  return trimmedRedirectUrl.length > 0 && !isAuthRedirectExpired(expiresAt, now);
}
