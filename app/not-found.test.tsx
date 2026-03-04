/**
 * Tests for custom 404 not-found page.
 * @module app/not-found.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

describe("NotFound page", () => {
  it("renders page not found heading", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
  });

  it("renders a descriptive message", () => {
    render(<NotFound />);

    expect(screen.getByText(/the page you're looking for doesn't exist/i)).toBeInTheDocument();
  });

  it("renders a link back to home", () => {
    render(<NotFound />);

    const homeLink = screen.getByRole("link", { name: /go home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
