/**
 * Authenticated pricing page for Stripe-backed plan upgrades.
 * @module app/(dashboard)/pricing/page
 */
import { checkoutAction, customerPortalAction } from "@/lib/stripe/actions";
import { billingPlanCatalog, billingPlanNames } from "@/lib/stripe/plans";
import { getBillingSummary, listStripePlans } from "@/lib/stripe/stripe";
import { formatMessageQuotaResetDate } from "@/lib/usage/message-quota";
import { loadCurrentMessageQuota } from "@/lib/usage/message-quota-server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { SubmitButton } from "./submit-button";

function normalizeSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount === null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-SG", {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(amount / 100);
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function getBillingNotice(status: string | null): {
  description: string;
  title: string;
  variant: "default" | "destructive";
} | null {
  switch (status) {
    case "canceled":
      return {
        description: "Checkout was canceled. Your account is still on the free plan.",
        title: "No billing changes were made.",
        variant: "default",
      };
    case "error":
    case "missing-session":
      return {
        description: "Stripe returned without enough data to sync the checkout. Try again or use the billing portal if the charge already succeeded.",
        title: "We could not finish syncing billing.",
        variant: "destructive",
      };
    case "invalid-plan":
      return {
        description: "The selected plan was not valid. Refresh the page and try again.",
        title: "Invalid plan selection.",
        variant: "destructive",
      };
    case "already-subscribed":
      return {
        description:
          "Stripe already has a live subscription for this workspace. Use the billing portal instead of starting another checkout.",
        title: "Billing is already active.",
        variant: "default",
      };
    default:
      return null;
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] }>;
}) {
  const { billing } = await searchParams;
  const billingSummary = await getBillingSummary();
  const messageQuota = await loadCurrentMessageQuota();
  const billingNotice = getBillingNotice(normalizeSearchParam(billing));

  const { paidPlans, pricingError } = await listStripePlans()
    .then((plans) => ({
      paidPlans: plans,
      pricingError: null,
    }))
    .catch((error: unknown) => ({
      paidPlans: [],
      pricingError:
        error instanceof Error ? error.message : "Failed to load Stripe plans.",
    }));

  const paidPlanMap = new Map(paidPlans.map((plan) => [plan.name, plan]));

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="max-w-5xl">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Plans &amp; Billing
            </h1>
            <p className="mt-2 text-sm text-muted-foreground/80">
              Start on Free, then move paid plan changes and cancellations through Stripe&apos;s
              hosted billing flows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={billingSummary.hasPaidSubscription ? "success" : "secondary"}>
              Current plan: {billingSummary.currentPlanName}
            </Badge>
            <Badge variant="outline">
              Status: {formatStatusLabel(billingSummary.currentPlanStatus)}
            </Badge>
          </div>
        </div>

        {billingNotice ? (
          <Alert className="mt-6" variant={billingNotice.variant}>
            <AlertTitle>{billingNotice.title}</AlertTitle>
            <AlertDescription>{billingNotice.description}</AlertDescription>
          </Alert>
        ) : null}

        {billingSummary.hasPaidSubscription ? (
          <Alert className="mt-6">
            <AlertTitle>Paid subscriptions are managed in Stripe.</AlertTitle>
            <AlertDescription>
              Upgrades, downgrades, payment method updates, and cancellations go through the
              Stripe Customer Portal so billing stays canonical in one place.
            </AlertDescription>
          </Alert>
        ) : null}

        {pricingError ? (
          <Alert className="mt-6" variant="destructive">
            <AlertTitle>Stripe plans are not ready yet.</AlertTitle>
            <AlertDescription>{pricingError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {billingPlanNames.map((planName) => {
            const planDefinition = billingPlanCatalog[planName];
            const isFreePlan = planDefinition.isFree;
            const stripePlan =
              planName === "Free" ? undefined : paidPlanMap.get(planName);
            const isCurrentPlan = billingSummary.currentPlanName === planName;
            const trialLabel = isFreePlan
              ? "Included"
              : `${planDefinition.trialDays}-day trial`;
            const canCheckout =
              !isFreePlan &&
              Boolean(stripePlan?.priceId) &&
              !billingSummary.hasPaidSubscription;

            return (
              <Card
                key={planName}
                className={
                  isCurrentPlan
                    ? "border-primary/40 shadow-sm ring-primary/20"
                    : "border-border/60 shadow-sm"
                }
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{planName}</CardTitle>
                      <CardDescription className="mt-2">
                        {planDefinition.summary}
                      </CardDescription>
                    </div>
                    {isCurrentPlan ? <Badge variant="success">Current</Badge> : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div>
                    <div className="text-3xl font-semibold tracking-tight text-foreground">
                      {isFreePlan
                        ? "Free"
                        : stripePlan
                          ? `${formatCurrency(stripePlan.amount, stripePlan.currency)}/mo`
                          : "Unavailable"}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{trialLabel}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {planDefinition.monthlyMessageLimit} messages / month
                    </p>
                    {isCurrentPlan && messageQuota ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {messageQuota.messagesUsed} used · {messageQuota.messagesRemaining}{" "}
                        remaining · resets {formatMessageQuotaResetDate(messageQuota.nextResetDate)}
                      </p>
                    ) : null}
                  </div>

                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {planDefinition.highlights.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="mt-auto flex-col gap-3">
                  {isCurrentPlan ? (
                    <SubmitButton
                      disabled
                      idleLabel="Current plan"
                      pendingLabel="Current plan"
                      variant="outline"
                    />
                  ) : billingSummary.hasPaidSubscription ? (
                    <form action={customerPortalAction} className="w-full">
                      <SubmitButton
                        idleLabel="Manage in portal"
                        pendingLabel="Opening portal..."
                        variant="outline"
                      />
                    </form>
                  ) : canCheckout ? (
                    <form action={checkoutAction} className="w-full">
                      <input type="hidden" name="priceId" value={stripePlan?.priceId ?? ""} />
                      <SubmitButton
                        idleLabel={`Start ${planName} trial`}
                        pendingLabel="Redirecting..."
                      />
                    </form>
                  ) : (
                    <SubmitButton
                      disabled
                      idleLabel={isFreePlan ? "Included on Free" : "Unavailable"}
                      pendingLabel="Unavailable"
                      variant="outline"
                    />
                  )}

                  {planName === "Free" && billingSummary.hasPaidSubscription ? (
                    <p className="text-xs text-muted-foreground">
                      Downgrades back to Free happen inside the Stripe portal.
                    </p>
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
