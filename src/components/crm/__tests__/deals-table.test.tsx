/**
 * Tests for CRM deals table rendering and navigation behavior.
 * @module components/crm/__tests__/deals-table
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealsTable } from "../deals-table";

const mockPush = vi.fn();
const mockPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}));

const sampleDeals = [
  {
    deal_id: "d-1",
    client_id: "cl-1",
    address: "123 Orchard Road",
    stage: "viewing" as const,
    price: 1500000,
    notes: "Hot lead",
    created_at: "2026-02-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
    deal_contacts: [
      { contact_id: "c-1", role: "buyer", is_primary: true, contacts: { first_name: "John", last_name: "Smith" } },
    ],
  },
  {
    deal_id: "d-2",
    client_id: "cl-1",
    address: "456 Bukit Timah Road",
    stage: "lost" as const,
    price: null,
    notes: null,
    created_at: "2026-02-15T00:00:00+08:00",
    updated_at: "2026-02-28T00:00:00+08:00",
    deal_contacts: [],
  },
];

describe("DealsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders deal rows with address, stage, and contact", () => {
    render(<DealsTable deals={sampleDeals} />);

    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
    expect(screen.getByText("456 Bukit Timah Road")).toBeInTheDocument();
    expect(screen.getByText("Viewing")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText(/1,500,000/)).toBeInTheDocument();
  });

  it("navigates to detail route on row click", async () => {
    const user = userEvent.setup();
    render(<DealsTable deals={sampleDeals} />);

    const rows = screen.getAllByRole("row");
    await user.click(rows[1]);

    expect(mockPush).toHaveBeenCalledWith("/crm/deals/d-1");
  });

  it("does not navigate row when clicking linked address", async () => {
    const user = userEvent.setup();
    render(<DealsTable deals={sampleDeals} />);

    await user.click(screen.getByRole("link", { name: "123 Orchard Road" }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("prefetches detail route on row hover", async () => {
    const user = userEvent.setup();
    render(<DealsTable deals={sampleDeals} />);

    const rows = screen.getAllByRole("row");
    await user.hover(rows[1]);

    expect(mockPrefetch).toHaveBeenCalledWith("/crm/deals/d-1");
  });

  it("shows placeholders for missing contact and price", () => {
    render(<DealsTable deals={sampleDeals} />);

    const row = screen.getByText("456 Bukit Timah Road").closest("tr");
    expect(row).not.toBeNull();

    const placeholders = within(row as HTMLElement).getAllByText("—");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
  });

  it("renders empty state when no deals are available", () => {
    render(<DealsTable deals={[]} />);

    expect(screen.getByText(/no deals yet/i)).toBeInTheDocument();
  });
});
