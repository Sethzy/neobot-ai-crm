/**
 * Tests for the authenticated pricing page server render.
 * @module app/(dashboard)/pricing/page.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckoutAction,
  mockCustomerPortalAction,
  mockGetBillingSummary,
  mockListStripePlans,
  mockLoadCurrentMessageQuota,
} = vi.hoisted(() => ({
  mockCheckoutAction: vi.fn(),
  mockCustomerPortalAction: vi.fn(),
  mockGetBillingSummary: vi.fn(),
  mockListStripePlans: vi.fn(),
  mockLoadCurrentMessageQuota: vi.fn(),
}));

vi.mock("@/lib/stripe/actions", () => ({
  checkoutAction: mockCheckoutAction,
  customerPortalAction: mockCustomerPortalAction,
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getBillingSummary: (...args: unknown[]) => mockGetBillingSummary(...args),
  listStripePlans: (...args: unknown[]) => mockListStripePlans(...args),
}));

vi.mock("@/lib/usage/message-quota-server", () => ({
  loadCurrentMessageQuota: (...args: unknown[]) => mockLoadCurrentMessageQuota(...args),
}));

describe("/pricing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBillingSummary.mockResolvedValue({
      canManageBilling: false,
      client: {
        client_id: "client-1",
        display_name: "Seth",
        plan_name: null,
        stripe_customer_id: null,
        stripe_product_id: null,
        stripe_subscription_id: null,
        subscription_status: null,
        user_id: "user-1",
      },
      currentPlanName: "Free",
      currentPlanStatus: "free",
      hasPaidSubscription: false,
    });
    mockListStripePlans.mockResolvedValue([
      {
        amount: 2500,
        currency: "sgd",
        interval: "month",
        name: "Pro",
        priceId: "price_pro",
        productId: "prod_pro",
      },
      {
        amount: 9900,
        currency: "sgd",
        interval: "month",
        name: "Max",
        priceId: "price_max",
        productId: "prod_max",
      },
    ]);
    mockLoadCurrentMessageQuota.mockResolvedValue({
      clientId: "client-1",
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 12,
      messagesRemaining: 88,
      periodStart: "2026-03-01",
      nextResetDate: "2026-04-01",
    });
  });

  it("renders trial CTA buttons for free users", async () => {
    const { default: PricingPage } = await import("./page");
    render(await PricingPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Plans & Billing")).toBeInTheDocument();
    expect(screen.getByText("Current plan: Free")).toBeInTheDocument();
    expect(screen.getByText("100 messages / month")).toBeInTheDocument();
    expect(screen.getByText(/12 used · 88 remaining/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Pro trial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Max trial" })).toBeInTheDocument();
  });

  it("renders portal management actions for paid users", async () => {
    mockGetBillingSummary.mockResolvedValueOnce({
      canManageBilling: true,
      client: {
        client_id: "client-1",
        display_name: "Seth",
        plan_name: "Pro",
        stripe_customer_id: "cus_123",
        stripe_product_id: "prod_pro",
        stripe_subscription_id: "sub_123",
        subscription_status: "active",
        user_id: "user-1",
      },
      currentPlanName: "Pro",
      currentPlanStatus: "active",
      hasPaidSubscription: true,
    });

    const { default: PricingPage } = await import("./page");
    render(await PricingPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Paid subscriptions are managed in Stripe.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Manage in portal" })).toHaveLength(2);
  });
});
