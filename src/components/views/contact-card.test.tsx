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

  it("renders the subtitle when present", () => {
    render(
      <ContactCard
        name="John Tan"
        subtitle="Last contact: 5 Mar 2026"
      />,
    );

    expect(screen.getByText("Last contact: 5 Mar 2026")).toBeInTheDocument();
  });
});
