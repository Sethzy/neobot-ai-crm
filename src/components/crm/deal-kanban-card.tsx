/**
 * Card body for deal items rendered inside kanban/calendar views.
 * Styled to match the Mercato pipeline card hierarchy.
 * @module components/crm/deal-kanban-card
 */
import type { ReactNode } from "react";

import type { DealWithContact } from "@/hooks/use-deals";
import { formatContactFullName, formatCrmDate, formatCrmPrice, formatDealStageLabel } from "@/lib/crm/display";

interface DealKanbanCardProps {
  /** Deal row rendered as card content. */
  deal: DealWithContact;
  /** Optional footer actions rendered beneath the deal summary. */
  footer?: ReactNode;
}

export function DealKanbanCard({ deal, footer }: DealKanbanCardProps) {
  const primaryContact =
    deal.deal_contacts?.find((dc) => dc.is_primary) ?? deal.deal_contacts?.[0];
  const contactName = primaryContact?.contacts
    ? formatContactFullName(primaryContact.contacts)
    : null;
  const companyName = deal.companies?.name ?? null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="line-clamp-2 text-sm font-medium text-foreground">
        {deal.address}
      </h3>

      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {formatDealStageLabel(deal.stage)}
      </p>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span>Value</span>
          <span className="font-medium text-foreground">{formatCrmPrice(deal.price)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Updated</span>
          <span className="font-medium text-foreground">{formatCrmDate(deal.updated_at)}</span>
        </div>
      </div>

      {contactName || companyName ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {contactName ? (
            <span className="rounded-full bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10">
              {contactName}
            </span>
          ) : null}
          {companyName ? (
            <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs text-secondary-foreground transition-colors hover:bg-secondary/20">
              {companyName}
            </span>
          ) : null}
        </div>
      ) : null}

      {deal.notes?.trim() ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {deal.notes}
        </p>
      ) : null}

      {footer ? <div className="pt-1">{footer}</div> : null}
    </div>
  );
}
