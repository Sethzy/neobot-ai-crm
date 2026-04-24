/**
 * Tests for CRM normalization helpers.
 * @module lib/crm/__tests__/normalize.test
 */
import { describe, expect, it } from "vitest";

import {
  extractEmailDomain,
  extractPhoneDigits,
  validateEmailForSave,
  validatePhoneForSave,
  validateWebsiteForSave,
  normalizeWebsite,
  phoneMatchesByDigits,
} from "../normalize";

describe("validateEmailForSave", () => {
  it("returns null for blank input", () => {
    expect(validateEmailForSave("")).toEqual({ ok: true, value: null });
  });

  it("trims and lowercases valid emails", () => {
    expect(validateEmailForSave("  Foo@Bar.COM  ")).toEqual({
      ok: true,
      value: "foo@bar.com",
    });
  });

  it("rejects invalid emails with the shared message", () => {
    expect(validateEmailForSave("hello")).toEqual({
      ok: false,
      message: "Doesn't look like an email",
    });
  });
});

describe("validatePhoneForSave", () => {
  it("returns null for blank input", () => {
    expect(validatePhoneForSave("")).toEqual({ ok: true, value: null });
  });

  it("stores parsed E.164 when available", () => {
    expect(validatePhoneForSave("(212) 555-1234")).toEqual({
      ok: true,
      value: "+12125551234",
    });
  });

  it("accepts raw plausible numbers when parsing fails", () => {
    expect(validatePhoneForSave("9123 4567")).toEqual({
      ok: true,
      value: "9123 4567",
    });
  });

  it("stores explicit international numbers in E.164 format", () => {
    expect(validatePhoneForSave("+65 9123 4567")).toEqual({
      ok: true,
      value: "+6591234567",
    });
  });

  it("rejects too-short numeric input", () => {
    expect(validatePhoneForSave("123")).toEqual({
      ok: false,
      message: "Doesn't look like a phone number",
    });
  });

  it("rejects non-phone text", () => {
    expect(validatePhoneForSave("asdf")).toEqual({
      ok: false,
      message: "Doesn't look like a phone number",
    });
  });
});

describe("validateWebsiteForSave", () => {
  it("returns null for blank input", () => {
    expect(validateWebsiteForSave("")).toEqual({ ok: true, value: null });
  });

  it("stores canonical normalized websites", () => {
    expect(validateWebsiteForSave("https://www.Acme.com/?utm=x")).toEqual({
      ok: true,
      value: "acme.com",
    });
  });

  it("accepts bare domains when they normalize cleanly", () => {
    expect(validateWebsiteForSave("acme.com")).toEqual({
      ok: true,
      value: "acme.com",
    });
  });

  it("rejects bare words that are not websites", () => {
    expect(validateWebsiteForSave("hello")).toEqual({
      ok: false,
      message: "Doesn't look like a website",
    });
  });

  it("rejects malformed URLs with the shared message", () => {
    expect(validateWebsiteForSave("not a url")).toEqual({
      ok: false,
      message: "Doesn't look like a website",
    });
  });
});

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
