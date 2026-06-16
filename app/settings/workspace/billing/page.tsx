/**
 * Settings → Workspace → Billing. Shows current plan and opens the Stripe Customer Portal.
 *
 * Note: Stripe return URLs hit `/settings/billing` (preserved as a redirect shim); this is the
 * canonical destination where the billing content actually lives.
 *
 * @module app/(dashboard)/settings/workspace/billing/page
 */
import Link from "next/link";

import { AlertCircle, CheckCircle } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
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

import { SubmitButton } from "../../../(dashboard)/pricing/submit-button";

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
    <SettingsPageShell>
        <PageHeader
          title="Billing"
          description="Manage your plan, payment, and invoices in Stripe."
        />

        {billingAlert}

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription className="type-row-meta">Current plan</CardDescription>
            <CardTitle className="type-toolbar-title flex flex-wrap items-center gap-3">
              {view.planName === "Free" ? "Free" : `NeoBot ${view.planName}`}
              {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-meta text-muted-foreground">
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
    </SettingsPageShell>
  );
}
