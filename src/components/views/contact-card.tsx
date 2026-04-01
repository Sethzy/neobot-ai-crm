/**
 * Compact CRM contact summary card for agent-generated inline views.
 * Renders as a borderless content block — the outer layout (Card/Grid) provides containment.
 * @module components/views/contact-card
 */
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  avatarColorFor,
  formatCrmEnumLabel,
  getContactTypeBadgeVariant,
} from "@/lib/crm/display";
import type { Contact } from "@/lib/crm/schemas";

export interface ContactCardProps {
  name: string;
  type?: Contact["type"];
  phone?: string;
  email?: string;
  company?: string;
  /** Legacy fallback — shown only when phone/email/company are all absent. */
  subtitle?: string;
}

/** Derives 1–2 letter initials from a full name string, stripping parenthetical text. */
function getInitials(name: string): string {
  const cleaned = name.replace(/\s*\(.*?\)\s*/g, "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/**
 * Renders a compact contact card with initials avatar and CRM badge semantics.
 * Shows structured contact details (phone, email, company) below the name.
 */
export function ContactCard({ name, type, phone, email, company, subtitle }: ContactCardProps) {
  const details = [company, phone, email].filter(Boolean);
  const detailLine = details.length > 0 ? details.join(" \u00B7 ") : subtitle;

  return (
    <div className="flex items-center gap-3 py-2 px-3">
      <Avatar className="size-8 text-xs" data-testid="contact-avatar">
        <AvatarFallback className={avatarColorFor(name)}>
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium text-foreground">{name}</p>
          {detailLine ? (
            <p className="truncate text-xs text-muted-foreground">{detailLine}</p>
          ) : null}
        </div>
        {type ? (
          <Badge variant={getContactTypeBadgeVariant(type)} className="shrink-0">
            {formatCrmEnumLabel(type)}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
