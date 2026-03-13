/**
 * Compact CRM contact summary card for agent-generated inline views.
 * @module components/views/contact-card
 */
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/**
 * Renders a compact contact card with existing CRM badge semantics.
 */
export function ContactCard({ name, type, subtitle }: ContactCardProps) {
  return (
    <Card size="sm" className="h-full border-border/60 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-1 text-sm font-semibold text-foreground">
            {name}
          </CardTitle>
          {type ? (
            <Badge variant={getContactTypeBadgeVariant(type)}>
              {formatCrmEnumLabel(type)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      {subtitle ? (
        <CardContent>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
