/**
 * Deal detail page with read-only metadata and interaction timeline.
 * @module app/(dashboard)/crm/deals/[dealId]/page
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DollarSign, StickyNote, User } from "lucide-react";

import { InteractionTimeline } from "@/components/crm/interaction-timeline";
import { StageBadge } from "@/components/crm/stage-badge";
import { Button } from "@/components/ui/button";
import { useDealInteractions } from "@/hooks/use-contact-relations";
import { useDeal as useDealQuery } from "@/hooks/use-deals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatContactFullName, formatCrmDate, formatCrmPrice } from "@/lib/crm/display";

export default function DealDetailPage() {
  const params = useParams<{ dealId: string }>();
  const dealId = params?.dealId ?? "";
  const {
    data: deal,
    isLoading,
    isError,
    refetch: refetchDeal,
  } = useDealQuery(dealId);
  const {
    data: interactions,
    isLoading: isInteractionsLoading,
    isError: isInteractionsError,
    refetch: refetchInteractions,
  } = useDealInteractions(dealId);
  const isMismatchedDeal = Boolean(deal && deal.deal_id !== dealId);

  if (!dealId) {
    return null;
  }

  if (isLoading || isMismatchedDeal || (!deal && !isError)) {
    return (
      <div className="flex h-full animate-pulse flex-col bg-muted/5 px-4 py-6 md:px-12 md:py-10">
        <div className="mb-2 h-3 w-32 rounded bg-muted/40" />
        <div className="h-7 w-64 rounded bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="px-4 py-6 text-center md:px-12 md:py-10">
        <p className="text-destructive">Deal not found</p>
        <Link href="/crm/deals" className="mt-4 inline-block text-primary hover:underline">
          Back to Deals
        </Link>
      </div>
    );
  }

  const primaryContact = deal.deal_contacts?.find((dc) => dc.is_primary)?.contacts
    ?? deal.deal_contacts?.[0]?.contacts
    ?? null;
  const contactName = primaryContact ? formatContactFullName(primaryContact) : null;

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <nav className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
        <Link href="/crm" className="transition-colors hover:text-foreground">
          CRM
        </Link>
        <span className="font-light text-muted-foreground/30">/</span>
        <Link href="/crm/deals" className="transition-colors hover:text-foreground">
          Deals
        </Link>
        <span className="font-light text-muted-foreground/30">/</span>
        <span className="font-semibold text-foreground/70">{deal.address}</span>
      </nav>

      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{deal.address}</h1>
        <StageBadge stage={deal.stage} />
      </div>

      {isError ? (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">Unable to refresh deal details</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              void refetchDeal();
            }}
          >
            Retry Deal
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              <DollarSign className="h-3.5 w-3.5" />
              Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold text-foreground/90">{formatCrmPrice(deal.price)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              <User className="h-3.5 w-3.5" />
              Contact
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contactName ? (
              <p className="text-sm text-foreground/80">{contactName}</p>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80">{formatCrmDate(deal.created_at)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80">{formatCrmDate(deal.updated_at)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deal.notes ? (
            <p className="text-sm text-foreground/80">{deal.notes}</p>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Interactions</h2>
        <div className="mt-4">
          {isInteractionsLoading ? (
            <div className="animate-pulse space-y-3">
              <p className="text-sm text-muted-foreground">Loading interactions...</p>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-14 rounded-lg bg-muted/30" />
              ))}
            </div>
          ) : isInteractionsError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">Unable to load interactions</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  void refetchInteractions();
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <InteractionTimeline interactions={interactions ?? []} />
          )}
        </div>
      </section>
    </div>
  );
}
