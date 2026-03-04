/**
 * Integration test for deals page rendering with real table component.
 * @module app/(dashboard)/crm/deals/__tests__/page.integration
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DealsPage from "../page";

vi.mock("@/hooks/use-deals", () => ({
  useDeals: vi.fn(),
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: false,
    recordId: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

describe("DealsPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders deal rows via DealsTable when data exists", async () => {
    const { useDeals } = await import("@/hooks/use-deals");

    vi.mocked(useDeals).mockReturnValue({
      data: [
        {
          deal_id: "d-1",
          client_id: "cl-1",
          address: "123 Orchard Road",
          stage: "viewing",
          price: 1500000,
          notes: null,
          created_at: "2026-02-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
          deal_contacts: [
            { contact_id: "c-1", role: "buyer", is_primary: true, contacts: { first_name: "John", last_name: "Smith" } },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    } as never);

    render(<DealsPage />);

    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
    expect(screen.getByText("Viewing")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });
});
