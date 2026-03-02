/** Donut chart showing categorical breakdown (property type, sale type, flat type). */
"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS } from "@/lib/property/chart-colors";

type TypeBreakdownChartProps = {
  title: string;
  data: Array<{ label: string; count: number }>;
};

export function TypeBreakdownChart({ title, data }: TypeBreakdownChartProps) {
  if (data.length === 0) return null;

  const { topEntry, total } = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.count - a.count);
    return {
      topEntry: sorted[0],
      total: data.reduce((sum, d) => sum + d.count, 0),
    };
  }, [data]);

  const pct = total > 0 ? Math.round((topEntry.count / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
      <h3 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h3>
      <div className="relative">
        {/* Center label overlay — positioned over the donut hole */}
        <div className="pointer-events-none absolute inset-0 bottom-[40px] flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900">{topEntry.count}</p>
            <p className="text-[11px] text-zinc-600">{topEntry.label}</p>
            <p className="text-[10px] text-zinc-400">{pct}%</p>
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
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 13,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value: string) => (
                <span className="text-zinc-700">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
