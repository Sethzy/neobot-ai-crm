/** Scatter chart showing floor-level premium correlation (floor vs PSF). */
"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_PRIMARY, CHART_PRIMARY_LIGHT } from "@/lib/property/chart-colors";

type FloorPremiumChartProps = {
  data: Array<{ floor: number; psf: number }>;
};

function formatCompactPrice(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

export function FloorPremiumChart({ data }: FloorPremiumChartProps) {
  if (data.length < 5) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
      <h3 className="text-lg font-semibold text-zinc-900">Floor Level Premium</h3>
      <p className="mb-4 text-sm text-zinc-500">
        Correlation between floor level and PSF
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            type="number"
            dataKey="psf"
            name="PSF"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompactPrice(v)}
          />
          <YAxis
            type="number"
            dataKey="floor"
            name="Floor"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            className="hidden sm:block"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              fontSize: 13,
            }}
            formatter={(value: number | undefined, name: string | undefined) => {
              if (name === "PSF") return [formatCompactPrice(value ?? 0), "PSF"];
              return [value ?? 0, "Floor"];
            }}
          />
          <Scatter
            data={data}
            fill={CHART_PRIMARY}
            fillOpacity={0.6}
            stroke={CHART_PRIMARY_LIGHT}
            strokeWidth={1}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
