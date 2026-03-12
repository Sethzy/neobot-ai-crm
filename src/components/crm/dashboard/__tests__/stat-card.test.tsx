/**
 * Tests for customers dashboard stat-card links.
 * @module components/crm/dashboard/__tests__/stat-card
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatCard } from "@/components/crm/dashboard/stat-card";

describe("StatCard", () => {
  it("renders the metric copy and destination link", () => {
    render(
      <StatCard
        href="/customers/people"
        iconName="contacts"
        label="People"
        primaryMetric="47"
        secondaryMetric="+3 this week"
      />,
    );

    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("+3 this week")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/customers/people",
    );
  });
});
