/**
 * Footer branding regression tests.
 * @module components/landing/Footer.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { siteBrand } from "@/lib/branding/site";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders the current NeoBot brand and support email", () => {
    render(<Footer />);

    expect(
      screen.getByText("The advisory sales autopilot, one message away."),
    ).toBeInTheDocument();

    const emailLink = screen.getByRole("link", { name: siteBrand.supportEmail });
    expect(emailLink).toHaveAttribute("href", `mailto:${siteBrand.supportEmail}`);

    expect(
      screen.getByText(/NeoBot\. All rights reserved\./),
    ).toBeInTheDocument();
  });
});
