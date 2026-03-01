/** Donut chart showing categorical breakdown (property type, sale type, flat type). */
"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS } from "@/lib/property/chart-colors";

type TypeBreakdownChartProps = {
  title: string;
  data: Array<{ label: string; count: number }>;
};

export function TypeBreakdownChart({ title, data }: TypeBreakdownChartProps) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
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
  );
}
