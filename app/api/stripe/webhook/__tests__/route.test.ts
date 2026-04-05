/**
 * Tests for the Stripe webhook route.
 * @module app/api/stripe/webhook/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/stripe/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/stripe")>();

  return {
    ...actual,
    getStripeClient: () => ({
      webhooks: {
        constructEvent: mockConstructEvent,
      },
    }),
    syncBillingStateFromDeletedSubscription: mockSyncBillingStateFromDeletedSubscription,
    syncBillingStateFromSubscriptionId: mockSyncBillingStateFromSubscriptionId,
  };
});

describe("POST /api/stripe/webhook", () => {
  const originalEnv = process.env;

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
    process.env = {
      ...originalEnv,
      STRIPE_WEBHOOK_SECRET: "whsec_test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 400 when the Stripe signature header is missing", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when Stripe signature verification fails", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("bad-signature");
    });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("bad-signature");
  });

  it("syncs the subscription id from checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_checkout_123",
        },
      },
    });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncBillingStateFromSubscriptionId).toHaveBeenCalledWith("sub_checkout_123");
  });

  it("syncs payment failures through the invoice subscription id", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: { id: "sub_invoice_123" },
        },
      },
    });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncBillingStateFromSubscriptionId).toHaveBeenCalledWith("sub_invoice_123");
  });

  it("clears billing state for customer.subscription.deleted", async () => {
    const deletedSubscription = {
      id: "sub_deleted_123",
      customer: "cus_123",
      metadata: { clientId: "client-123" },
      status: "canceled",
    };
    mockConstructEvent.mockReturnValueOnce({
      type: "customer.subscription.deleted",
      data: {
        object: deletedSubscription,
      },
    });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncBillingStateFromDeletedSubscription).toHaveBeenCalledWith(
      deletedSubscription,
    );
  });
});
