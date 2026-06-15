import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketCta } from "../market-cta";

describe("MarketCta", () => {
  it("renders the CTA heading and link", () => {
    render(<MarketCta />);

    expect(
      screen.getByText(/Need this data in your next proposal/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try sunder free/i })).toHaveAttribute(
      "href",
      "/register"
    );
  });
});
