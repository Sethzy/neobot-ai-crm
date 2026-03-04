/**
 * Tests contact drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/contact-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ContactDrawerContent } from "../contact-drawer-content";

vi.mock("@/hooks/use-contacts", () => ({
  useContact: () => ({
    data: {
      contact_id: "c-1",
      client_id: "cl-1",
      first_name: "Sarah",
      last_name: "Tan",
      email: "sarah@example.com",
      phone: "+6598765432",
      type: "seller",
      notes: "Prefers evening calls.",
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactDeals: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/components/crm/contact-timeline", () => ({
  ContactTimeline: () => <div>Contact Timeline</div>,
}));

describe("ContactDrawerContent", () => {
  it("renders contact header and details", () => {
    render(<ContactDrawerContent contactId="c-1" />);

    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("seller")).toBeInTheDocument();
    expect(screen.getByText("+6598765432")).toBeInTheDocument();
    expect(screen.getByText("sarah@example.com")).toBeInTheDocument();
  });

  it("renders required sections", () => {
    render(<ContactDrawerContent contactId="c-1" />);

    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });
});

