/**
 * Linked deals panel for a contact detail page.
 * @module components/crm/contact-deals
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactDeals } from "@/hooks/use-contact-relations";
import { dealStageBadgeVariantMap, formatCrmDate, formatCrmPrice } from "@/lib/crm/display";

interface ContactDealsProps {
  contactId: string;
}

export function ContactDeals({ contactId }: ContactDealsProps) {
  const { data: deals = [], isLoading, isError, refetch } = useContactDeals(contactId);

  if (isLoading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b border-border/40 bg-muted/20">
            <tr>
              {["Address", "Stage", "Price", "Updated"].map((label) => (
                <th
                  key={label}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border/30">
                <td className="px-4 py-3">
                  <Skeleton className={`h-3.5 ${["w-36", "w-44", "w-28"][rowIndex % 3]}`} style={{ animationDelay: `${rowIndex * 40}ms` }} />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-20 rounded-full" style={{ animationDelay: `${rowIndex * 40 + 20}ms` }} />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className={`h-3.5 ${["w-16", "w-20", "w-14"][rowIndex % 3]}`} style={{ animationDelay: `${rowIndex * 40 + 40}ms` }} />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-20" style={{ animationDelay: `${rowIndex * 40 + 60}ms` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">Unable to load linked deals</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            void refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (deals.length === 0) {
    return <p className="text-sm text-muted-foreground">No linked deals</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Address
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Stage
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {deals.map((dc) => {
            const deal = dc.deals;

            return (
              <tr key={dc.deal_contact_id} className="border-t border-border/30">
                <td className="px-4 py-3 text-sm text-foreground/80">{deal?.address ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">
                  {deal ? <Badge variant={dealStageBadgeVariantMap[deal.stage]}>{deal.stage}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-foreground/80">{deal ? formatCrmPrice(deal.amount) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{deal ? formatCrmDate(deal.updated_at) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
