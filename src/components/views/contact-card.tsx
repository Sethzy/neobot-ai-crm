/**
 * Compact CRM contact summary card for agent-generated inline views.
 * Renders as a borderless content block — the outer layout (Card/Grid) provides containment.
 * @module components/views/contact-card
 */
import { Badge } from "@/components/ui/badge";
import {
  formatCrmEnumLabel,
  getContactTypeBadgeVariant,
} from "@/lib/crm/display";
import type { Contact } from "@/lib/crm/schemas";

export interface ContactCardProps {
  name: string;
  type?: Contact["type"];
  subtitle?: string;
}

/** Small palette for deterministic avatar background colors. */
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
] as const;

/** Derives 1–2 letter initials from a full name string. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/** Deterministic color index from a name string. */
function getAvatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Renders a compact contact card with initials avatar and CRM badge semantics.
 */
export function ContactCard({ name, type, subtitle }: ContactCardProps) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div
        data-testid="contact-avatar"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(name)}`}
      >
        {getInitials(name)}
      </div>
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
