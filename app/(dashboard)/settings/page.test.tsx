/**
 * Tests for the dashboard settings page.
 * @module app/(dashboard)/settings/page.test
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadCurrentBillingState } = vi.hoisted(() => ({
  mockLoadCurrentBillingState: vi.fn(),
}));

vi.mock("@/lib/stripe/actions", () => ({
  customerPortalAction: vi.fn(),
}));

vi.mock("@/lib/stripe/stripe", () => ({
  loadCurrentBillingState: mockLoadCurrentBillingState,
}));

vi.mock("../pricing/submit-button", () => ({
  SubmitButton: ({ idleLabel }: { idleLabel: string }) => <button>{idleLabel}</button>,
}));

import SettingsPage from "./page";

describe("/settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders free plan guidance when no Stripe customer exists yet", async () => {
    mockLoadCurrentBillingState.mockResolvedValue({
      client_id: "client-123",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: null,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    });

    const element = await SettingsPage({
      searchParams: Promise.resolve({}),
    });

    render(element);

    expect(screen.getByRole("heading", { name: /Workspace controls/i })).toBeInTheDocument();
    expect(screen.getByText(/Free is the default starting state/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View plans/i })).toHaveAttribute("href", "/pricing");
    expect(
      screen.getByText(/Upgrade from the pricing page to create a Stripe billing profile/i),
    ).toBeInTheDocument();
  });

  it("shows billing and connection alerts from the query string", async () => {
    mockLoadCurrentBillingState.mockResolvedValue({
      client_id: "client-123",
      display_name: "Seth",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_product_id: "prod_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    const element = await SettingsPage({
      searchParams: Promise.resolve({
        billing: "success",
        connection: "error",
        reason: "ownership",
      }),
    });

    render(element);

    expect(screen.getByText(/Billing updated/i)).toBeInTheDocument();
    expect(screen.getByText(/Connection update failed/i)).toBeInTheDocument();
    expect(screen.getByText(/ownership/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage billing in Stripe/i })).toBeInTheDocument();
  });

  it("shows a portal error alert when Stripe portal creation fails", async () => {
    mockLoadCurrentBillingState.mockResolvedValue({
      client_id: "client-123",
      display_name: "Seth",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_product_id: "prod_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    const element = await SettingsPage({
      searchParams: Promise.resolve({
        billing: "portal-error",
      }),
    });

    render(element);

    expect(screen.getByText(/Billing portal unavailable/i)).toBeInTheDocument();
  });
});
