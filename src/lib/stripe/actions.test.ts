/**
 * Tests for Stripe billing server actions.
 * @module lib/stripe/actions.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BillingFlowError,
  billingErrorCodes,
} from "./billing-errors";

const {
  mockCreateCheckoutSession,
  mockCreateCustomerPortalSession,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
  mockCreateCustomerPortalSession: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("./stripe", () => ({
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
  createCustomerPortalSession: (...args: unknown[]) =>
    mockCreateCustomerPortalSession(...args),
}));

describe("lib/stripe/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects invalid checkout submissions back to pricing", async () => {
    const { checkoutAction } = await import("./actions");

    await checkoutAction(new FormData());

    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/pricing?billing=invalid-plan");
  });

  it("redirects successful checkout actions to the hosted Stripe url", async () => {
    const { checkoutAction } = await import("./actions");
    const formData = new FormData();
    formData.set("priceId", "price_pro");
    mockCreateCheckoutSession.mockResolvedValue("https://checkout.stripe.com/c/pay_123");

    await checkoutAction(formData);

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith("price_pro");
    expect(mockRedirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay_123");
  });

  it("redirects duplicate checkout attempts back to pricing", async () => {
    const { checkoutAction } = await import("./actions");
    const formData = new FormData();
    formData.set("priceId", "price_pro");
    mockCreateCheckoutSession.mockRejectedValue(
      new BillingFlowError(
        billingErrorCodes.alreadySubscribed,
        "already subscribed",
      ),
    );

    await checkoutAction(formData);

    expect(mockRedirect).toHaveBeenCalledWith(
      "/pricing?billing=already-subscribed",
    );
  });

  it("redirects successful portal actions to Stripe", async () => {
    const { customerPortalAction } = await import("./actions");
    mockCreateCustomerPortalSession.mockResolvedValue(
      "https://billing.stripe.com/p/session_123",
    );

    await customerPortalAction();

    expect(mockRedirect).toHaveBeenCalledWith(
      "https://billing.stripe.com/p/session_123",
    );
  });

  it("redirects portal failures back to settings", async () => {
    const { customerPortalAction } = await import("./actions");
    mockCreateCustomerPortalSession.mockRejectedValue(new Error("portal unavailable"));

    await customerPortalAction();

    expect(mockRedirect).toHaveBeenCalledWith("/settings/workspace/billing?billing=portal-error");
  });

  it("rethrows Next redirect errors from the portal helper", async () => {
    const { customerPortalAction } = await import("./actions");
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/pricing;307;",
    });
    mockCreateCustomerPortalSession.mockRejectedValue(redirectError);

    await expect(customerPortalAction()).rejects.toBe(redirectError);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
