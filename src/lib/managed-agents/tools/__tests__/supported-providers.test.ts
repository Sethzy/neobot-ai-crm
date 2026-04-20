import { describe, expect, it } from "vitest";

import {
  normalizeSupportedProviderSlug,
  SUPPORTED_PROVIDER_DISPLAY_NAMES,
  SUPPORTED_PROVIDERS,
} from "../supported-providers";

describe("supported-providers", () => {
  it("exposes the launch-set canonical slugs", () => {
    expect([...SUPPORTED_PROVIDERS].sort()).toEqual([
      "gmail",
      "googlecalendar",
      "googledrive",
      "notion",
    ]);
  });

  it("normalizes supported aliases to canonical Composio slugs", () => {
    expect(normalizeSupportedProviderSlug("gmail")).toBe("gmail");
    expect(normalizeSupportedProviderSlug("google_drive")).toBe("googledrive");
    expect(normalizeSupportedProviderSlug("googlecalendar")).toBe("googlecalendar");
    expect(normalizeSupportedProviderSlug(" Google_Drive ")).toBe("googledrive");
    expect(normalizeSupportedProviderSlug("Google Drive")).toBe("googledrive");
    expect(normalizeSupportedProviderSlug("google-calendar")).toBe("googlecalendar");
  });

  it("exposes human-readable provider names for prompt copy", () => {
    expect(SUPPORTED_PROVIDER_DISPLAY_NAMES.googledrive).toBe("Google Drive");
    expect(SUPPORTED_PROVIDER_DISPLAY_NAMES.googlecalendar).toBe("Google Calendar");
  });

  it("returns null for providers outside the launch set", () => {
    expect(normalizeSupportedProviderSlug("slack")).toBeNull();
    expect(normalizeSupportedProviderSlug("")).toBeNull();
  });
});
