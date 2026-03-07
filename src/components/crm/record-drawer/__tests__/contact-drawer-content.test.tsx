/**
 * Tests contact drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/contact-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContactDrawerContent } from "../contact-drawer-content";

const inlineFieldSpy = vi.fn(
  ({ label, value, type }: { label: string; value: string | null; type?: string }) => (
    <div data-testid={`inline-${label}`}>
      {label}:{value ?? "—"}:{type ?? "text"}
    </div>
  ),
);

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
      custom_fields: { segment: "vip" },
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

vi.mock("@/hooks/use-update-contact", () => ({
  useUpdateContact: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: () => ({
    data: {
      config: {
        deal_label: "Policy",
        deal_stages: ["lead", "quoted", "bound"],
        contact_types: ["prospect", "client"],
        interaction_types: ["call", "email"],
        deal_contact_roles: ["insured", "owner"],
        deal_custom_fields: [],
        contact_custom_fields: [
          {
            key: "segment",
            label: "Segment",
            type: "select",
            options: ["vip", "standard"],
            required: false,
          },
        ],
        task_custom_fields: [],
      },
    },
  }),
}));

vi.mock("@/components/crm/inline-edit-field", () => ({
  InlineEditField: (props: { label: string; value: string | null; type?: string }) => inlineFieldSpy(props),
}));

describe("ContactDrawerContent", () => {
  beforeEach(() => {
    inlineFieldSpy.mockClear();
  });

  it("renders inline-edit fields for contact details", () => {
    render(<ContactDrawerContent contactId="c-1" />);

    expect(screen.getByTestId("inline-Phone")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Email")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Type")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Notes")).toBeInTheDocument();
  });

  it("renders contact header and details", () => {
    render(<ContactDrawerContent contactId="c-1" />);

    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("Seller")).toBeInTheDocument();
    expect(screen.getByText("Phone:+6598765432:text")).toBeInTheDocument();
    expect(screen.getByText("Email:sarah@example.com:text")).toBeInTheDocument();
  });

  it("renders required sections", () => {
    render(<ContactDrawerContent contactId="c-1" />);

    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("uses config-driven contact types and renders contact custom fields", () => {
    render(<ContactDrawerContent contactId="c-1" />);

    expect(screen.getByTestId("inline-Segment")).toBeInTheDocument();

    const typeCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Type")?.[0];
    expect(typeCall.options).toEqual([
      { value: "prospect", label: "Prospect" },
      { value: "client", label: "Client" },
      { value: "seller", label: "Seller" },
    ]);

    const customFieldCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Segment")?.[0];
    expect(customFieldCall).toMatchObject({
      value: "vip",
      type: "select",
      options: [
        { value: "vip", label: "Vip" },
        { value: "standard", label: "Standard" },
      ],
    });
  });
});
