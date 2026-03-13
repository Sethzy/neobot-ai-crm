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
  LineChartPanel,
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

describe("LineChartPanel", () => {
  it("renders the panel title and insight", () => {
    render(
      <LineChartPanel
        title="Deals over time"
        subtitle="Last 6 months"
        insight="Steady growth in Q1."
        data={[
          { month: "Jan", count: 5 },
          { month: "Feb", count: 8 },
          { month: "Mar", count: 12 },
        ]}
        xKey="month"
        yKey="count"
      />,
    );

    expect(screen.getByText("Deals over time")).toBeInTheDocument();
    expect(screen.getByText("Last 6 months")).toBeInTheDocument();
    expect(screen.getByText("Steady growth in Q1.")).toBeInTheDocument();
  });

  it("renders an empty state when data is empty", () => {
    render(
      <LineChartPanel
        title="Deals over time"
        data={[]}
        xKey="month"
        yKey="count"
      />,
    );

    expect(screen.getByText("No snapshot data available.")).toBeInTheDocument();
  });

  it("renders with areaFill enabled", () => {
    render(
      <LineChartPanel
        title="Revenue trend"
        data={[
          { month: "Jan", revenue: 10000 },
          { month: "Feb", revenue: 15000 },
        ]}
        xKey="month"
        yKey="revenue"
        areaFill
      />,
    );

    expect(screen.getByText("Revenue trend")).toBeInTheDocument();
  });
});
