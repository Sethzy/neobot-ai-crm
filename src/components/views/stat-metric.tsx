/**
 * Compact headline metric tile for agent-generated inline views.
 * @module components/views/stat-metric
 */
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatMetricProps {
  label: string;
  value: number | string;
  trend?: "up" | "down" | "flat";
}

const trendIndicatorMap = {
  up: "↑",
  down: "↓",
  flat: "→",
} as const;

const trendToneMap = {
  up: "text-emerald-700",
  down: "text-rose-700",
  flat: "text-muted-foreground",
} as const;

/**
 * Renders a compact summary metric with an optional directional indicator.
 */
export function StatMetric({ label, value, trend }: StatMetricProps) {
  return (
    <Card size="sm" className="h-full border-border/60 bg-card/80">
      <CardContent className="flex h-full flex-col justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          {trend ? (
            <span
              data-testid="trend-indicator"
              className={cn(
                "text-lg font-semibold leading-none",
                trendToneMap[trend],
              )}
            >
              {trendIndicatorMap[trend]}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
