/**
 * Server-side Stripe billing helpers for Checkout, Customer Portal, and webhook sync.
 * @module lib/stripe/stripe
 */
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import Stripe from "stripe";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { resolveClientId } from "@/lib/chat/client-id";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import {
  BillingFlowError,
  billingErrorCodes,
} from "./billing-errors";
import {
  billingPlanCatalog,
  billingPlanNames,
  getBillingPlanPriceId,
  getPaidBillingPlanNameForPriceId,
  isPaidBillingPlanName,
  paidBillingPlanNames,
  type BillingPlanName,
  type PaidBillingPlanName,
} from "./plans";

type ClientBillingRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  | "client_id"
  | "display_name"
  | "plan_name"
  | "stripe_customer_id"
  | "stripe_product_id"
  | "stripe_subscription_id"
  | "subscription_status"
>;

export interface PricingPlan {
  name: BillingPlanName;
  summary: string;
  highlights: string[];
  monthlyPriceSgd: number;
  trialDays: number;
  isFree: boolean;
  isConfigured: boolean;
  priceId: string | null;
  productId: string | null;
}

export interface StripePlanSummary {
  amount: number | null;
  currency: string;
  interval: Stripe.Price.Recurring.Interval | null;
  name: PaidBillingPlanName;
  priceId: string | null;
  productId: string | null;
}

export interface BillingSummary {
  canManageBilling: boolean;
  client: ClientBillingRow;
  currentPlanName: BillingPlanName;
  currentPlanStatus: string;
  hasPaidSubscription: boolean;
}

export interface SyncedBillingState {
  clientId: string;
  planName: PaidBillingPlanName | null;
  stripeCustomerId: string;
  subscriptionId: string | null;
  subscriptionStatus: Stripe.Subscription.Status;
  trial: boolean;
}

const clientBillingSelect =
  "client_id, display_name, plan_name, stripe_customer_id, stripe_product_id, stripe_subscription_id, subscription_status";

const cacheKey = ["stripe-pricing-plans-v2"];
const supportedCurrency = "sgd";
const terminalStatuses = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
]);

/**
 * Extracts the customer ID string from a Stripe subscription's customer field,
 * which may be either a string or an expanded Customer/DeletedCustomer object.
 */
function resolveCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Extracts the subscription ID from a Stripe object's `subscription` field,
 * which may be a string, an expanded Subscription object, or null/undefined.
 */
export function resolveSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined,
): string | null {
  if (!subscription) {
    return null;
  }

  return typeof subscription === "string" ? subscription : subscription.id;
}

let stripeClient: Stripe | null = null;

function getStripeSecretKey(): string {
  const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return secretKey;
}

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey());
  }

  return stripeClient;
}

function resolveAppBaseUrl(): string {
  const directAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (directAppUrl) {
    return directAppUrl.replace(/\/$/, "");
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }

  const vercelUrl = (process.env.VERCEL_URL ?? "").trim();
  if (vercelUrl) {
    return vercelUrl.startsWith("http")
      ? vercelUrl.replace(/\/$/, "")
      : `https://${vercelUrl}`;
  }

  throw new Error("NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL, or VERCEL_URL must be set.");
}

async function requireCurrentClientContext(): Promise<{
  client: ClientBillingRow;
  clientId: string;
  email: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const clientId = await resolveClientId(supabase, user.id);
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(clientBillingSelect)
    .eq("client_id", clientId)
    .single();

  if (clientError || !client) {
    throw new Error("Failed to load the current client billing state.");
  }

  return {
    client,
    clientId,
    email: user.email ?? null,
    supabase,
  };
}

function getPriceAmount(price: Stripe.Price): number {
  return typeof price.unit_amount === "number" ? price.unit_amount / 100 : 0;
}

function getExpandedProduct(
  product: string | Stripe.Product | Stripe.DeletedProduct | null,
): Stripe.Product | null {
  if (!product || typeof product === "string" || product.deleted) {
    return null;
  }

  return product;
}

