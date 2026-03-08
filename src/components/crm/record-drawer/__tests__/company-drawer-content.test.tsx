/**
 * Tests company drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/company-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyDrawerContent } from "../company-drawer-content";

const inlineFieldSpy = vi.fn(
  ({ label, value, type }: { label: string; value: string | null; type?: string }) => (
    <div data-testid={`inline-${label}`}>
      {label}:{value ?? "—"}:{type ?? "text"}
    </div>
  ),
);

vi.mock("@/hooks/use-companies", () => ({
  useCompany: () => ({
    data: {
      company_id: "co-1",
      client_id: "cl-1",
      name: "PropNex Realty",
      industry: "property_agency",
      website: "https://propnex.com",
      phone: "+6562201000",
      email: "info@propnex.com",
      address: "480 Lorong 6 Toa Payoh",
      notes: "Top-tier brokerage",
      custom_fields: { tier: "a" },
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-company-relations", () => ({
  useCompanyContacts: () => ({
    data: [{ contact_id: "c-1", first_name: "Sarah", last_name: "Tan", type: "buyer" }],
  }),
  useCompanyDeals: () => ({
    data: [{ deal_id: "d-1", address: "123 Orchard Road", stage: "offer" }],
  }),
}));

vi.mock("@/hooks/use-update-company", () => ({
  useUpdateCompany: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: () => ({
    data: {
      config: {
        deal_label: "Deal",
        company_label: "Brokerage",
        deal_stages: ["lead", "quoted", "offer"],
        contact_types: ["buyer", "seller"],
        interaction_types: ["call", "email"],
        deal_contact_roles: ["buyer", "seller"],
        company_industries: ["property_agency", "developer"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        company_custom_fields: [
          { key: "tier", label: "Tier", type: "select", options: ["a", "b"] },
        ],
        task_custom_fields: [],
      },
    },
  }),
}));

vi.mock("@/components/crm/inline-edit-field", () => ({
  InlineEditField: (props: { label: string; value: string | null; type?: string }) => inlineFieldSpy(props),
}));

describe("CompanyDrawerContent", () => {
  beforeEach(() => {
    inlineFieldSpy.mockClear();
  });

  it("renders inline-edit fields for company details", () => {
    render(<CompanyDrawerContent companyId="co-1" />);

    expect(screen.getByTestId("inline-Name")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Industry")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Website")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Notes")).toBeInTheDocument();
  });

  it("renders company header, related contacts, and related deals", () => {
    render(<CompanyDrawerContent companyId="co-1" />);

    expect(screen.getByText("PropNex Realty")).toBeInTheDocument();
    expect(screen.getByText("Property Agency")).toBeInTheDocument();
    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
  });

  it("renders configured company custom fields", () => {
    render(<CompanyDrawerContent companyId="co-1" />);

    expect(screen.getByTestId("inline-Tier")).toBeInTheDocument();

    const industryCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Industry")?.[0];
    expect(industryCall.options).toEqual([
      { value: "property_agency", label: "Property Agency" },
      { value: "developer", label: "Developer" },
    ]);
  });
});
