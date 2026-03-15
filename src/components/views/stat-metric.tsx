/**
 * Compact headline metric tile for agent-generated inline views.
 * Renders as a borderless content block — the outer layout (Card/Grid) provides containment.
 * @module components/views/stat-metric
 */
import { Badge } from "@/components/ui/badge";

export interface StatMetricProps {
  label: string;
  value: number | string;
  trend?: "up" | "down" | "flat";
  /** Optional trend magnitude string, e.g. "12%" or "+3". Renders next to arrow. */
  change?: string;
}

const trendArrowMap = {
  up: "↗",
  down: "↘",
  flat: "→",
} as const;

const trendVariantMap = {
  up: "success",
  down: "destructive",
  flat: "secondary",
} as const;

/**
 * Renders a compact summary metric with an optional directional trend pill.
 */
export function StatMetric({ label, value, trend, change }: StatMetricProps) {
  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {trend ? (
          <Badge data-testid="trend-indicator" variant={trendVariantMap[trend]}>
            {trendArrowMap[trend]}{change ? ` ${change}` : ""}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
