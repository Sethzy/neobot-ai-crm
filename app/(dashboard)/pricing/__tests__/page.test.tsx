/**
 * Regression tests for pricing page data loading order.
 * @module app/(dashboard)/pricing/__tests__/page.test
 */
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

const billingSummaryFixture = {
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
};

const quotaFixture = {
  clientId: "client-1",
  planName: "Free",
  monthlyMessageLimit: 100,
  messagesUsed: 12,
  messagesRemaining: 88,
  periodStart: "2026-03-01",
  nextResetDate: "2026-04-01",
};

describe("PricingPage parallel data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBillingSummary.mockResolvedValue(billingSummaryFixture);
    mockLoadCurrentMessageQuota.mockResolvedValue(quotaFixture);
    mockListStripePlans.mockResolvedValue([]);
  });

  it("starts billing summary, quota, and stripe plan fetches in parallel", async () => {
    const events: string[] = [];

    mockGetBillingSummary.mockImplementation(async () => {
      events.push("summary:start");
      await Promise.resolve();
      events.push("summary:end");
      return billingSummaryFixture;
    });

    mockLoadCurrentMessageQuota.mockImplementation(async () => {
      events.push("quota:start");
      await Promise.resolve();
      events.push("quota:end");
      return quotaFixture;
    });

    mockListStripePlans.mockImplementation(async () => {
      events.push("plans:start");
      await Promise.resolve();
      events.push("plans:end");
      return [];
    });

    const { default: PricingPage } = await import("../page");

    await PricingPage({ searchParams: Promise.resolve({}) });

    expect(events.slice(0, 3)).toEqual(["summary:start", "quota:start", "plans:start"]);
  });
});
