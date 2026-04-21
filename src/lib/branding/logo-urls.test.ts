/**
 * Tests public logo URL builders and fallback behavior.
 *
 * @module lib/branding/logo-urls.test
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBrandfetchLogoUrl,
  getCompanyLogoUrl,
  getGoogleFaviconUrl,
  normalizeLogoDomain,
} from "@/lib/branding/logo-urls";

describe("logo url builders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes full urls and bare domains", () => {
    expect(normalizeLogoDomain("https://www.intercom.com/pricing")).toBe("intercom.com");
    expect(normalizeLogoDomain("airbnb.com")).toBe("airbnb.com");
    expect(normalizeLogoDomain("")).toBeNull();
  });

  it("builds Brandfetch urls only when a public client id exists", () => {
    expect(getBrandfetchLogoUrl("intercom.com")).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "bf_client_123");

    expect(getBrandfetchLogoUrl("https://www.intercom.com")).toBe(
      "https://cdn.brandfetch.io/intercom.com?c=bf_client_123",
    );
  });

  it("builds favicon fallback urls without additional configuration", () => {
    expect(getGoogleFaviconUrl("https://www.paypal.com")).toBe(
      "https://www.google.com/s2/favicons?domain=paypal.com&sz=64",
    );
  });

  it("prefers Brandfetch and falls back to favicon when unavailable", () => {
    expect(getCompanyLogoUrl("google.com")).toBe(
      "https://www.google.com/s2/favicons?domain=google.com&sz=64",
    );

    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "bf_client_123");

    expect(getCompanyLogoUrl("google.com")).toBe(
      "https://cdn.brandfetch.io/google.com?c=bf_client_123",
    );
  });
});
