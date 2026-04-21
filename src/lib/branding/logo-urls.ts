/**
 * Public logo URL builders for SaaS-style brand rendering.
 * Prefers a free production logo source when configured, and falls back to a
 * zero-config favicon service so UI surfaces never regress to broken images.
 *
 * @module lib/branding/logo-urls
 */

/**
 * Extracts a bare domain from a URL or domain-like string.
 * Returns `null` when the input cannot produce a usable host.
 */
export function normalizeLogoDomain(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const host = new URL(withProtocol).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Builds a free Brandfetch logo URL when a public client ID is configured.
 * Brandfetch Logo API is hotlink-only, so callers should use the URL directly
 * in an `<img>` tag rather than proxying or downloading it server-side.
 */
export function getBrandfetchLogoUrl(
  value: string | null | undefined,
  clientId = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID?.trim() ?? "",
): string | null {
  const normalizedDomain = normalizeLogoDomain(value);

  if (!normalizedDomain || !clientId) {
    return null;
  }

  return `https://cdn.brandfetch.io/${encodeURIComponent(normalizedDomain)}?c=${encodeURIComponent(clientId)}`;
}

/**
 * Builds a Google favicon URL as a zero-config fallback when no richer brand
 * source is configured.
 */
export function getGoogleFaviconUrl(
  value: string | null | undefined,
  size = 64,
): string | null {
  const normalizedDomain = normalizeLogoDomain(value);

  if (!normalizedDomain) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(normalizedDomain)}&sz=${size}`;
}

/**
 * Returns the best available public logo URL for a company-like domain.
 * Brandfetch wins when configured; otherwise favicon fallback keeps the UI
 * recognizable without extra setup.
 */
export function getCompanyLogoUrl(
  value: string | null | undefined,
): string | null {
  return getBrandfetchLogoUrl(value) ?? getGoogleFaviconUrl(value);
}
