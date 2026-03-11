/**
 * Tests for the snapshot chart panels used in chat views.
 * @module components/views/chart-panels.test
 */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 320, height: 224 }}>{children}</div>
    ),
  };
});

import {
  BarChartPanel,
  DonutChartPanel,
  FunnelChartPanel,
} from "./chart-panels";

describe("BarChartPanel", () => {
  it("renders the panel title and insight", () => {
    render(
      <BarChartPanel
        title="Pipeline by source"
        subtitle="Last 30 days"
        insight="Referrals are leading volume."
        data={[
          { source: "Referral", count: 12 },
          { source: "Portal", count: 7 },
        ]}
        xKey="source"
        yKey="count"
      />,
    );

    expect(screen.getByText("Pipeline by source")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Referrals are leading volume.")).toBeInTheDocument();
  });

  it("renders an empty state when there is no chart data", () => {
    render(
      <BarChartPanel
        title="Pipeline by source"
        data={[]}
        xKey="source"
        yKey="count"
      />,
    );

    expect(screen.getByText("No snapshot data available.")).toBeInTheDocument();
  });
});

describe("DonutChartPanel", () => {
  it("renders the panel title and optional center label", () => {
    render(
      <DonutChartPanel
        title="Stage mix"
        centerLabel="19 total"
        data={[
          { stage: "Leads", count: 10 },
          { stage: "Offer", count: 9 },
        ]}
        nameKey="stage"
        valueKey="count"
      />,
    );

    expect(screen.getByText("Stage mix")).toBeInTheDocument();
    expect(screen.getByText("19 total")).toBeInTheDocument();
  });
});

describe("FunnelChartPanel", () => {
  it("renders the panel title and footer summary", () => {
    render(
      <FunnelChartPanel
        title="Conversion funnel"
        footerText="Overall conversion 14%"
        data={[
          { stage: "Lead", count: 20 },
          { stage: "Viewing", count: 10 },
          { stage: "Offer", count: 3 },
        ]}
        nameKey="stage"
        valueKey="count"
      />,
    );

    expect(screen.getByText("Conversion funnel")).toBeInTheDocument();
    expect(screen.getByText("Overall conversion 14%")).toBeInTheDocument();
  });
});
