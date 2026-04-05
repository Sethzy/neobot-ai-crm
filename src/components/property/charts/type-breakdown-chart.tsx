/** Donut chart showing categorical breakdown (property type, sale type, flat type). */
"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
} from "@/lib/property/chart-colors";

type TypeBreakdownChartProps = {
  title: string;
  data: Array<{ label: string; count: number }>;
};

export function TypeBreakdownChart({ title, data }: TypeBreakdownChartProps) {
  const { topEntry, total } = useMemo(() => {
    if (data.length === 0) {
      return { topEntry: null, total: 0 };
    }

    const sorted = [...data].sort((a, b) => b.count - a.count);
    return {
      topEntry: sorted[0],
      total: data.reduce((sum, d) => sum + d.count, 0),
    };
  }, [data]);

  if (!topEntry) return null;

  const pct = total > 0 ? Math.round((topEntry.count / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 transition-shadow duration-200 hover:shadow-md">
      <h3 className="mb-4 text-lg font-semibold text-foreground">{title}</h3>
      <div className="relative">
        {/* Center label overlay — positioned over the donut hole */}
        <div className="pointer-events-none absolute inset-0 bottom-[40px] flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{topEntry.count}</p>
            <p className="text-[11px] text-muted-foreground">{topEntry.label}</p>
            <p className="text-[10px] text-muted-foreground">{pct}%</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={75}
              outerRadius={100}
              dataKey="count"
              nameKey="label"
              paddingAngle={2}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => (
                <span className="text-muted-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
