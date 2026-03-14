/**
 * Tests for the StatMetric view component.
 * @module components/views/stat-metric.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatMetric } from "./stat-metric";

describe("StatMetric", () => {
  it("renders the label and numeric value", () => {
    render(<StatMetric label="Active Deals" value={29} />);

    expect(screen.getByText("Active Deals")).toBeInTheDocument();
    expect(screen.getByText("29")).toBeInTheDocument();
  });

  it("renders a string value unchanged", () => {
    render(<StatMetric label="Pipeline Value" value="$4.2M" />);

    expect(screen.getByText("$4.2M")).toBeInTheDocument();
  });

  it("shows a trend indicator when present", () => {
    render(<StatMetric label="Stale" value={3} trend="up" />);

    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("↗");
  });

  it("shows trend with change magnitude", () => {
    render(<StatMetric label="Revenue" value="$4.2M" trend="up" change="12%" />);

    expect(screen.getByTestId("trend-indicator")).toHaveTextContent("↗ 12%");
  });
});
