/**
 * Tests for CRM normalization helpers.
 * @module lib/crm/__tests__/normalize.test
 */
import { describe, expect, it } from "vitest";

import {
  extractEmailDomain,
  extractPhoneDigits,
  normalizeWebsite,
  phoneMatchesByDigits,
} from "../normalize";

describe("normalizeWebsite", () => {
  it("strips protocol and www", () => {
    expect(normalizeWebsite("https://www.acme.com")).toBe("acme.com");
  });

  it("strips trailing slash", () => {
    expect(normalizeWebsite("https://acme.com/")).toBe("acme.com");
  });

  it("strips query parameters", () => {
    expect(normalizeWebsite("https://acme.com?utm_source=x")).toBe("acme.com");
  });

  it("preserves path case-sensitively", () => {
    expect(normalizeWebsite("https://acme.com/Products")).toBe("acme.com/Products");
  });

  it("returns null on unparseable input", () => {
    expect(normalizeWebsite("not a url")).toBe(null);
  });

  it("returns null on null or empty input", () => {
    expect(normalizeWebsite(null)).toBe(null);
    expect(normalizeWebsite("")).toBe(null);
  });
});

describe("extractPhoneDigits", () => {
  it("strips non-digits", () => {
    expect(extractPhoneDigits("(212) 555-1234")).toBe("2125551234");
  });
});

describe("phoneMatchesByDigits", () => {
  it("matches suffix against E.164", () => {
    expect(phoneMatchesByDigits("+12125551234", "5551234")).toBe(true);
  });

  it("matches full E.164 digits", () => {
    expect(phoneMatchesByDigits("+12125551234", "2125551234")).toBe(true);
  });

  it("does not match unrelated digits", () => {
    expect(phoneMatchesByDigits("+12125551234", "9998888")).toBe(false);
  });
});

describe("extractEmailDomain", () => {
  it("returns registrable domain for simple email", () => {
    expect(extractEmailDomain("jane@acme.com")).toBe("acme.com");
  });

  it("handles subdomains", () => {
    expect(extractEmailDomain("jane@mail.acme.com")).toBe("acme.com");
  });

  it("handles country-code TLDs", () => {
    expect(extractEmailDomain("jane@mail.acme.co.uk")).toBe("acme.co.uk");
  });

  it("lowercases the domain", () => {
    expect(extractEmailDomain("jane@ACME.COM")).toBe("acme.com");
  });

  it("returns null for invalid input", () => {
    expect(extractEmailDomain("not-an-email")).toBe(null);
    expect(extractEmailDomain("")).toBe(null);
    expect(extractEmailDomain(null)).toBe(null);
  });
});
