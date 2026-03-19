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
  subtitle?: string;
}

/** Derives 1–2 letter initials from a full name string. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/**
 * Renders a compact contact card with initials avatar and CRM badge semantics.
 */
export function ContactCard({ name, type, subtitle }: ContactCardProps) {
  return (
    <div className="flex items-start gap-3 p-4">
      <Avatar data-testid="contact-avatar">
        <AvatarFallback className={avatarColorFor(name)}>
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 text-sm font-semibold text-foreground">{name}</p>
          {type ? (
            <Badge variant={getContactTypeBadgeVariant(type)}>
              {formatCrmEnumLabel(type)}
            </Badge>
          ) : null}
        </div>
        {subtitle ? (
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
