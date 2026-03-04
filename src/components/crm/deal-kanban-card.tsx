/**
 * Card body for deal items rendered inside list kanban/calendar views.
 * @module components/crm/deal-kanban-card
 */
import type { DealWithContact } from "@/hooks/use-deals";
import { formatContactFullName, formatCrmPrice } from "@/lib/crm/display";

interface DealKanbanCardProps {
  /** Deal row rendered as card content. */
  deal: DealWithContact;
}

export function DealKanbanCard({ deal }: DealKanbanCardProps) {
  const primaryContact = deal.deal_contacts?.find((dealContact) => dealContact.is_primary)
    ?? deal.deal_contacts?.[0];

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{deal.address}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{formatCrmPrice(deal.price)}</p>
      {primaryContact?.contacts ? (
        <p className="text-xs text-muted-foreground">{formatContactFullName(primaryContact.contacts)}</p>
      ) : null}
    </div>
  );
}
