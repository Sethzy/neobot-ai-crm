/** Line chart showing median price or PSF over time. */
"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CHART_GREEN, CHART_GREEN_LIGHT } from "@/lib/property/chart-colors";

type PriceTrendChartProps = {
  title: string;
  /** Array of { date: string; value: number } pairs. Dates in YYYY-MM-DD or YYYY-MM. */
  points: Array<{ date: string | null; value: number | null }>;
  /** Label for the value axis. */
  valueLabel?: string;
};

function groupByQuarter(
  points: Array<{ date: string | null; value: number | null }>
): Array<{ period: string; median: number }> {
  const buckets = new Map<string, number[]>();

  for (const p of points) {
    if (!p.date || p.value === null) continue;
    const d = new Date(`${p.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;

    const year = d.getUTCFullYear();
    const quarter = Math.ceil((d.getUTCMonth() + 1) / 3);
    const key = `${year} Q${quarter}`;

    const bucket = buckets.get(key) ?? [];
    bucket.push(p.value);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      return { period, median: Math.round(median) };
    });
}

function formatCompactPrice(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

export function PriceTrendChart({
  title,
  points,
  valueLabel = "Median Price",
}: PriceTrendChartProps) {
  const chartData = useMemo(() => groupByQuarter(points), [points]);

  if (chartData.length < 2) return null;

  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
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
            tickFormatter={formatCompactPrice}
            className="hidden sm:block"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              fontSize: 13,
            }}
            formatter={(value: number | undefined) => [
              formatCompactPrice(value ?? 0),
              valueLabel,
            ]}
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke={CHART_GREEN}
            strokeWidth={2}
            dot={{ fill: CHART_GREEN_LIGHT, r: 3 }}
            activeDot={{ r: 5, fill: CHART_GREEN }}
            name={valueLabel}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
