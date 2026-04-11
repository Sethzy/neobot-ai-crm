/**
 * Tests for free email provider detection.
 * @module lib/crm/__tests__/free-email-providers.test
 */
import { describe, expect, it } from "vitest";

import { FREE_EMAIL_PROVIDERS, isFreeEmailDomain } from "../free-email-providers";

describe("isFreeEmailDomain", () => {
  it("identifies gmail as free", () => {
    expect(isFreeEmailDomain("gmail.com")).toBe(true);
  });

  it("identifies acme.com as not free", () => {
    expect(isFreeEmailDomain("acme.com")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isFreeEmailDomain("GMAIL.COM")).toBe(true);
  });

  it("has a reasonable number of providers", () => {
    expect(FREE_EMAIL_PROVIDERS.size).toBeGreaterThan(100);
  });
});
