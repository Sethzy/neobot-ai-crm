/**
 * Read-only badge for CRM deal stages.
 * @module components/crm/stage-badge
 */
import { Badge } from "@/components/ui/badge";
import { dealStageBadgeVariantMap, formatDealStageLabel } from "@/lib/crm/display";
import type { Deal } from "@/lib/crm/schemas";

interface StageBadgeProps {
  stage: Deal["stage"];
}

/**
 * Renders a stage-specific badge label and variant for a deal.
 */
export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <Badge variant={dealStageBadgeVariantMap[stage] ?? "secondary"}>
      {formatDealStageLabel(stage)}
    </Badge>
  );
}
