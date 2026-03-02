/**
 * Tests for PostgREST filter utility helpers.
 * @module lib/runner/tools/crm/__tests__/filter-utils.test
 */
import { describe, expect, it } from "vitest";

import { buildContainsIlikeLiteral } from "../filter-utils";

describe("buildContainsIlikeLiteral", () => {
  it("normalizes whitespace and wraps value in a quoted contains literal", () => {
    const result = buildContainsIlikeLiteral("  John   Smith  ");

    expect(result).toBe("\"%John Smith%\"");
  });

  it("escapes wildcard and quote characters", () => {
    const result = buildContainsIlikeLiteral("A%_\"B");

    expect(result).toBe("\"%A\\\\%\\\\_\\\"B%\"");
  });
});
