/**
 * Tests for CRM normalization helpers.
 * @module lib/crm/__tests__/normalize.test
 */
import { describe, expect, it } from "vitest";

import { normalizeWebsite } from "../normalize";

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
