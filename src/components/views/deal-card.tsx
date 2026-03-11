/**
 * Compact CRM deal summary card for agent-generated inline views.
 * @module components/views/deal-card
 */
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCrmEnumLabel } from "@/lib/crm/display";
import { dealStageValues } from "@/lib/crm/schemas";

export interface DealCardProps {
  address: string;
  price: string;
  stage?: string;
}

function isDefaultDealStage(stage: string): stage is (typeof dealStageValues)[number] {
  return dealStageValues.includes(stage as (typeof dealStageValues)[number]);
}

/**
 * Renders a lightweight deal summary without pulling in the full CRM surface.
 */
export function DealCard({ address, price, stage }: DealCardProps) {
  return (
    <Card size="sm" className="h-full border-border/60 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            {address}
          </CardTitle>
          {stage
            ? isDefaultDealStage(stage)
              ? <StageBadge stage={stage} />
              : <Badge variant="secondary">{formatCrmEnumLabel(stage)}</Badge>
            : null}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-base font-semibold tracking-tight text-foreground">
          {price}
        </p>
      </CardContent>
    </Card>
  );
}
