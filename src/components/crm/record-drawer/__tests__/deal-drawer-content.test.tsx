/**
 * Tests deal drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/deal-drawer-content
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      company_id: "co-1",
      companies: { company_id: "co-1", name: "PropNex" },
      amount: 1200000,
      notes: "Awaiting valuation report.",
      custom_fields: { policy_number: "P-123", coverage_amount: 250000 },
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
  useDealTasks: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/components/crm/interaction-timeline", () => ({
  InteractionTimeline: () => <div>Interaction Timeline</div>,
}));

vi.mock("@/hooks/use-update-deal", () => ({
  useUpdateDeal: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-companies", () => ({
  useCompanies: () => ({
    data: [
      { company_id: "co-1", name: "PropNex" },
      { company_id: "co-2", name: "ERA" },
    ],
  }),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: () => ({
    data: {
      config: {
        deal_label: "Policy",
        deal_stages: ["lead", "quoted", "bound"],
        contact_types: ["prospect", "client"],
        company_label: "Company",
        interaction_types: ["call", "email"],
        deal_contact_roles: ["insured", "owner"],
        company_industries: ["property_agency", "developer"],
        deal_custom_fields: [
          { key: "policy_number", label: "Policy Number", type: "text", required: false },
          { key: "coverage_amount", label: "Coverage Amount", type: "currency", required: false },
        ],
        contact_custom_fields: [],
        company_custom_fields: [],
        task_custom_fields: [],
      },
    },
  }),
}));

vi.mock("@/components/crm/inline-edit-field", () => ({
  InlineEditField: (props: { label: string; value: string | null; type?: string }) => inlineFieldSpy(props),
}));

describe("DealDrawerContent", () => {
  beforeEach(() => {
    inlineFieldSpy.mockClear();
  });

  it("renders inline-edit fields for editable deal details", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByTestId("inline-Address")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Stage")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Company")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Price")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Notes")).toBeInTheDocument();
  });

  it("renders deal header and pricing details", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByText("Bishan St 22 #12-34")).toBeInTheDocument();
    expect(screen.getByText("Offer")).toBeInTheDocument();
    expect(screen.getByText(/Price:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /contacts/i }));
    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
  });

  it("renders the tabbed side-panel navigation", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Fields")).toBeInTheDocument();
  });

  it("uses config-driven stages and renders deal custom fields in the drawer", () => {
    render(<DealDrawerContent dealId="d-1" />);

    expect(screen.getByTestId("inline-Policy Number")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Coverage Amount")).toBeInTheDocument();

    const stageCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Stage")?.[0];
    const companyCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Company")?.[0];
    expect(stageCall.options).toEqual([
      { value: "lead", label: "Lead" },
      { value: "quoted", label: "Quoted" },
      { value: "bound", label: "Bound" },
      { value: "offer", label: "Offer" },
    ]);
    expect(companyCall.options).toEqual([
      { value: "__none__", label: "No company" },
      { value: "co-1", label: "PropNex" },
      { value: "co-2", label: "ERA" },
    ]);

    const coverageCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Coverage Amount")?.[0];
    expect(coverageCall).toMatchObject({
      value: "250000",
      type: "number",
    });
  });
});
