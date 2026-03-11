/**
 * Snapshot chart panels for agent-generated inline CRM views.
 * @module components/views/chart-panels
 */
"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Funnel,
  FunnelChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CHART_COLORS,
  CHART_PRIMARY,
} from "@/lib/property/chart-colors";

type ChartDatum = Record<string, string | number>;

interface BaseChartPanelProps {
  title: string;
  subtitle?: string;
  insight?: string;
}

export interface BarChartPanelProps extends BaseChartPanelProps {
  data: ChartDatum[];
  xKey: string;
  yKey: string;
}

export interface DonutChartPanelProps extends BaseChartPanelProps {
  data: ChartDatum[];
  nameKey: string;
  valueKey: string;
  centerLabel?: string;
}

export interface FunnelChartPanelProps extends BaseChartPanelProps {
  data: ChartDatum[];
  nameKey: string;
  valueKey: string;
  footerText?: string;
}

function ChartPanelShell({
  title,
  subtitle,
  insight,
  children,
  footer,
}: BaseChartPanelProps & {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card size="sm" className="h-full border-border/60 bg-card/80">
      <CardHeader className="gap-1.5">
        <CardTitle>{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        {insight ? (
          <p className="text-sm text-muted-foreground">{insight}</p>
        ) : null}
      </CardContent>
      {footer ? <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter> : null}
    </Card>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      No snapshot data available.
    </div>
  );
}

/**
 * Renders a compact bar chart for aggregated category comparisons.
 */
export function BarChartPanel({
  title,
  subtitle,
  insight,
  data,
  xKey,
  yKey,
}: BarChartPanelProps) {
  return (
    <ChartPanelShell title={title} subtitle={subtitle} insight={insight}>
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%" minWidth={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
              />
              <Bar dataKey={yKey} fill={CHART_PRIMARY} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanelShell>
  );
}

/**
 * Renders a compact donut chart for aggregated distribution snapshots.
 */
export function DonutChartPanel({
  title,
  subtitle,
  insight,
  data,
  nameKey,
  valueKey,
  centerLabel,
}: DonutChartPanelProps) {
  return (
    <ChartPanelShell title={title} subtitle={subtitle} insight={insight}>
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="relative h-56">
          {centerLabel ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rounded-full bg-background/90 px-3 py-1 text-sm font-semibold text-foreground shadow-xs">
                {centerLabel}
              </span>
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%" minWidth={240}>
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={nameKey}
                innerRadius={54}
                outerRadius={82}
                paddingAngle={2}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`donut-segment-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanelShell>
  );
}

/**
 * Renders a compact funnel chart for ordered stage progress snapshots.
 */
export function FunnelChartPanel({
  title,
  subtitle,
  insight,
  data,
  nameKey,
  valueKey,
  footerText,
}: FunnelChartPanelProps) {
  return (
    <ChartPanelShell
      title={title}
      subtitle={subtitle}
      insight={insight}
      footer={footerText ? <span>{footerText}</span> : undefined}
    >
      {data.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%" minWidth={240}>
            <FunnelChart>
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
              />
              <Funnel dataKey={valueKey} data={data} nameKey={nameKey} isAnimationActive={false}>
                {data.map((_, index) => (
                  <Cell
                    key={`funnel-segment-${index}`}
                    fill={index === 0 ? CHART_PRIMARY : CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanelShell>
  );
}
