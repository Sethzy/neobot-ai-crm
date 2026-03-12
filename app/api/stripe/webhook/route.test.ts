/**
 * Tests for the Stripe webhook route.
 * @module app/api/stripe/webhook/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockConstructEvent,
  mockSyncBillingStateFromDeletedSubscription,
  mockSyncBillingStateFromSubscriptionId,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSyncBillingStateFromDeletedSubscription: vi.fn(),
  mockSyncBillingStateFromSubscriptionId: vi.fn(),
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  }),
  syncBillingStateFromDeletedSubscription: (...args: unknown[]) =>
    mockSyncBillingStateFromDeletedSubscription(...args),
  syncBillingStateFromSubscriptionId: (...args: unknown[]) =>
    mockSyncBillingStateFromSubscriptionId(...args),
}));

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncBillingStateFromSubscriptionId.mockResolvedValue({
      clientId: "client-123",
      planName: "pro",
      stripeCustomerId: "cus_123",
      subscriptionId: "sub_123",
      subscriptionStatus: "active",
      trial: false,
    });
    mockSyncBillingStateFromDeletedSubscription.mockResolvedValue({
      clientId: "client-123",
      planName: "pro",
      stripeCustomerId: "cus_123",
      subscriptionId: null,
      subscriptionStatus: "canceled",
      trial: false,
    });
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("returns 400 when the Stripe signature header is missing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing Stripe signature." });
  });

  it("syncs subscription ids for checkout, invoice, and subscription update events", async () => {
    const { POST } = await import("./route");

    mockConstructEvent
      .mockReturnValueOnce({
        type: "checkout.session.completed",
        data: { object: { subscription: "sub_checkout" } },
      })
      .mockReturnValueOnce({
        type: "invoice.paid",
        data: { object: { subscription: "sub_invoice" } },
      })
      .mockReturnValueOnce({
        type: "invoice.payment_failed",
        data: { object: { subscription: { id: "sub_failed" } } },
      })
      .mockReturnValueOnce({
        type: "customer.subscription.updated",
        data: { object: { id: "sub_updated" } },
      });

    const checkoutResponse = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: { "stripe-signature": "sig_checkout" },
        method: "POST",
      }) as never,
    );
    const invoiceResponse = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: { "stripe-signature": "sig_invoice" },
        method: "POST",
      }) as never,
    );
    const failedInvoiceResponse = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: { "stripe-signature": "sig_failed_invoice" },
        method: "POST",
      }) as never,
    );
    const updatedSubscriptionResponse = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: { "stripe-signature": "sig_updated_subscription" },
        method: "POST",
      }) as never,
    );

    expect(checkoutResponse.status).toBe(200);
    expect(invoiceResponse.status).toBe(200);
    expect(failedInvoiceResponse.status).toBe(200);
    expect(updatedSubscriptionResponse.status).toBe(200);
    expect(mockSyncBillingStateFromSubscriptionId).toHaveBeenNthCalledWith(1, "sub_checkout");
    expect(mockSyncBillingStateFromSubscriptionId).toHaveBeenNthCalledWith(2, "sub_invoice");
    expect(mockSyncBillingStateFromSubscriptionId).toHaveBeenNthCalledWith(3, "sub_failed");
    expect(mockSyncBillingStateFromSubscriptionId).toHaveBeenNthCalledWith(4, "sub_updated");
  });

  it("delegates deleted subscriptions to the dedicated delete-sync path", async () => {
    const { POST } = await import("./route");
    const deletedSubscription = {
      id: "sub_deleted",
      status: "canceled",
      customer: "cus_123",
      metadata: {},
    };

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: deletedSubscription },
    });

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: { "stripe-signature": "sig_deleted" },
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockSyncBillingStateFromDeletedSubscription).toHaveBeenCalledWith(
      deletedSubscription,
    );
  });

  it("returns 500 when Stripe billing sync fails so Stripe can retry", async () => {
    const { POST } = await import("./route");

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: { id: "sub_retry" } },
    });
    mockSyncBillingStateFromSubscriptionId.mockRejectedValueOnce(
      new Error("No matching client found."),
    );

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        body: "{}",
        headers: { "stripe-signature": "sig_retry" },
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "No matching client found.",
    });
  });
});
