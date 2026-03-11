/**
 * Tests for billing plan quota constants.
 * @module lib/stripe/plans.test
 */
import { describe, expect, it } from "vitest";

import {
  billingPlanCatalog,
  getBillingPlanMessageLimit,
} from "./plans";

describe("billing plan message limits", () => {
  it("defines explicit monthly limits for every plan", () => {
    expect(billingPlanCatalog.Free.monthlyMessageLimit).toBe(100);
    expect(billingPlanCatalog.Pro.monthlyMessageLimit).toBe(500);
    expect(billingPlanCatalog.Max.monthlyMessageLimit).toBe(2000);
  });

  it("falls back to the free limit for unknown plan names", () => {
    expect(getBillingPlanMessageLimit(null)).toBe(100);
    expect(getBillingPlanMessageLimit(undefined)).toBe(100);
    expect(getBillingPlanMessageLimit("Starter")).toBe(100);
  });
});
