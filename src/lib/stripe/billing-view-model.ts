/**
 * Pure helper that maps a `clients` table billing row into the props the
 * /settings/workspace/billing page renders. All branching logic for plan/state/copy
 * lives here so the page itself stays a dumb Server Component.
 *
 * @module lib/stripe/billing-view-model
 */
import type { Database } from "@/types/database";

import {
  billingPlanCatalog,
  isPaidBillingPlanName,
  type BillingPlanName,
} from "./plans";

/** All the discrete states the billing page knows how to render. */
export type BillingViewState =
  | "free"
  | "trialing"
  | "active"
  | "canceling"
  | "past_due"
  | "canceled";

/** What the primary CTA on the page should do. */
export type BillingPrimaryAction = "manage" | "upgrade" | "update_payment";

export interface BillingViewModel {
  state: BillingViewState;
  planName: BillingPlanName;
  monthlyPriceSgd: number;
  /** ISO date string the page can re-format if it ever wants to, or null. */
  periodEndsAt: string | null;
  /** True iff the client has a Stripe customer (so the portal is reachable). */
  hasStripeCustomer: boolean;
  /** Localized "what comes next" sentence — e.g. "Trial ends 18 April 2026." */
  statusLine: string;
  primaryAction: BillingPrimaryAction;
}

/** Subset of the `clients` row that this helper actually reads. */
type BillingRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  | "cancel_at_period_end"
  | "current_period_end"
  | "plan_name"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "subscription_status"
>;

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Singapore",
});

function formatPeriodEnd(iso: string | null): string {
  if (!iso) {
    return "soon";
  }
  return dateFormatter.format(new Date(iso));
}

/**
 * Maps a `clients` row into a render-ready view model for /settings/workspace/billing.
 *
 * Branching priority (first match wins):
 *   1. terminal states (`canceled`, `incomplete_expired`) → "canceled"
 *   2. no customer / no paid plan_name → "free"
 *   3. dunning states (`past_due`, `unpaid`) → "past_due"
 *   4. `cancel_at_period_end` flag → "canceling"
 *   5. `trialing` status → "trialing"
 *   6. anything else → "active"
 */
export function buildBillingViewModel(client: BillingRow): BillingViewModel {
  const status = client.subscription_status;
  const hasStripeCustomer = Boolean(client.stripe_customer_id);
  const periodEndCopy = formatPeriodEnd(client.current_period_end);

  const isTerminal = status === "canceled" || status === "incomplete_expired";
  const planName: BillingPlanName =
    client.plan_name && isPaidBillingPlanName(client.plan_name) && !isTerminal
      ? client.plan_name
      : "Free";

  if (isTerminal) {
    return {
      state: "canceled",
      planName: "Free",
      monthlyPriceSgd: 0,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: "Your subscription has ended.",
      primaryAction: "upgrade",
    };
  }

  if (planName === "Free") {
    return {
      state: "free",
      planName: "Free",
      monthlyPriceSgd: 0,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: "You're on the Free plan.",
      primaryAction: "upgrade",
    };
  }

  const planDef = billingPlanCatalog[planName];

  if (status === "past_due" || status === "unpaid") {
    return {
      state: "past_due",
      planName,
      monthlyPriceSgd: planDef.monthlyPriceSgd,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: "Payment failed. Update your card to keep access.",
      primaryAction: "update_payment",
    };
  }

  if (client.cancel_at_period_end) {
    return {
      state: "canceling",
      planName,
      monthlyPriceSgd: planDef.monthlyPriceSgd,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: `Cancels on ${periodEndCopy}.`,
      primaryAction: "manage",
    };
  }

  if (status === "trialing") {
    return {
      state: "trialing",
      planName,
      monthlyPriceSgd: planDef.monthlyPriceSgd,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: `Trial ends ${periodEndCopy}.`,
      primaryAction: "manage",
    };
  }

  return {
    state: "active",
    planName,
    monthlyPriceSgd: planDef.monthlyPriceSgd,
    periodEndsAt: client.current_period_end,
    hasStripeCustomer,
    statusLine: `Renews on ${periodEndCopy}.`,
    primaryAction: "manage",
  };
}
