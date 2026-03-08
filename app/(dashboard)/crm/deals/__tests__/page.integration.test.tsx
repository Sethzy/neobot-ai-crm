/**
 * Integration test for deals page rendering with real table component.
 * @module app/(dashboard)/crm/deals/__tests__/page.integration
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import DealsPage from "../page";

vi.mock("@/hooks/use-deals", () => ({
  useDeals: vi.fn(),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
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
    localStorage.clear();

    void import("@/hooks/use-crm-config").then(({ useCrmConfig }) => {
      vi.mocked(useCrmConfig).mockReturnValue({
        data: {
          hasConfig: false,
          config: CRM_DEFAULTS,
        },
      } as never);
    });
  });

  it("renders deal rows via DealsTable when data exists", async () => {
    const { useDeals } = await import("@/hooks/use-deals");

    vi.mocked(useDeals).mockReturnValue({
      data: [
        {
          deal_id: "d-1",
          client_id: "cl-1",
          address: "123 Orchard Road",
          stage: "negotiation",
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
    expect(screen.getByText("Negotiation")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("switches between table and kanban views", async () => {
    const { useDeals } = await import("@/hooks/use-deals");
    const user = userEvent.setup();

    vi.mocked(useDeals).mockReturnValue({
      data: [
        {
          deal_id: "d-1",
          client_id: "cl-1",
          address: "123 Orchard Road",
          stage: "negotiation",
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

    expect(screen.getByRole("button", { name: "Table view" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kanban view" }));
    expect(screen.getByText("Negotiation")).toBeInTheDocument();
  });

  it("renders kanban columns from configured stages", async () => {
    const { useDeals } = await import("@/hooks/use-deals");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");
    const user = userEvent.setup();

    vi.mocked(useDeals).mockReturnValue({
      data: [
        {
          deal_id: "d-1",
          client_id: "cl-1",
          address: "123 Orchard Road",
          stage: "under_review",
          price: 1500000,
          notes: null,
          created_at: "2026-02-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
          deal_contacts: [],
        },
      ],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: true,
        config: {
          ...CRM_DEFAULTS,
          deal_stages: ["under_review", "quoted"],
        },
      },
    } as never);

    render(<DealsPage />);

    await user.click(screen.getByRole("button", { name: "Kanban view" }));

    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Quoted")).toBeInTheDocument();
    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
  });
});
