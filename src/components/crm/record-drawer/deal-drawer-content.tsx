/**
 * Deal-specific record drawer body.
 * @module components/crm/record-drawer/deal-drawer-content
 */
"use client";

import { InteractionTimeline } from "@/components/crm/interaction-timeline";
import { StageBadge } from "@/components/crm/stage-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealInteractions } from "@/hooks/use-contact-relations";
import { useDeal } from "@/hooks/use-deals";
import { formatContactFullName, formatCrmPrice } from "@/lib/crm/display";

import { DrawerSection } from "./drawer-section";

interface DealDrawerContentProps {
  /** Deal id selected in the drawer. */
  dealId: string;
}

/**
 * Renders deal details, linked contacts, and interaction timeline.
 */
export function DealDrawerContent({ dealId }: DealDrawerContentProps) {
  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: interactions = [] } = useDealInteractions(dealId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (isError || !deal) {
    return <div className="p-6 text-sm text-destructive">Failed to load deal.</div>;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{deal.address}</h2>
        <StageBadge stage={deal.stage} />
      </header>

      <DrawerSection title="Details">
        <div className="space-y-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">Price</span>
            <span className="tabular-nums text-foreground/80">{formatCrmPrice(deal.price)}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">Notes</span>
            <span className="max-w-[220px] text-right text-foreground/80">{deal.notes ?? "—"}</span>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Contacts">
        {deal.deal_contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked contacts.</p>
        ) : (
          <div className="space-y-2">
            {deal.deal_contacts.map((dealContact) => (
              <div
                key={dealContact.contact_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground/90">
                  {dealContact.contacts ? formatContactFullName(dealContact.contacts) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{dealContact.role}</span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Activity">
        <InteractionTimeline interactions={interactions} />
      </DrawerSection>
    </div>
  );
}

