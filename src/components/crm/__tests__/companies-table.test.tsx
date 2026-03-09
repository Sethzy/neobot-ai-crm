/**
 * Tests for CRM companies table rendering and row click behavior.
 * @module components/crm/__tests__/companies-table
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompaniesTable } from "../companies-table";

const sampleCompanies = [
  {
    company_id: "co-1",
    client_id: "cl-1",
    name: "PropNex Realty",
    industry: "property_agency",
    website: "https://propnex.com",
    phone: "+6562201000",
    email: "info@propnex.com",
    address: "480 Lorong 6 Toa Payoh",
    notes: null,
    custom_fields: {},
    contactCount: 3,
    dealCount: 2,
    created_at: "2026-02-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
  },
  {
    company_id: "co-2",
    client_id: "cl-1",
    name: "Acme Partners",
    industry: "mortgage_broker",
    website: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    custom_fields: {},
    contactCount: 0,
    dealCount: 1,
    created_at: "2026-02-15T00:00:00+08:00",
    updated_at: "2026-02-28T00:00:00+08:00",
  },
];

describe("CompaniesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders company rows with phone, website, counts, and industry labels", () => {
    render(<CompaniesTable companies={sampleCompanies} />);

    expect(screen.getByRole("columnheader", { name: "Phone" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Website" })).toBeInTheDocument();
    expect(screen.getByText("PropNex Realty")).toBeInTheDocument();
    expect(screen.getByText("Acme Partners")).toBeInTheDocument();
    expect(screen.getByText("Property Agency")).toBeInTheDocument();
    expect(screen.getByText("Mortgage Broker")).toBeInTheDocument();
    expect(screen.getByText("+6562201000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "propnex.com" })).toHaveAttribute("href", "https://propnex.com");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Last Updated" })).not.toBeInTheDocument();
  });

  it("calls onRowClick with company id when clicking a row", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<CompaniesTable companies={sampleCompanies} onRowClick={onRowClick} />);

    const rows = screen.getAllByRole("row");
    await user.click(rows[1]);

    expect(onRowClick).toHaveBeenCalledWith("co-1");
  });

  it("renders empty state when no companies are available", () => {
    render(<CompaniesTable companies={[]} />);

    expect(screen.getByText(/no companies yet/i)).toBeInTheDocument();
  });

  it("uses a safe fallback badge variant for configured industries", () => {
    const { container } = render(<CompaniesTable companies={[sampleCompanies[1]]} />);

    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("uses mapped badge variants for default industries", () => {
    const { container } = render(<CompaniesTable companies={[sampleCompanies[0]]} />);

    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "info");
  });
});
