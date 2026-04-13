/**
 * Tests for PostgREST filter utility helpers.
 * @module lib/crm/__tests__/filter-utils.test
 */
import { describe, expect, it } from "vitest";

import {
  buildContainsIlikeLiteral,
  buildIlikePattern,
  flexibleTimestampSchema,
  normalizeDateString,
} from "../filter-utils";

describe("buildContainsIlikeLiteral", () => {
  it("normalizes whitespace and wraps value in a quoted contains literal", () => {
    const result = buildContainsIlikeLiteral("  John   Smith  ");

    expect(result).toBe("\"%John Smith%\"");
  });

  it("escapes wildcard and quote characters", () => {
    const result = buildContainsIlikeLiteral("A%_\"B");

    expect(result).toBe("\"%A\\%\\_\\\"B%\"");
  });
});

describe("buildIlikePattern", () => {
  it("returns a raw contains pattern without PostgREST quoting", () => {
    const result = buildIlikePattern("John");

    expect(result).toBe("%John%");
  });

  it("normalizes whitespace", () => {
    const result = buildIlikePattern("  John   Smith  ");

    expect(result).toBe("%John Smith%");
  });

  it("escapes LIKE wildcards", () => {
    const result = buildIlikePattern("A%_B");

    expect(result).toBe("%A\\%\\_B%");
  });

  it("does not add PostgREST double-quote wrapping", () => {
    const result = buildIlikePattern("test");

    expect(result).not.toContain('"');
  });
});

describe("normalizeDateString", () => {
  it("parses common date formats", () => {
    expect(normalizeDateString("2026-04-10")).toBe("2026-04-10T00:00:00Z");
    expect(normalizeDateString("04/10/2026")).toBe("2026-04-10T00:00:00Z");
    expect(normalizeDateString("April 10, 2026")).toBe("2026-04-10T00:00:00Z");
    expect(normalizeDateString("10 Apr 2026")).toBe("2026-04-10T00:00:00Z");
  });

  it("returns null for unparseable input", () => {
    expect(normalizeDateString("banana")).toBeNull();
    expect(normalizeDateString("not a date")).toBeNull();
    expect(normalizeDateString("bogus-date")).toBeNull();
  });

  it("passes through null and undefined unchanged", () => {
    expect(normalizeDateString(null)).toBeNull();
    expect(normalizeDateString(undefined)).toBeUndefined();
  });

  it("passes through full ISO timestamps unchanged", () => {
    expect(normalizeDateString("2026-04-10T14:30:00Z")).toBe("2026-04-10T14:30:00Z");
  });
});

describe("flexibleTimestampSchema", () => {
  it("accepts common date formats", () => {
    expect(flexibleTimestampSchema.safeParse("04/10/2026").success).toBe(true);
    expect(flexibleTimestampSchema.safeParse("April 10, 2026").success).toBe(true);
    expect(flexibleTimestampSchema.safeParse("10 Apr 2026").success).toBe(true);
  });

  it("rejects unparseable date strings", () => {
    expect(flexibleTimestampSchema.safeParse("banana").success).toBe(false);
    expect(flexibleTimestampSchema.safeParse("not a date").success).toBe(false);
  });

  it("rejects empty and whitespace-only strings", () => {
    expect(flexibleTimestampSchema.safeParse("").success).toBe(false);
    expect(flexibleTimestampSchema.safeParse("   ").success).toBe(false);
  });
});
