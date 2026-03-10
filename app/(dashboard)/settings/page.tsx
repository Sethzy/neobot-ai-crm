/**
 * Settings shell with the first production-ready billing section.
 * @module app/(dashboard)/settings/page
 */
import Link from "next/link";

import { AlertCircle, CheckCircle, ExternalLink, Sparkles } from "@/components/icons/lucide-compat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { customerPortalAction } from "@/lib/stripe/actions";
import { loadCurrentBillingState } from "@/lib/stripe/stripe";

import { SubmitButton } from "../pricing/submit-button";

interface SettingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function renderConnectionAlert(
  connectionParam: string | string[] | undefined,
  reasonParam: string | string[] | undefined,
) {
  if (typeof connectionParam !== "string") {
    return null;
  }

  if (connectionParam === "success") {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Connection updated.</AlertTitle>
        <AlertDescription>
          The external account handshake completed and the connection state was saved.
        </AlertDescription>
      </Alert>
    );
  }

  if (connectionParam === "error") {
    const reason =
      typeof reasonParam === "string" && reasonParam.trim() ? reasonParam.trim() : "unknown";

    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Connection update failed.</AlertTitle>
        <AlertDescription>
          The callback returned an error state: <span className="font-medium">{reason}</span>.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

function renderBillingAlert(billingParam: string | string[] | undefined) {
  if (billingParam === "success") {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Billing updated.</AlertTitle>
        <AlertDescription>
          Stripe confirmed the checkout and Sunder synced the latest subscription state.
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
          Sunder could not open the Stripe Customer Portal right now. Try again in a moment.
        </AlertDescription>
      </Alert>
    );
  }

  if (typeof billingParam !== "string") {
    return null;
  }

  return null;
}

function getStatusVariant(status: string | null) {
  switch (status) {
    case "active":
      return "success" as const;
    case "trialing":
      return "info" as const;
    case "past_due":
      return "warning" as const;
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const client = await loadCurrentBillingState();
  const connectionAlert = renderConnectionAlert(
    resolvedSearchParams.connection,
    resolvedSearchParams.reason,
  );
  const billingAlert = renderBillingAlert(resolvedSearchParams.billing);
  const currentPlanName = client.plan_name ?? "Free";
  const statusLabel = client.subscription_status?.replace(/_/g, " ") ?? "free";
  const hasPortal = Boolean(client.stripe_customer_id);

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="space-y-3">
          <Badge variant="outline" className="w-fit">
            Settings
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Workspace controls</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Billing is the first settings surface to ship here. Stripe remains the source of
              truth for paid subscriptions, while Sunder mirrors the current plan into the client
              row for product logic and future gating.
            </p>
          </div>
        </div>

        {connectionAlert}
        {billingAlert}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="border-emerald-500/15 bg-linear-to-br from-emerald-500/6 via-card to-card shadow-sm">
            <CardHeader className="gap-2">
              <CardDescription>Billing</CardDescription>
              <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
                {currentPlanName}
                <Badge variant={getStatusVariant(client.subscription_status)}>{statusLabel}</Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                {currentPlanName === "Free"
                  ? "Free is the default starting state. There is no Stripe subscription until you upgrade."
                  : "This workspace is attached to a Stripe customer and can be managed in the hosted portal."}
              </p>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-background/80 p-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                    Plan
                  </p>
                  <p className="font-medium text-foreground">{currentPlanName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                    Subscription status
                  </p>
                  <p className="font-medium text-foreground">{statusLabel}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                    Stripe customer
                  </p>
                  <p className="truncate font-medium text-foreground">
                    {client.stripe_customer_id ?? "Not created yet"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                    Subscription id
                  </p>
                  <p className="truncate font-medium text-foreground">
                    {client.stripe_subscription_id ?? "No active paid subscription"}
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col items-stretch gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="outline">
                <Link href="/pricing">
                  View plans
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              {hasPortal ? (
                <form action={customerPortalAction}>
                  <SubmitButton
                    idleLabel="Manage billing in Stripe"
                    pendingLabel="Opening portal..."
                  />
                </form>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Upgrade from the pricing page to create a Stripe billing profile.
                </span>
              )}
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="gap-2">
              <CardDescription>Roadmap</CardDescription>
              <CardTitle className="text-xl">More settings will land here next.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Connections, account preferences, and future workspace controls still have room to
                grow. Billing ships first because it needs end-to-end routes, webhooks, and a user
                surface today.
              </p>
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-emerald-700" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">What exists right now</p>
                    <p>
                      Billing plan status, Stripe portal access, and connection callback feedback
                      are now available from this route.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
