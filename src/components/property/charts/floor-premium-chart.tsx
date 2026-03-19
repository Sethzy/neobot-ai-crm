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
import { formatCompactCurrency } from "@/lib/crm/display";
import {
  CHART_PRIMARY,
  CHART_PRIMARY_LIGHT,
  CHART_BORDER,
  CHART_TOOLTIP_STYLE,
} from "@/lib/property/chart-colors";

type FloorPremiumChartProps = {
  data: Array<{ floor: number; psf: number }>;
};

export function FloorPremiumChart({ data }: FloorPremiumChartProps) {
  if (data.length < 5) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground">Floor Level Premium</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Correlation between floor level and PSF
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />
          <XAxis
            type="number"
            dataKey="psf"
            name="PSF"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompactCurrency(v)}
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
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value, name) => {
              if (name === "PSF") return [formatCompactCurrency((value as number) ?? 0), "PSF"];
              return [(value as number) ?? 0, "Floor"];
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
