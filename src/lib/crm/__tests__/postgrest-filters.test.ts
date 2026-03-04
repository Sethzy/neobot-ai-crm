/**
 * Tests for CRM PostgREST filter helpers.
 * @module lib/crm/__tests__/postgrest-filters
 */
import { describe, expect, it } from "vitest";

import {
  buildContainsIlikeLiteral,
  buildSearchExpression,
} from "@/lib/crm/postgrest-filters";

describe("buildContainsIlikeLiteral", () => {
  it("wraps normalized text in contains wildcards", () => {
    expect(buildContainsIlikeLiteral("  john   smith ")).toBe('"%john smith%"');
  });

  it("escapes percent, underscore, and backslash characters", () => {
    expect(buildContainsIlikeLiteral("50%_off\\deal")).toBe('"%50\\%\\_off\\\\deal%"');
  });

  it("preserves commas and quotes safely via JSON quoting", () => {
    expect(buildContainsIlikeLiteral('john, "vip"')).toBe('"%john, \\\"vip\\\"%"');
  });
});

describe("buildSearchExpression", () => {
  it("creates a multi-column OR filter using a shared escaped literal", () => {
    const filter = buildSearchExpression("john", ["first_name", "last_name", "email", "phone"]);
    expect(filter).toBe(
      'first_name.ilike."%john%",last_name.ilike."%john%",email.ilike."%john%",phone.ilike."%john%"',
    );
  });

  it("works with a 2-column filter", () => {
    const filter = buildSearchExpression("orchard", ["address", "notes"]);
    expect(filter).toBe('address.ilike."%orchard%",notes.ilike."%orchard%"');
  });
});
