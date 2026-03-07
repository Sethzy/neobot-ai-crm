/**
 * Tests for the landing hero CTA.
 * @module components/landing/Hero
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Hero } from "./Hero";

vi.mock("./PromoVideo", () => ({
  PromoVideo: () => <div data-testid="promo-video" />,
}));

describe("Hero", () => {
  it("routes the primary conversion CTA to signup", () => {
    render(<Hero />);

    expect(screen.getByRole("link", { name: /try for free/i })).toHaveAttribute("href", "/register");
    expect(screen.getByTestId("promo-video")).toBeInTheDocument();
  });
});
