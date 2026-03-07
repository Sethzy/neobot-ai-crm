/**
 * Card body for deal items rendered inside kanban/calendar views.
 * Styled to match Twenty CRM card layout with avatar initials.
 * @module components/crm/deal-kanban-card
 */
import { AppIcon } from "@/components/icons/app-icons";
import type { DealWithContact } from "@/hooks/use-deals";
import { formatContactFullName, formatCrmDate, formatCrmPrice, getAvatarColor } from "@/lib/crm/display";

interface DealKanbanCardProps {
  /** Deal row rendered as card content. */
  deal: DealWithContact;
}

export function DealKanbanCard({ deal }: DealKanbanCardProps) {
  const primaryContact =
    deal.deal_contacts?.find((dc) => dc.is_primary) ?? deal.deal_contacts?.[0];
  const contactName = primaryContact?.contacts
    ? formatContactFullName(primaryContact.contacts)
    : null;
  const sourceLabel = deal.notes?.trim().length ? deal.notes : "System";
  const initial = deal.address.charAt(0).toUpperCase();

  return (
    <div className="space-y-1.5">
      {/* Title with avatar initial */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white ${getAvatarColor(deal.address)}`}
        >
          {initial}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {deal.address}
        </span>
      </div>

      {/* Metadata rows */}
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <AppIcon name="money" className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums">{formatCrmPrice(deal.price)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AppIcon name="schedule" className="h-3.5 w-3.5 shrink-0" />
          <span>{formatCrmDate(deal.updated_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AppIcon name="building" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{sourceLabel}</span>
        </div>
        {contactName ? (
          <div className="flex items-center gap-1.5">
            <AppIcon name="person" className="h-3.5 w-3.5 shrink-0" />
            <span className="inline-flex items-center gap-1.5 truncate">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-medium text-white ${getAvatarColor(contactName)}`}
              >
                {contactName.charAt(0).toUpperCase()}
              </span>
              {contactName}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
