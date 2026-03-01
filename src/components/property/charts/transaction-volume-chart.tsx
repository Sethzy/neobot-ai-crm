/** Bar chart showing transaction volume grouped by year/quarter/month. */
"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CHART_PRIMARY } from "@/lib/property/chart-colors";

type Granularity = "yearly" | "quarterly" | "monthly";

type TransactionVolumeChartProps = {
  /** Array of date strings (YYYY-MM-DD or YYYY-MM format). */
  dates: (string | null)[];
  subtitle?: string;
};

function bucketKey(date: string, granularity: Granularity): string | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  if (granularity === "yearly") return `${year}`;
  if (granularity === "quarterly") return `${year} Q${Math.ceil(month / 3)}`;
  return `${year}-${month.toString().padStart(2, "0")}`;
}

function groupDates(
  dates: (string | null)[],
  granularity: Granularity
): Array<{ period: string; count: number }> {
  const buckets = new Map<string, number>();

  for (const d of dates) {
    if (!d) continue;
    const key = bucketKey(d, granularity);
    if (key) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));
}

const TABS: Array<{ label: string; value: Granularity }> = [
  { label: "Yearly", value: "yearly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Monthly", value: "monthly" },
];

export function TransactionVolumeChart({
  dates,
  subtitle,
}: TransactionVolumeChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("yearly");
  const chartData = useMemo(() => groupDates(dates, granularity), [dates, granularity]);

  if (chartData.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">Transaction Volume</h3>
          {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setGranularity(tab.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                granularity === tab.value
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
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
            allowDecimals={false}
            className="hidden sm:block"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              fontSize: 13,
            }}
          />
          <Bar dataKey="count" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} name="Transactions" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
