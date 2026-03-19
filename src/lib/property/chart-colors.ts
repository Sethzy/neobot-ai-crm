/** Green palette for recharts and chart visualizations. */
export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

export const CHART_PRIMARY = "var(--color-chart-1)";
export const CHART_PRIMARY_LIGHT = "var(--color-chart-2)";
export const CHART_SURFACE = "var(--color-card)";
export const CHART_MUTED_SURFACE = "var(--color-muted)";
export const CHART_BORDER = "var(--color-border)";
export const CHART_TEXT = "var(--color-foreground)";
export const CHART_MUTED_TEXT = "var(--color-muted-foreground)";
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  backgroundColor: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  fontSize: 13,
} as const;
