/**
 * Launch-set provider slugs accepted by the connection-management tools.
 *
 * The canonical values must match Composio's toolkit slugs. A tiny alias map
 * keeps the agent resilient to common user-facing naming variants while we
 * transition the prompt and tests.
 *
 * @module lib/managed-agents/tools/supported-providers
 */
export const SUPPORTED_PROVIDERS = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "notion",
] as const;

export type SupportedProviderSlug = (typeof SUPPORTED_PROVIDERS)[number];

export const SUPPORTED_PROVIDER_DISPLAY_NAMES: Record<
  SupportedProviderSlug,
  string
> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  notion: "Notion",
};

export const SUPPORTED_PROVIDER_DESCRIPTIONS: Record<
  SupportedProviderSlug,
  string
> = {
  gmail: "Read, search, and send messages in your Gmail.",
  googlecalendar: "See your schedule and create events in your calendar.",
  googledrive: "Find, read, and manage files in your Drive.",
  notion: "Read and update pages and databases in your Notion workspace.",
};

export const SUPPORTED_PROVIDER_LOGO_URLS: Record<
  SupportedProviderSlug,
  string
> = {
  gmail: "/logos/gmail.svg",
  googlecalendar: "/logos/google-calendar.svg",
  googledrive: "/logos/drive.svg",
  notion: "/logos/notion.svg",
};

export const SUPPORTED_PROVIDER_NAMES_FOR_PROMPT = Object.values(
  SUPPORTED_PROVIDER_DISPLAY_NAMES,
).join(", ");

export interface SupportedProviderBranding {
  integrationId: SupportedProviderSlug;
  displayName: string;
  description: string;
  logoUrl: string;
}

/** Returns whether the provided slug is already one of the canonical launch slugs. */
export function isSupportedProvider(slug: string): slug is SupportedProviderSlug {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(slug);
}

/** Returns a human-readable provider name when the slug is supported. */
export function getSupportedProviderDisplayName(slug: string): string {
  const normalizedSlug = normalizeSupportedProviderSlug(slug);

  if (!normalizedSlug) {
    return slug;
  }

  return SUPPORTED_PROVIDER_DISPLAY_NAMES[normalizedSlug];
}

/** Returns a short, user-facing description of what the provider unlocks. */
export function getSupportedProviderDescription(slug: string): string {
  const normalizedSlug = normalizeSupportedProviderSlug(slug);

  if (!normalizedSlug) {
    return "";
  }

  return SUPPORTED_PROVIDER_DESCRIPTIONS[normalizedSlug];
}

/** Returns launch-set branding that can be rendered without any remote lookup. */
export function getSupportedProviderBranding(slug: string): SupportedProviderBranding | null {
  const normalizedSlug = normalizeSupportedProviderSlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  return {
    integrationId: normalizedSlug,
    displayName: SUPPORTED_PROVIDER_DISPLAY_NAMES[normalizedSlug],
    description: SUPPORTED_PROVIDER_DESCRIPTIONS[normalizedSlug],
    logoUrl: SUPPORTED_PROVIDER_LOGO_URLS[normalizedSlug],
  };
}

/**
 * Normalizes a user/model supplied slug into a canonical supported provider.
 * Returns `null` when the provider is outside the launch set.
 */
export function normalizeSupportedProviderSlug(
  slug: string,
): SupportedProviderSlug | null {
  const normalizedSlug = slug.trim().toLowerCase();
  const collapsedSlug = normalizedSlug.replace(/[\s_-]+/g, "");

  if (isSupportedProvider(normalizedSlug)) {
    return normalizedSlug;
  }

  if (isSupportedProvider(collapsedSlug)) {
    return collapsedSlug;
  }

  return null;
}
