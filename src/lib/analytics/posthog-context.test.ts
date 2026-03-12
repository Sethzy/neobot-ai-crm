/**
 * Tests for shared PostHog environment and internal-traffic helpers.
 * @module lib/analytics/posthog-context.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsContext,
  getAnalyticsEnvironment,
  isInternalEmail,
} from "./posthog-context";

const originalNodeEnv = process.env.NODE_ENV;

describe("posthog-context", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("prefers explicit PostHog environment overrides", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "preview");
    process.env.NODE_ENV = "production";

    expect(getAnalyticsEnvironment()).toBe("preview");
  });

  it("falls back to server runtime environment when no PostHog override is configured", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    process.env.NODE_ENV = "production";

    expect(getAnalyticsEnvironment()).toBe("production");
  });

  it("treats configured internal domains and subdomains as internal", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS", "sunder.com,team.sunder.com");

    expect(isInternalEmail("seth@sunder.com")).toBe(true);
    expect(isInternalEmail("ops@asia.team.sunder.com")).toBe(true);
    expect(isInternalEmail("agent@example.com")).toBe(false);
  });

  it("marks non-production environments as internal even without a matching email domain", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "preview");

    expect(
      buildAnalyticsContext({
        email: "agent@example.com",
      }),
    ).toEqual({
      environment: "preview",
      is_internal: true,
    });
  });

  it("marks production users internal only when their email matches a configured domain", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS", "sunder.com");

    expect(
      buildAnalyticsContext({
        email: "founder@sunder.com",
      }),
    ).toEqual({
      environment: "production",
      is_internal: true,
    });

    expect(
      buildAnalyticsContext({
        email: "agent@example.com",
      }),
    ).toEqual({
      environment: "production",
      is_internal: false,
    });
  });
});