async function getConfiguredRecurringPrice(
  planName: PaidBillingPlanName,
): Promise<Stripe.Price | null> {
  const priceId = getBillingPlanPriceId(planName);

  if (!priceId) {
    return null;
  }

  const price = await getStripeClient().prices.retrieve(priceId, {
    expand: ["product"],
  });
  const product = getExpandedProduct(price.product);

  if (!price.active || !product?.active) {
    throw new Error(`Configured Stripe price for ${planName} is not active.`);
  }

  if (!price.recurring || price.recurring.interval !== "month") {
    throw new Error(
      `Configured Stripe price for ${planName} must be a monthly recurring price.`,
    );
  }

  if (price.currency !== supportedCurrency) {
    throw new Error(
      `Configured Stripe price for ${planName} must use ${supportedCurrency.toUpperCase()}.`,
    );
  }

  return price;
}

async function getValidatedRecurringPrice(priceId: string): Promise<{
  planName: PaidBillingPlanName;
  price: Stripe.Price;
}> {
  const planName = getPaidBillingPlanNameForPriceId(priceId);

  if (!planName) {
    throw new BillingFlowError(
      billingErrorCodes.invalidPlan,
      "The selected billing plan is not configured for Checkout.",
    );
  }

  const price = await getConfiguredRecurringPrice(planName);

  if (!price) {
    throw new BillingFlowError(
      billingErrorCodes.invalidPlan,
      "The selected billing plan is not configured for Checkout.",
    );
  }

  return { planName, price };
}

async function ensureStripeCustomerId(args: {
  client: ClientBillingRow;
  clientId: string;
  email: string | null;
}): Promise<string> {
  if (args.client.stripe_customer_id) {
    return args.client.stripe_customer_id;
  }

  const customer = await getStripeClient().customers.create({
    email: args.email ?? undefined,
    name: args.client.display_name ?? undefined,
    metadata: {
      clientId: args.clientId,
    },
  });

  const supabaseAdmin = await createAdminClient();
  const { error: updateError } = await supabaseAdmin
    .from("clients")
    .update({ stripe_customer_id: customer.id })
    .eq("client_id", args.clientId);

  if (updateError) {
    throw new Error("Failed to persist the Stripe customer id for this client.");
  }

  return customer.id;
}

const loadPricingPlans = unstable_cache(
  async (): Promise<PricingPlan[]> => {
    const configuredPaidPrices = await Promise.all(
      paidBillingPlanNames.map(
        async (planName) =>
          [planName, await getConfiguredRecurringPrice(planName)] as const,
      ),
    );
    const priceByPlanName = new Map<PaidBillingPlanName, Stripe.Price>(
      configuredPaidPrices.filter(
        (
          entry,
        ): entry is readonly [PaidBillingPlanName, Stripe.Price] => entry[1] !== null,
      ),
    );

    return billingPlanNames.map((name) => {
      const definition = billingPlanCatalog[name];

      if (definition.isFree) {
        return {
          ...definition,
          isConfigured: true,
          priceId: null,
          productId: null,
        };
      }

      const configuredPrice = priceByPlanName.get(name as PaidBillingPlanName);
      const configuredProduct = getExpandedProduct(configuredPrice?.product ?? null);

      return {
        ...definition,
        monthlyPriceSgd: configuredPrice
          ? getPriceAmount(configuredPrice)
          : definition.monthlyPriceSgd,
        isConfigured: Boolean(configuredPrice),
        priceId: configuredPrice?.id ?? null,
        productId: configuredProduct?.id ?? null,
      };
    });
  },
  cacheKey,
  { revalidate: 3600 },
);

export const listPricingPlans = loadPricingPlans;

export async function loadCurrentBillingState(): Promise<ClientBillingRow> {
  const { client } = await requireCurrentClientContext();
  return client;
}

export async function getBillingSummary(): Promise<BillingSummary> {
  const client = await loadCurrentBillingState();
  const currentPlanName =
    client.plan_name && isPaidBillingPlanName(client.plan_name) ? client.plan_name : "Free";
  const currentPlanStatus = client.subscription_status ?? "free";
  const hasPaidSubscription = Boolean(
    client.stripe_subscription_id
      && currentPlanName !== "Free"
      && !terminalStatuses.has(currentPlanStatus as Stripe.Subscription.Status),
  );

  return {
    canManageBilling: Boolean(client.stripe_customer_id),
    client,
    currentPlanName,
    currentPlanStatus,
    hasPaidSubscription,
  };
}

