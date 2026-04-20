/**
 * Tests for Stripe billing sync helpers and server-side billing entry points.
 * @module lib/stripe/stripe.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  billingErrorCodes,
} from "./billing-errors";

const {
  mockBillingPortalCreate,
  mockCheckoutCreate,
  mockCheckoutRetrieve,
  mockCreateAdminClient,
  mockCreateClient,
  mockCustomersCreate,
  mockPricesRetrieve,
  mockRedirect,
  mockResolveClientId,
  mockSubscriptionsList,
  mockSubscriptionsRetrieve,
} = vi.hoisted(() => ({
  mockBillingPortalCreate: vi.fn(),
  mockCheckoutCreate: vi.fn(),
  mockCheckoutRetrieve: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCustomersCreate: vi.fn(),
  mockPricesRetrieve: vi.fn(),
  mockRedirect: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockSubscriptionsList: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: (...args: never[]) => unknown) => callback,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: mockCreateClient,
}));

vi.mock("stripe", () => {
  const MockStripe = function MockStripe() {
    return {
      billingPortal: {
        sessions: {
          create: (...args: unknown[]) => mockBillingPortalCreate(...args),
        },
      },
      checkout: {
        sessions: {
          create: (...args: unknown[]) => mockCheckoutCreate(...args),
          retrieve: (...args: unknown[]) => mockCheckoutRetrieve(...args),
        },
      },
      customers: {
        create: (...args: unknown[]) => mockCustomersCreate(...args),
      },
      prices: {
        retrieve: (...args: unknown[]) => mockPricesRetrieve(...args),
      },
      subscriptions: {
        list: (...args: unknown[]) => mockSubscriptionsList(...args),
        retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
      },
    };
  };

  return {
    default: MockStripe,
  };
});

interface MockClientRow {
  cancel_at_period_end?: boolean;
  client_id: string;
  current_period_end?: string | null;
  display_name: string;
  plan_name: string | null;
  stripe_customer_id: string | null;
  stripe_product_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

function createMockAdminClient(args: {
  customerLookup?: MockClientRow | null;
  metadataLookup?: MockClientRow | null;
  updates: Array<{ clientId: string; update: Record<string, unknown> }>;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            if (column === "stripe_customer_id") {
              return { data: args.customerLookup ?? null, error: null };
            }

            if (column === "client_id") {
              return {
                data: value === args.metadataLookup?.client_id ? args.metadataLookup : null,
                error: null,
              };
            }

            return { data: null, error: null };
          },
        }),
      }),
      update: (update: Record<string, unknown>) => ({
        eq: async (_column: string, value: string) => {
          args.updates.push({ clientId: value, update });
          return { error: null };
        },
      }),
    }),
  };
}

function createMockSessionClient(args: {
  client: MockClientRow;
  email?: string | null;
  userId?: string;
}) {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            email: args.email ?? "seth@example.com",
            id: args.userId ?? "user-1",
          },
        },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          single: async () => ({
            data: value === args.client.client_id ? args.client : null,
            error:
              value === args.client.client_id
                ? null
                : { message: "missing client" },
          }),
        }),
      }),
    }),
  };
}

function createConfiguredStripePrice(args: {
  planName: "Pro" | "Max";
  priceId: string;
  productId: string;
  unitAmount: number;
}) {
  return {
    active: true,
    currency: "sgd",
    id: args.priceId,
    product: {
      active: true,
      id: args.productId,
      name: args.planName,
    },
    recurring: {
      interval: "month",
    },
    unit_amount: args.unitAmount,
  };
}

describe("lib/stripe/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.trysunder.com";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    process.env.STRIPE_MAX_PRICE_ID = "price_max";
    mockResolveClientId.mockResolvedValue("client-1");
    mockSubscriptionsList.mockResolvedValue({ data: [] });
  });

  it("syncs an active subscription onto the matching client row", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: null,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    } satisfies MockClientRow;

    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: null,
        metadataLookup: client,
        updates,
      }),
    );
    mockSubscriptionsRetrieve.mockResolvedValue({
      cancel_at_period_end: false,
      current_period_end: 1776643200,
      customer: "cus_123",
      id: "sub_123",
      items: {
        data: [
          {
            current_period_end: 1776643200,
            price: {
              id: "price_pro",
              product: {
                active: true,
                id: "prod_pro",
                name: "Pro",
              },
            },
          },
        ],
      },
      metadata: {
        clientId: "client-1",
      },
      status: "active",
    });

    const { syncBillingStateFromSubscriptionId } = await import("./stripe");

    await syncBillingStateFromSubscriptionId("sub_123");

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123", {
      expand: ["items.data.price.product"],
    });
    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: false,
          current_period_end: "2026-04-20T00:00:00.000Z",
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_123",
          subscription_status: "active",
        },
      },
    ]);
  });

  it("propagates current_period_end and cancel_at_period_end from a trialing subscription", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: null,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    } satisfies MockClientRow;

    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: null,
        metadataLookup: client,
        updates,
      }),
    );
    // 2026-04-18T00:00:00Z = 1776643200
    mockSubscriptionsRetrieve.mockResolvedValue({
      cancel_at_period_end: true,
      current_period_end: 1776643200,
      customer: "cus_123",
      id: "sub_trialing",
      items: {
        data: [
          {
            current_period_end: 1776643200,
            price: {
              id: "price_pro",
              product: { active: true, id: "prod_pro", name: "Pro" },
            },
          },
        ],
      },
      metadata: { clientId: "client-1" },
      status: "trialing",
    });

    const { syncBillingStateFromSubscriptionId } = await import("./stripe");

    await syncBillingStateFromSubscriptionId("sub_trialing");

    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: true,
          current_period_end: "2026-04-20T00:00:00.000Z",
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_trialing",
          subscription_status: "trialing",
        },
      },
    ]);
  });

  it("clears paid billing fields when Stripe deletes the subscription", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];

    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: {
          client_id: "client-1",
          display_name: "Seth",
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_123",
          subscription_status: "active",
        },
        metadataLookup: null,
        updates,
      }),
    );

    const { syncBillingStateFromDeletedSubscription } = await import("./stripe");

    await syncBillingStateFromDeletedSubscription({
      customer: "cus_123",
      id: "sub_123",
      metadata: {
        clientId: "client-1",
      },
      status: "canceled",
    } as never);

    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: false,
          current_period_end: null,
          plan_name: null,
          stripe_customer_id: "cus_123",
          stripe_product_id: null,
          stripe_subscription_id: null,
          subscription_status: "canceled",
        },
      },
    ]);
  });

  it("syncs checkout sessions by retrieving the created Stripe subscription", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];

    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: {
          client_id: "client-1",
          display_name: "Seth",
          plan_name: null,
          stripe_customer_id: "cus_123",
          stripe_product_id: null,
          stripe_subscription_id: null,
          subscription_status: null,
        },
        metadataLookup: null,
        updates,
      }),
    );
    mockCheckoutRetrieve.mockResolvedValue({
      mode: "subscription",
      subscription: "sub_checkout",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      cancel_at_period_end: false,
      current_period_end: 1776643200,
      customer: "cus_123",
      id: "sub_checkout",
      items: {
        data: [
          {
            current_period_end: 1776643200,
            price: {
              id: "price_max",
              product: {
                active: true,
                id: "prod_max",
                name: "Max",
              },
            },
          },
        ],
      },
      metadata: {
        clientId: "client-1",
      },
      status: "trialing",
    });

    const { syncBillingStateFromCheckoutSession } = await import("./stripe");

    await syncBillingStateFromCheckoutSession("cs_test_123");

    expect(mockCheckoutRetrieve).toHaveBeenCalledWith("cs_test_123", {
      expand: ["subscription"],
    });
    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: false,
          current_period_end: "2026-04-20T00:00:00.000Z",
          plan_name: "Max",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_max",
          stripe_subscription_id: "sub_checkout",
          subscription_status: "trialing",
        },
      },
    ]);
  });

  it("blocks duplicate checkout when Stripe already has a live subscription", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: "cus_123",
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    } satisfies MockClientRow;

    mockCreateClient.mockResolvedValue(createMockSessionClient({ client }));
    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: client,
        metadataLookup: client,
        updates,
      }),
    );
    mockPricesRetrieve.mockResolvedValue(
      createConfiguredStripePrice({
        planName: "Pro",
        priceId: "price_pro",
        productId: "prod_pro",
        unitAmount: 2500,
      }),
    );
    mockSubscriptionsList.mockResolvedValue({
      data: [{ id: "sub_live", status: "active" }],
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      cancel_at_period_end: false,
      current_period_end: 1776643200,
      customer: "cus_123",
      id: "sub_live",
      items: {
        data: [
          {
            current_period_end: 1776643200,
            price: {
              id: "price_pro",
              product: {
                active: true,
                id: "prod_pro",
                name: "Pro",
              },
            },
          },
        ],
      },
      metadata: {
        clientId: "client-1",
      },
      status: "active",
    });

    const { createCheckoutSession } = await import("./stripe");

    await expect(createCheckoutSession("price_pro")).rejects.toMatchObject({
      code: billingErrorCodes.alreadySubscribed,
    });
    expect(mockSubscriptionsList).toHaveBeenCalledWith({
      customer: "cus_123",
      limit: 10,
      status: "all",
    });
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: false,
          current_period_end: "2026-04-20T00:00:00.000Z",
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_live",
          subscription_status: "active",
        },
      },
    ]);
  });

  it("creates a hosted checkout session for a configured paid plan", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: null,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    } satisfies MockClientRow;

    mockCreateClient.mockResolvedValue(createMockSessionClient({ client }));
    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: null,
        metadataLookup: client,
        updates,
      }),
    );
    mockPricesRetrieve.mockResolvedValue(
      createConfiguredStripePrice({
        planName: "Max",
        priceId: "price_max",
        productId: "prod_max",
        unitAmount: 9900,
      }),
    );
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockCheckoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay_123",
    });

    const { createCheckoutSession } = await import("./stripe");

    await expect(createCheckoutSession("price_max")).resolves.toBe(
      "https://checkout.stripe.com/c/pay_123",
    );
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: "seth@example.com",
      metadata: {
        clientId: "client-1",
      },
      name: "Seth",
    });
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_url: "https://app.trysunder.com/pricing?billing=canceled",
        client_reference_id: "client-1",
        customer: "cus_new",
        line_items: [{ price: "price_max", quantity: 1 }],
        mode: "subscription",
        success_url:
          "https://app.trysunder.com/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}",
      }),
    );
    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          stripe_customer_id: "cus_new",
        },
      },
    ]);
  });

  it("creates a Stripe Customer Portal session for the current client", async () => {
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_product_id: "prod_pro",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    } satisfies MockClientRow;

    mockCreateClient.mockResolvedValue(createMockSessionClient({ client }));
    mockBillingPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session_123",
    });

    const { createCustomerPortalSession } = await import("./stripe");

    await expect(createCustomerPortalSession()).resolves.toBe(
      "https://billing.stripe.com/p/session_123",
    );
    expect(mockBillingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://app.trysunder.com/settings/workspace/billing",
    });
  });

  it("rejects checkout for an unconfigured Stripe price id", async () => {
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: null,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    } satisfies MockClientRow;

    mockCreateClient.mockResolvedValue(createMockSessionClient({ client }));

    const { createCheckoutSession } = await import("./stripe");

    await expect(createCheckoutSession("price_legacy")).rejects.toMatchObject({
      code: billingErrorCodes.invalidPlan,
      message: "The selected billing plan is not configured for Checkout.",
    });
    expect(mockPricesRetrieve).not.toHaveBeenCalled();
  });
});
