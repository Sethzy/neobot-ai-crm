/**
 * Tests for the ContactCard view component.
 * @module components/views/contact-card.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContactCard } from "./contact-card";

describe("ContactCard", () => {
  it("renders the contact name", () => {
    render(<ContactCard name="John Tan" />);

    expect(screen.getByText("John Tan")).toBeInTheDocument();
  });

  it("formats the contact type label", () => {
    render(<ContactCard name="Sarah Lee" type="buyer" />);

    expect(screen.getByText("Buyer")).toBeInTheDocument();
  });

  it("renders structured details as dot-separated line", () => {
    render(
      <ContactCard
        name="John Tan"
        phone="9123-4567"
        email="john@example.com"
        company="PropNex"
      />,
    );

    expect(screen.getByText("PropNex \u00B7 9123-4567 \u00B7 john@example.com")).toBeInTheDocument();
  });

  it("renders subtitle as fallback when no structured fields", () => {
    render(
      <ContactCard
        name="John Tan"
        subtitle="Last contact: 5 Mar 2026"
      />,
    );

    expect(screen.getByText("Last contact: 5 Mar 2026")).toBeInTheDocument();
  });

  it("uses centralized avatar color classes", () => {
    render(<ContactCard name="John Tan" />);

    const avatarFallback = screen
      .getByTestId("contact-avatar")
      .querySelector("[data-slot='avatar-fallback']");

    expect(avatarFallback).not.toBeNull();
    expect(avatarFallback).toHaveClass("text-foreground");
    expect(avatarFallback?.className).toMatch(/bg-/);
  });
});
