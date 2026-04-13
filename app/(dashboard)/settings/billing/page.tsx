/**
 * Standard SaaS billing page: one card showing the current plan + a single
 * button that opens the Stripe Customer Portal. All payment methods, plan
 * changes, invoices, and cancellation flows live in Stripe.
 *
 * @module app/(dashboard)/settings/billing/page
 */
import Link from "next/link";

import { AlertCircle, CheckCircle } from "@/components/icons/lucide-compat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { customerPortalAction } from "@/lib/stripe/actions";
import {
  buildBillingViewModel,
  type BillingPrimaryAction,
  type BillingViewState,
} from "@/lib/stripe/billing-view-model";
import { loadCurrentBillingState } from "@/lib/stripe/stripe";

import { SubmitButton } from "../../pricing/submit-button";

const stateBadge: Record<
  BillingViewState,
  { label: string; variant: "info" | "success" | "warning" | "destructive" | "outline" } | null
> = {
  free: null,
  trialing: { label: "Trial", variant: "info" },
  active: { label: "Active", variant: "success" },
  canceling: { label: "Canceling", variant: "warning" },
  past_due: { label: "Payment failed", variant: "destructive" },
  canceled: { label: "Canceled", variant: "outline" },
};

const ctaLabel: Record<BillingPrimaryAction, string> = {
  manage: "Manage subscription",
  upgrade: "Choose a plan",
  update_payment: "Update payment",
};

interface BillingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function renderBillingAlert(billingParam: string | string[] | undefined) {
  if (typeof billingParam !== "string") {
    return null;
  }

  if (billingParam === "success") {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Plan activated.</AlertTitle>
        <AlertDescription>
          Your subscription is now active. It may take a moment for the page to reflect the
          latest plan.
        </AlertDescription>
      </Alert>
    );
  }

  if (billingParam === "portal-error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Billing portal unavailable.</AlertTitle>
        <AlertDescription>
          Could not open the Stripe Customer Portal. Please try again or contact support.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const billingAlert = renderBillingAlert(resolvedSearchParams.billing);
  const client = await loadCurrentBillingState();
  const view = buildBillingViewModel(client);
  const badge = stateBadge[view.state];

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your plan, payment, and invoices in Stripe.
          </p>
        </div>

        {billingAlert}

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
              {view.planName === "Free" ? "Free" : `Sunder ${view.planName}`}
              {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {view.planName !== "Free" ? (
              <p className="font-medium text-foreground">
                S${view.monthlyPriceSgd} per month
              </p>
            ) : null}
            <p>{view.statusLine}</p>
          </CardContent>

          <CardFooter className="flex justify-end border-t pt-4">
            {view.primaryAction === "upgrade" ? (
              <Button asChild>
                <Link href="/pricing">{ctaLabel[view.primaryAction]}</Link>
              </Button>
            ) : (
              <form action={customerPortalAction}>
                <SubmitButton
                  idleLabel={ctaLabel[view.primaryAction]}
                  pendingLabel="Opening portal..."
                />
              </form>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
