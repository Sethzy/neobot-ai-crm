/** Price trend chart with monthly min/median/max bands. */
"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency } from "@/lib/crm/display";
import {
  CHART_PRIMARY,
  CHART_PRIMARY_LIGHT,
  CHART_BORDER,
} from "@/lib/property/chart-colors";

type PriceTrendChartProps = {
  title: string;
  subtitle?: string;
  points: Array<{ date: string | null; value: number | null }>;
  valueLabel?: string;
};

type MonthBand = {
  /** Sortable key like "2024-11". */
  key: string;
  /** Display label like "Nov 2024". */
  period: string;
  min: number;
  median: number;
  max: number;
};

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function groupByMonth(
  points: Array<{ date: string | null; value: number | null }>
): MonthBand[] {
  const buckets = new Map<string, number[]>();

  for (const point of points) {
    if (!point.date || point.value === null) continue;
    const date = new Date(`${point.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // 0-indexed
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;

    const bucket = buckets.get(key) ?? [];
    bucket.push(point.value);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      const year = Number.parseInt(key.slice(0, 4), 10);
      const monthIdx = Number.parseInt(key.slice(5, 7), 10) - 1;

      return {
        key,
        period: `${SHORT_MONTHS[monthIdx]} ${String(year).slice(2)}`,
        min: Math.round(Math.min(...sorted)),
        median: Math.round(median),
        max: Math.round(Math.max(...sorted)),
      };
    });
}

function formatFullPrice(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/** Expand "Nov 24" → "November 2024" for the tooltip header. */
function expandPeriodLabel(short: string): string {
  const parts = short.split(" ");
  if (parts.length !== 2) return short;
  const monthAbbrev = parts[0];
  const yearShort = parts[1];
  const fullMonths = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const idx = SHORT_MONTHS.indexOf(monthAbbrev);
  const fullMonth = idx >= 0 ? fullMonths[idx] : monthAbbrev;
  const fullYear = Number.parseInt(yearShort, 10) < 50
    ? `20${yearShort}`
    : `19${yearShort}`;
  return `${fullMonth} ${fullYear}`;
}

/** Custom tooltip showing period, price range, and median on separate lines. */
function CustomTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  valueLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const values: Record<string, number> = {};
  for (const entry of payload) {
    values[entry.dataKey] = entry.value;
  }

  const min = values.min;
  const max = values.max;
  const med = values.median;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold text-popover-foreground">
        {label ? expandPeriodLabel(label) : ""}
      </p>
      {min != null && max != null ? (
        <p className="text-popover-foreground">
          {formatFullPrice(min)} – {formatFullPrice(max)}
          <span className="ml-1.5 text-muted-foreground">Price Range</span>
        </p>
      ) : null}
      {med != null ? (
        <p className="text-popover-foreground">
          {formatFullPrice(med)}
          <span className="ml-1.5 text-muted-foreground">{valueLabel}</span>
        </p>
      ) : null}
    </div>
  );
}

export function PriceTrendChart({
  title,
  subtitle,
  points,
  valueLabel = "Median Price",
}: PriceTrendChartProps) {
  const chartData = useMemo(() => groupByMonth(points), [points]);

  if (chartData.length < 2) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            className="hidden sm:block"
          />
          <Tooltip
            content={<CustomTooltip valueLabel={valueLabel} />}
          />
          <Area
            type="monotone"
            dataKey="max"
            stroke="none"
            fill={CHART_PRIMARY_LIGHT}
            fillOpacity={0.15}
            name="max"
          />
          <Area
            type="monotone"
            dataKey="min"
            stroke="none"
            fill="var(--color-card)"
            fillOpacity={1}
            name="min"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke={CHART_PRIMARY}
            strokeWidth={2}
            dot={{ fill: CHART_PRIMARY_LIGHT, r: 3 }}
            activeDot={{ r: 5, fill: CHART_PRIMARY }}
            name="median"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
