/**
 * Tests for PostgREST filter utility helpers.
 * @module lib/runner/tools/crm/__tests__/filter-utils.test
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
});

describe("flexibleTimestampSchema", () => {
  it("accepts common date formats", () => {
    expect(flexibleTimestampSchema.safeParse("04/10/2026").success).toBe(true);
    expect(flexibleTimestampSchema.safeParse("April 10, 2026").success).toBe(true);
    expect(flexibleTimestampSchema.safeParse("10 Apr 2026").success).toBe(true);
  });
});
