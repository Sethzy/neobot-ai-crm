/**
 * Read-only badge for CRM deal stages.
 * @module components/crm/stage-badge
 */
import { Badge } from "@/components/ui/badge";
import { dealStageBadgeVariantMap } from "@/lib/crm/display";
import type { Deal } from "@/lib/crm/schemas";

const dealStageLabelMap: Record<Deal["stage"], string> = {
  leads: "Leads",
  viewing: "Viewing",
  offer: "Offer",
  negotiation: "Negotiation",
  otp: "OTP",
  completion: "Completion",
  lost: "Lost",
};

interface StageBadgeProps {
  stage: Deal["stage"];
}

/**
 * Renders a stage-specific badge label and variant for a deal.
 */
export function StageBadge({ stage }: StageBadgeProps) {
  return <Badge variant={dealStageBadgeVariantMap[stage]}>{dealStageLabelMap[stage]}</Badge>;
}
