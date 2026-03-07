/**
 * Read-only badge for CRM deal stages.
 * @module components/crm/stage-badge
 */
import { Badge } from "@/components/ui/badge";
import { dealStageBadgeVariantMap, formatCrmEnumLabel } from "@/lib/crm/display";
import type { Deal } from "@/lib/crm/schemas";

export const dealStageLabelMap: Record<Deal["stage"], string> = {
  leads: "Leads",
  negotiation: "Negotiation",
  offer: "Offer",
  closing: "Closing",
  lost: "Lost",
};

interface StageBadgeProps {
  stage: Deal["stage"];
}

/**
 * Renders a stage-specific badge label and variant for a deal.
 */
export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <Badge variant={dealStageBadgeVariantMap[stage] ?? "secondary"}>
      {dealStageLabelMap[stage] ?? formatCrmEnumLabel(stage)}
    </Badge>
  );
}
