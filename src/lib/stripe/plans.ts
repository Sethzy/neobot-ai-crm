/**
 * Billing plan catalog shared by Stripe sync logic and dashboard surfaces.
 * @module lib/stripe/plans
 */

export const billingPlanNames = ["Free", "Pro", "Max"] as const;

export type BillingPlanName = (typeof billingPlanNames)[number];
export type PaidBillingPlanName = Exclude<BillingPlanName, "Free">;

export interface BillingPlanDefinition {
  name: BillingPlanName;
  monthlyPriceSgd: number;
  trialDays: number;
  isFree: boolean;
  summary: string;
  highlights: string[];
}

export const billingPlanCatalog: Record<BillingPlanName, BillingPlanDefinition> = {
  Free: {
    name: "Free",
    monthlyPriceSgd: 0,
    trialDays: 0,
    isFree: true,
    summary: "Use chat, CRM, and memory without a Stripe subscription.",
    highlights: [
      "Chat with Sunder from day one",
      "CRM updates and memory capture",
      "Upgrade to paid plans when you want autopilot scale",
    ],
  },
  Pro: {
    name: "Pro",
    monthlyPriceSgd: 25,
    trialDays: 7,
    isFree: false,
    summary: "For individual agents who want dependable daily execution.",
    highlights: [
      "7-day trial before the first charge",
      "Stripe-hosted checkout and customer portal",
      "Recurring billing synced into the client record",
    ],
  },
  Max: {
    name: "Max",
    monthlyPriceSgd: 99,
    trialDays: 7,
    isFree: false,
    summary: "For heavier automation volume and a wider operating envelope.",
    highlights: [
      "Everything in Pro with more headroom",
      "Billing stays self-serve in the customer portal",
      "Same webhook-backed lifecycle sync as other paid plans",
    ],
  },
};

export const paidBillingPlanNames: readonly PaidBillingPlanName[] = ["Pro", "Max"];

export function isPaidBillingPlanName(value: string): value is PaidBillingPlanName {
  return paidBillingPlanNames.includes(value as PaidBillingPlanName);
}

const billingPlanPriceEnvironmentVariables: Record<PaidBillingPlanName, string> = {
  Pro: "STRIPE_PRO_PRICE_ID",
  Max: "STRIPE_MAX_PRICE_ID",
};

export function getBillingPlanPriceId(planName: PaidBillingPlanName): string | null {
  const priceId = process.env[billingPlanPriceEnvironmentVariables[planName]]?.trim();
  return priceId ? priceId : null;
}

export function getPaidBillingPlanNameForPriceId(
  priceId: string,
): PaidBillingPlanName | null {
  return (
    paidBillingPlanNames.find(
      (planName) => getBillingPlanPriceId(planName) === priceId,
    ) ?? null
  );
}
