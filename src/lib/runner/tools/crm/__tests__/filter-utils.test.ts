/**
 * Tests for PostgREST filter utility helpers.
 * @module lib/runner/tools/crm/__tests__/filter-utils.test
 */
import { describe, expect, it } from "vitest";

import { buildContainsIlikeLiteral, buildIlikePattern } from "../filter-utils";

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
