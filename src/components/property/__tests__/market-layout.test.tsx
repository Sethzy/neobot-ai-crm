import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketSubNav } from "../market-sub-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/market/agents",
}));

describe("Market layout structure", () => {
  it("MarketSubNav renders sticky nav with correct z-index class", () => {
    render(<MarketSubNav />);
    const nav = screen.getByRole("navigation", { name: /market data/i });
    expect(nav.className).toContain("sticky");
    expect(nav.className).toContain("z-50");
  });
});