export async function listStripePlans(): Promise<StripePlanSummary[]> {
  const pricingPlans = await listPricingPlans();

  return pricingPlans
    .filter((plan): plan is PricingPlan & { name: PaidBillingPlanName } => !plan.isFree)
    .map((plan) => ({
      amount: plan.isConfigured ? Math.round(plan.monthlyPriceSgd * 100) : null,
      currency: supportedCurrency,
      interval: "month",
      name: plan.name,
      priceId: plan.priceId,
      productId: plan.productId,
    }));
}

async function findLiveSubscriptionForCustomer(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const subscriptions = await getStripeClient().subscriptions.list({
    customer: customerId,
    limit: 10,
    status: "all",
  });

  return (
    subscriptions.data.find(
      (subscription) => !terminalStatuses.has(subscription.status),
    ) ?? null
  );
}

export async function createCheckoutSession(priceId: string): Promise<string> {
  const context = await requireCurrentClientContext();
  const [{ planName, price }, stripeCustomerId] = await Promise.all([
    getValidatedRecurringPrice(priceId),
    ensureStripeCustomerId(context),
  ]);
  const liveSubscription = await findLiveSubscriptionForCustomer(stripeCustomerId);

  if (liveSubscription) {
    try {
      await syncBillingStateFromSubscriptionId(liveSubscription.id);
    } catch {
      throw new BillingFlowError(
        billingErrorCodes.error,
        "Stripe already has a live subscription for this workspace, but Sunder could not resynchronize its local billing state.",
      );
    }

    throw new BillingFlowError(
      billingErrorCodes.alreadySubscribed,
      "Active paid subscriptions must be managed through the billing portal.",
    );
  }

  const baseUrl = resolveAppBaseUrl();

  const session = await getStripeClient().checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: false,
    success_url: `${baseUrl}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?billing=canceled`,
    client_reference_id: context.clientId,
    metadata: {
      clientId: context.clientId,
    },
    subscription_data: {
      metadata: {
        clientId: context.clientId,
      },
      trial_period_days: billingPlanCatalog[planName].trialDays || undefined,
    },
  });

  if (!session.url) {
    throw new Error("Stripe Checkout did not return a hosted session url.");
  }

  await captureServerEvent({
    distinctId: context.clientId,
    event: "checkout_started",
    properties: {
      plan_name: planName,
      billing_interval: price.recurring?.interval ?? "month",
    },
  });

  return session.url;
}

export async function createCustomerPortalSession(): Promise<string> {
  const { client } = await requireCurrentClientContext();

  if (!client.stripe_customer_id) {
    redirect("/pricing");
  }

  const session = await getStripeClient().billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: `${resolveAppBaseUrl()}/settings`,
  });

  return session.url;
}

function buildBillingUpdateFromSubscription(args: {
  customerId: string;
  planName: PaidBillingPlanName | null;
  productId: string | null;
  status: Stripe.Subscription.Status;
}): Pick<
  Database["public"]["Tables"]["clients"]["Update"],
  "plan_name" | "stripe_customer_id" | "stripe_product_id" | "stripe_subscription_id" | "subscription_status"
> {
  if (terminalStatuses.has(args.status)) {
    return {
      stripe_customer_id: args.customerId,
      stripe_subscription_id: null,
      stripe_product_id: null,
      plan_name: null,
      subscription_status: args.status,
    };
  }

  return {
    stripe_customer_id: args.customerId,
    stripe_subscription_id: null,
    stripe_product_id: args.productId,
    plan_name: args.planName,
    subscription_status: args.status,
  };
}

