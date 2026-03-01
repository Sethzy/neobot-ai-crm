import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Users } from "lucide-react";
import { MarketCategoryCard } from "../market-category-card";

describe("MarketCategoryCard", () => {
  it("renders title, description, and count", () => {
    render(
      <MarketCategoryCard
        href="/market/agents"
        title="Agent Profiles"
        description="Search CEA-registered agent transaction histories"
        count="42,000+"
        icon={<Users className="h-6 w-6" />}
      />
    );

    expect(screen.getByText("Agent Profiles")).toBeInTheDocument();
    expect(screen.getByText(/CEA-registered/)).toBeInTheDocument();
    expect(screen.getByText("42,000+")).toBeInTheDocument();
  });

  it("links to the correct href", () => {
    render(
      <MarketCategoryCard
        href="/market/agents"
        title="Agent Profiles"
        description="Search CEA agent histories"
        count="42,000+"
        icon={<Users className="h-6 w-6" />}
      />
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/market/agents");
  });
});
