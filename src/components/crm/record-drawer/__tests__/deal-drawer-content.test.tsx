/**
 * Tests deal drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/deal-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DealDrawerContent } from "../deal-drawer-content";

const inlineFieldSpy = vi.fn(
  ({ label, value, type }: { label: string; value: string | null; type?: string }) => (
    <div data-testid={`inline-${label}`}>
      {label}:{value ?? "—"}:{type ?? "text"}
    </div>
  ),
);

vi.mock("@/hooks/use-deals", () => ({
  useDeal: () => ({
    data: {
      deal_id: "d-1",
      client_id: "cl-1",
      address: "Bishan St 22 #12-34",
      stage: "offer",
      price: 1200000,
      notes: "Awaiting valuation report.",
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
      deal_contacts: [
        {
          contact_id: "c-1",
          role: "buyer",
          is_primary: true,
          contacts: { first_name: "Sarah", last_name: "Tan" },
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useDealInteractions: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/components/crm/interaction-timeline", () => ({
  InteractionTimeline: () => <div>Interaction Timeline</div>,
}));

vi.mock("@/hooks/use-update-deal", () => ({
  useUpdateDeal: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/components/crm/inline-edit-field", () => ({
  InlineEditField: (props: { label: string; value: string | null; type?: string }) => inlineFieldSpy(props),
}));

describe("DealDrawerContent", () => {
  it("renders inline-edit fields for editable deal details", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByTestId("inline-Address")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Stage")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Price")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Notes")).toBeInTheDocument();
  });

  it("renders deal header and pricing details", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByText("Bishan St 22 #12-34")).toBeInTheDocument();
    expect(screen.getByText("Offer")).toBeInTheDocument();
    expect(screen.getByText(/Price:/)).toBeInTheDocument();
    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
  });

  it("renders required sections", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });
});
