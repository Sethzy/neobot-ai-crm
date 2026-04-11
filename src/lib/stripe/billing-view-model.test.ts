/**
 * Tests for the billing-page view model that maps a client billing row to render-ready props.
 * @module lib/stripe/billing-view-model.test
 */
import { describe, expect, it } from "vitest";

import { buildBillingViewModel } from "./billing-view-model";

const baseRow = {
  cancel_at_period_end: false,
  current_period_end: null,
  plan_name: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
} as const;

describe("buildBillingViewModel", () => {
  it("returns the free state when no Stripe customer exists", () => {
    const view = buildBillingViewModel({ ...baseRow });

    expect(view.state).toBe("free");
    expect(view.planName).toBe("Free");
    expect(view.primaryAction).toBe("upgrade");
    expect(view.statusLine).toBe("You're on the Free plan.");
  });

  it("returns the free state when a Stripe customer exists but plan is null", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      stripe_customer_id: "cus_123",
    });

    expect(view.state).toBe("free");
    expect(view.primaryAction).toBe("upgrade");
  });

  it("returns the trialing state with trial-end copy", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      cancel_at_period_end: false,
      current_period_end: "2026-04-18T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "trialing",
    });

    expect(view.state).toBe("trialing");
    expect(view.planName).toBe("Pro");
    expect(view.monthlyPriceSgd).toBe(25);
    expect(view.primaryAction).toBe("manage");
    expect(view.statusLine).toContain("Trial ends");
    expect(view.statusLine).toContain("18 April 2026");
  });

  it("returns the active state with renewal copy", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    expect(view.state).toBe("active");
    expect(view.statusLine).toContain("Renews on");
    expect(view.statusLine).toContain("11 May 2026");
    expect(view.primaryAction).toBe("manage");
  });

  it("returns the canceling state when cancel_at_period_end is true", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      cancel_at_period_end: true,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    expect(view.state).toBe("canceling");
    expect(view.statusLine).toContain("Cancels on");
    expect(view.statusLine).toContain("11 May 2026");
    expect(view.primaryAction).toBe("manage");
  });

  it("returns the past_due state with update-payment copy", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "past_due",
    });

    expect(view.state).toBe("past_due");
    expect(view.primaryAction).toBe("update_payment");
    expect(view.statusLine).toContain("Payment failed");
  });

  it("returns the past_due state for unpaid subscriptions too", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "unpaid",
    });

    expect(view.state).toBe("past_due");
    expect(view.primaryAction).toBe("update_payment");
  });

  it("returns the canceled state when subscription was terminated", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      plan_name: null,
      stripe_customer_id: "cus_123",
      subscription_status: "canceled",
    });

    expect(view.state).toBe("canceled");
    expect(view.primaryAction).toBe("upgrade");
  });

  it("uses the Max plan price when plan_name is Max", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Max",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    expect(view.planName).toBe("Max");
    expect(view.monthlyPriceSgd).toBe(99);
  });
});
