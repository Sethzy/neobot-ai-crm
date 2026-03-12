/**
 * Shared PostHog context helpers for environment tagging and internal-traffic filtering.
 * @module lib/analytics/posthog-context
 */

export type AnalyticsEnvironment = "development" | "preview" | "production";

const INTERNAL_EMAIL_DOMAINS_ENV_KEYS = [
  "NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS",
  "POSTHOG_INTERNAL_EMAIL_DOMAINS",
] as const;

const ANALYTICS_ENVIRONMENT_ENV_KEYS = [
  "NEXT_PUBLIC_POSTHOG_ENVIRONMENT",
  "NEXT_PUBLIC_VERCEL_ENV",
  "VERCEL_ENV",
] as const;

function getConfiguredEnvironment(): string | null {
  for (const envKey of ANALYTICS_ENVIRONMENT_ENV_KEYS) {
    const value = process.env[envKey]?.trim();

    if (value) {
      return value.toLowerCase();
    }
  }

  return null;
}

/**
 * Resolves the analytics environment in a way that works on both the server and
 * the browser bundle. Preview builds need an explicit public env var if the
 * client should distinguish them from production.
 */
export function getAnalyticsEnvironment(): AnalyticsEnvironment {
  const configuredEnvironment = getConfiguredEnvironment();

  if (configuredEnvironment === "production") {
    return "production";
  }

  if (configuredEnvironment === "preview") {
    return "preview";
  }

  if (configuredEnvironment === "development") {
    return "development";
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();

    if (
      hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "[::1]"
    ) {
      return "development";
    }
  }

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function getConfiguredInternalDomains(): string[] {
  for (const envKey of INTERNAL_EMAIL_DOMAINS_ENV_KEYS) {
    const rawValue = process.env[envKey]?.trim();

    if (!rawValue) {
      continue;
    }

    return rawValue
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
  }

  return [];
}

/**
 * Checks whether an email belongs to a configured internal company domain.
 * Subdomains are treated as internal too so aliases like `team.ops.example.com`
 * do not need separate configuration.
 */
export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const [, rawDomain = ""] = email.toLowerCase().split("@");
  const normalizedDomain = rawDomain.trim();

  if (!normalizedDomain) {
    return false;
  }

  return getConfiguredInternalDomains().some((internalDomain) =>
    normalizedDomain === internalDomain
    || normalizedDomain.endsWith(`.${internalDomain}`)
  );
}

/**
 * Returns the standard analytics properties used to filter non-production and
 * internal team traffic out of product dashboards.
 */
export function buildAnalyticsContext(input?: {
  email?: string | null;
}): {
  environment: AnalyticsEnvironment;
  is_internal: boolean;
} {
  const environment = getAnalyticsEnvironment();

  return {
    environment,
    is_internal: environment !== "production" || isInternalEmail(input?.email),
  };
}