async function findClientForSubscription(args: {
  customerId: string;
  metadataClientId?: string | undefined;
}): Promise<ClientBillingRow | null> {
  const supabaseAdmin = await createAdminClient();
  const customerLookup = await supabaseAdmin
    .from("clients")
    .select(clientBillingSelect)
    .eq("stripe_customer_id", args.customerId)
    .maybeSingle();

  if (customerLookup.error) {
    throw new Error(`Failed to load client by Stripe customer id: ${customerLookup.error.message}`);
  }

  if (customerLookup.data) {
    return customerLookup.data;
  }

  if (!args.metadataClientId) {
    return null;
  }

  const metadataLookup = await supabaseAdmin
    .from("clients")
    .select(clientBillingSelect)
    .eq("client_id", args.metadataClientId)
    .maybeSingle();

  if (metadataLookup.error) {
    throw new Error(`Failed to load client by metadata client id: ${metadataLookup.error.message}`);
  }

  return metadataLookup.data ?? null;
}

async function persistBillingUpdate(
  clientId: string,
  update: Database["public"]["Tables"]["clients"]["Update"],
): Promise<void> {
  const supabaseAdmin = await createAdminClient();
  const { error } = await supabaseAdmin
    .from("clients")
    .update(update)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`Failed to persist Stripe billing state: ${error.message}`);
  }
}

export async function syncBillingStateFromSubscriptionId(
  subscriptionId: string,
): Promise<SyncedBillingState> {
  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });
  const customerId = resolveCustomerId(subscription.customer);
  const primaryPrice = subscription.items.data[0]?.price ?? null;
  const primaryProduct = getExpandedProduct(primaryPrice?.product ?? null);
  const planName = primaryPrice?.id
    ? getPaidBillingPlanNameForPriceId(primaryPrice.id)
    : null;
  const client = await findClientForSubscription({
    customerId,
    metadataClientId: subscription.metadata.clientId,
  });

  if (!terminalStatuses.has(subscription.status) && (!primaryProduct || !planName)) {
    throw new Error("Stripe subscription product must map to a supported paid plan.");
  }

  if (!client) {
    throw new Error(
      `No matching client found for Stripe subscription sync (${subscriptionId}).`,
    );
  }

  const update = buildBillingUpdateFromSubscription({
    customerId,
    planName,
    productId: primaryProduct?.id ?? null,
    status: subscription.status,
  });

  update.stripe_subscription_id = terminalStatuses.has(subscription.status)
    ? null
    : subscription.id;

  await persistBillingUpdate(client.client_id, update);

  return {
    clientId: client.client_id,
    planName,
    stripeCustomerId: customerId,
    subscriptionId: update.stripe_subscription_id,
    subscriptionStatus: subscription.status,
    trial: subscription.status === "trialing",
  };
}

export async function syncBillingStateFromDeletedSubscription(
  subscription: Stripe.Subscription,
): Promise<SyncedBillingState> {
  const customerId = resolveCustomerId(subscription.customer);
  const client = await findClientForSubscription({
    customerId,
    metadataClientId: subscription.metadata.clientId,
  });

  if (!client) {
    throw new Error(
      `No matching client found for deleted Stripe subscription (${subscription.id}).`,
    );
  }

  await persistBillingUpdate(client.client_id, {
    stripe_customer_id: customerId,
    stripe_subscription_id: null,
    stripe_product_id: null,
    plan_name: null,
    subscription_status: subscription.status,
  });
  const previousPlanName = client.plan_name;

  return {
    clientId: client.client_id,
    planName:
      previousPlanName && isPaidBillingPlanName(previousPlanName)
        ? previousPlanName
        : null,
    stripeCustomerId: customerId,
    subscriptionId: null,
    subscriptionStatus: subscription.status,
    trial: false,
  };
}

export async function syncBillingStateFromCheckoutSession(sessionId: string): Promise<void> {
  const session = await getStripeClient().checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.mode !== "subscription") {
    throw new Error("Stripe checkout session was not created in subscription mode.");
  }

  const subscriptionId = resolveSubscriptionId(session.subscription);

  if (!subscriptionId) {
    throw new Error("Stripe checkout session did not produce a subscription id.");
  }

  await syncBillingStateFromSubscriptionId(subscriptionId);
}
