import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketSubNav } from "../market-sub-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/market/agents",
}));

describe("MarketSubNav", () => {
  it("renders all 5 navigation links", () => {
    render(<MarketSubNav />);

    expect(screen.getByRole("link", { name: /agents/i })).toHaveAttribute(
      "href",
      "/market/agents"
    );
    expect(screen.getByRole("link", { name: /properties/i })).toHaveAttribute(
      "href",
      "/market/properties"
    );
    expect(screen.getByRole("link", { name: /hdb/i })).toHaveAttribute(
      "href",
      "/market/hdb"
    );
    expect(screen.getByRole("link", { name: /agencies/i })).toHaveAttribute(
      "href",
      "/market/agencies"
    );
    expect(screen.getByRole("link", { name: /areas/i })).toHaveAttribute(
      "href",
      "/market/areas"
    );
  });

  it("highlights the active link based on current pathname", () => {
    render(<MarketSubNav />);

    const agentsLink = screen.getByRole("link", { name: /agents/i });
    expect(agentsLink.className).toMatch(/text-primary|border-primary/);
  });

  it("renders as a nav element with accessible label", () => {
    render(<MarketSubNav />);

    expect(
      screen.getByRole("navigation", { name: /market data/i })
    ).toBeInTheDocument();
  });
});
