/**
 * Compact CRM deal summary card for agent-generated inline views.
 * Renders as a borderless content block — the outer layout (Card/Grid) provides containment.
 * @module components/views/deal-card
 */
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import { formatCrmEnumLabel } from "@/lib/crm/display";
import { cn } from "@/lib/utils";
import { dealStageValues } from "@/lib/crm/schemas";

export interface DealCardProps {
  address: string;
  price: string;
  stage?: string;
}

/** Left border color accent mapped to deal pipeline stages. */
const stageBorderMap: Record<string, string> = {
  leads: "border-l-zinc-400",
  negotiation: "border-l-sky-500",
  offer: "border-l-amber-500",
  closing: "border-l-emerald-500",
  closed_won: "border-l-emerald-500",
  lost: "border-l-rose-500",
  closed_lost: "border-l-rose-500",
};

/** Default border color for stages not in the map. */
const DEFAULT_STAGE_BORDER = "border-l-zinc-300";

function isDefaultDealStage(stage: string): stage is (typeof dealStageValues)[number] {
  return dealStageValues.includes(stage as (typeof dealStageValues)[number]);
}

/**
 * Renders a lightweight deal summary with a stage-colored left border accent.
 */
export function DealCard({ address, price, stage }: DealCardProps) {
  const borderClass = stage
    ? (stageBorderMap[stage] ?? DEFAULT_STAGE_BORDER)
    : undefined;

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 p-4",
        borderClass && "border-l-3",
        borderClass,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-1 text-sm font-semibold text-foreground">
          {address}
        </p>
        {stage
          ? isDefaultDealStage(stage)
            ? <StageBadge stage={stage} />
            : <Badge variant="secondary">{formatCrmEnumLabel(stage)}</Badge>
          : null}
      </div>
      <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {price}
      </p>
    </div>
  );
}
