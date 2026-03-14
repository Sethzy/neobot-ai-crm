/**
 * Compact headline metric tile for agent-generated inline views.
 * Renders as a borderless content block — the outer layout (Card/Grid) provides containment.
 * @module components/views/stat-metric
 */
import { cn } from "@/lib/utils";

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

const trendPillMap = {
  up: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  down: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  flat: "bg-muted text-muted-foreground",
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
          <span
            data-testid="trend-indicator"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold leading-none",
              trendPillMap[trend],
            )}
          >
            {trendArrowMap[trend]}{change ? ` ${change}` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
