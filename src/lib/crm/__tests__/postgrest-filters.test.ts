/**
 * Tests for CRM PostgREST filter helpers.
 * @module lib/crm/__tests__/postgrest-filters
 */
import { describe, expect, it } from "vitest";

import {
  buildContainsIlikeLiteral,
  buildContactSearchOrFilter,
  buildCrmTaskSearchOrFilter,
  buildDealSearchOrFilter,
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

describe("buildContactSearchOrFilter", () => {
  it("creates a 4-column OR filter using a shared escaped literal", () => {
    const filter = buildContactSearchOrFilter("john");
    expect(filter).toBe(
      'first_name.ilike."%john%",last_name.ilike."%john%",email.ilike."%john%",phone.ilike."%john%"',
    );
  });
});

describe("buildDealSearchOrFilter", () => {
  it("creates a 2-column OR filter for address and notes", () => {
    const filter = buildDealSearchOrFilter("orchard");
    expect(filter).toBe('address.ilike."%orchard%",notes.ilike."%orchard%"');
  });
});

describe("buildCrmTaskSearchOrFilter", () => {
  it("creates a 2-column OR filter for title and description", () => {
    const filter = buildCrmTaskSearchOrFilter("follow");
    expect(filter).toBe('title.ilike."%follow%",description.ilike."%follow%"');
  });
});
