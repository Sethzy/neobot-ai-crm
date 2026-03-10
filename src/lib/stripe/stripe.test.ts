/**
 * Tests for Stripe billing sync helpers.
 * @module lib/stripe/stripe.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAdminClient,
  mockCreateClient,
  mockRedirect,
  mockResolveClientId,
  mockSubscriptionsRetrieve,
  mockCheckoutRetrieve,
} = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRedirect: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockCheckoutRetrieve: vi.fn(),
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
      subscriptions: {
        retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
      },
      checkout: {
        sessions: {
          retrieve: (...args: unknown[]) => mockCheckoutRetrieve(...args),
        },
      },
    };
  };

  return {
    default: MockStripe,
  };
});

interface MockClientRow {
  client_id: string;
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

describe("lib/stripe/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
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
      customer: "cus_123",
      id: "sub_123",
      items: {
        data: [
          {
            price: {
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
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_123",
          subscription_status: "active",
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
      customer: "cus_123",
      id: "sub_checkout",
      items: {
        data: [
          {
            price: {
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
          plan_name: "Max",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_max",
          stripe_subscription_id: "sub_checkout",
          subscription_status: "trialing",
        },
      },
    ]);
  });
});
