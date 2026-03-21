/**
 * Snapshot chart panels for agent-generated inline CRM views.
 * Uses ShadCN chart primitives for themed tooltips, legends, and CSS variable colors.
 * @module components/views/chart-panels
 */
"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type ChartDatum = Record<string, string | number>;

/** Defensive coercion — ensures data is always an array even if the LLM sends a non-array. */
const ensureArray = (data: unknown): ChartDatum[] =>
  Array.isArray(data) ? data : [];

/** Chart color palette — maps to CSS variables --chart-1 through --chart-5. */
const SEGMENT_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

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

export interface LineChartPanelProps extends BaseChartPanelProps {
  data: ChartDatum[];
  xKey: string;
  yKey: string;
  areaFill?: boolean;
}

/** Shared card wrapper for all chart panels. */
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
    <Card className="h-full">
      <CardHeader className="gap-1.5">
        <CardTitle>{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        {insight ? (
          <Alert>
            <AlertDescription className="font-medium">{insight}</AlertDescription>
          </Alert>
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

/** Builds a ChartConfig from data segments, mapping each unique name to a chart color. */
function buildSegmentConfig(data: ChartDatum[], nameKey: string): ChartConfig {
  const config: ChartConfig = {};
  for (const [i, datum] of data.entries()) {
    const key = String(datum[nameKey] ?? `segment-${i}`);
    config[key] = {
      label: key,
      color: `var(--chart-${(i % SEGMENT_COLORS.length) + 1})`,
    };
  }
  return config;
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
  const safeData = ensureArray(data);

  const chartConfig = {
    [yKey]: { label: yKey, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <ChartPanelShell title={title} subtitle={subtitle} insight={insight}>
      {safeData.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
          <BarChart data={safeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey={yKey} fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartPanelShell>
  );
}

/**
 * Renders a compact donut chart for aggregated distribution snapshots.
 * Includes a legend so segments are identifiable without hovering.
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
  const safeData = ensureArray(data);
  const chartConfig = buildSegmentConfig(safeData, nameKey);

  /* Inject fill into each datum so Recharts picks up the color per-segment. */
  const coloredData = safeData.map((d, i) => ({
    ...d,
    fill: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }));

  return (
    <ChartPanelShell title={title} subtitle={subtitle} insight={insight}>
      {safeData.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="relative">
          {centerLabel ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rounded-full bg-background/90 px-3 py-1 text-sm font-semibold text-foreground shadow-xs">
                {centerLabel}
              </span>
            </div>
          ) : null}
          <ChartContainer config={chartConfig} className="aspect-square h-56 w-full">
            <PieChart>
              <Pie
                data={coloredData}
                dataKey={valueKey}
                nameKey={nameKey}
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              />
              <ChartTooltip content={<ChartTooltipContent nameKey={nameKey} hideLabel />} />
              <ChartLegend content={<ChartLegendContent nameKey={nameKey} />} />
            </PieChart>
          </ChartContainer>
        </div>
      )}
    </ChartPanelShell>
  );
}

/**
 * Renders a compact funnel chart for ordered stage progress snapshots.
 * Includes a legend for stage identification.
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
  const safeData = ensureArray(data);
  const chartConfig = buildSegmentConfig(safeData, nameKey);

  /* Render funnel as stacked horizontal bars for clearer stage visualization.
   * Recharts' FunnelChart looks broken when most values are 0 — a horizontal
   * bar chart with decreasing widths is more readable for CRM pipeline stages. */
  return (
    <ChartPanelShell
      title={title}
      subtitle={subtitle}
      insight={insight}
      footer={footerText ? <span>{footerText}</span> : undefined}
    >
      {safeData.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="flex flex-col gap-2 py-2">
          {(() => {
            const maxValue = Math.max(...safeData.map((d) => Number(d[valueKey] ?? 0)), 1);
            return safeData.map((datum, index) => {
            const name = String(datum[nameKey] ?? "");
            const value = Number(datum[valueKey] ?? 0);
            const widthPercent = Math.max((value / maxValue) * 100, 8); // minimum 8% so empty stages are visible
            return (
              <div key={`funnel-${index}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{name}</span>
                  <span>{value}</span>
                </div>
                <div className="h-6 w-full rounded-md bg-muted/50">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          });
          })()}
        </div>
      )}
    </ChartPanelShell>
  );
}

/**
 * Renders a compact line chart for time-series or trend views.
 * Supports optional area fill for emphasis.
 */
export function LineChartPanel({
  title,
  subtitle,
  insight,
  data,
  xKey,
  yKey,
  areaFill,
}: LineChartPanelProps) {
  const safeData = ensureArray(data);

  const chartConfig = {
    [yKey]: { label: yKey, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <ChartPanelShell title={title} subtitle={subtitle} insight={insight}>
      {safeData.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
          {areaFill ? (
            <AreaChart data={safeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke="var(--color-chart-1)"
                fill="url(#areaGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart data={safeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          )}
        </ChartContainer>
      )}
    </ChartPanelShell>
  );
}
