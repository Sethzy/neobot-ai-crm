/**
 * Linked deal cards used by people and company detail pages.
 * @module components/crm/detail/linked-deals-section
 */
"use client";

import Link from "next/link";

import { StageBadge } from "@/components/crm/stage-badge";
import { formatCrmPrice } from "@/lib/crm/display";

export interface LinkedDealItem {
  id: string;
  address: string;
  stage: string;
  price: number | null;
  href: string;
}

interface LinkedDealsSectionProps {
  deals: LinkedDealItem[];
  emptyLabel?: string;
}

/**
 * Renders linked deals as compact clickable cards.
 */
export function LinkedDealsSection({
  deals,
  emptyLabel = "No linked deals yet.",
}: LinkedDealsSectionProps) {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {deals.map((deal) => (
        <Link
          key={deal.id}
          href={deal.href}
          className="rounded-lg border border-border/40 bg-card p-4 shadow-sm transition-colors hover:bg-muted/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{deal.address}</p>
              <p className="mt-2 text-sm text-muted-foreground">{formatCrmPrice(deal.price)}</p>
            </div>
            <StageBadge stage={deal.stage} />
          </div>
        </Link>
      ))}
    </div>
  );
}
