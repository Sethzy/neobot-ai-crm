/**
 * Page-level tests for the customers dashboard landing route.
 * @module app/(dashboard)/customers/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import CustomersPage from "../page";

vi.mock("@/hooks/use-dashboard-stats", () => ({
  useDashboardStats: vi.fn(),
}));

vi.mock("@/hooks/use-recent-interactions", () => ({
  useRecentInteractions: vi.fn(),
}));

vi.mock("@/hooks/use-deals", () => ({
  useDeals: vi.fn(),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

describe("CustomersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the stat cards, recent activity, and pipeline overview with loaded data", async () => {
    const { useDashboardStats } = await import("@/hooks/use-dashboard-stats");
    const { useRecentInteractions } = await import("@/hooks/use-recent-interactions");
    const { useDeals } = await import("@/hooks/use-deals");
    const { useCrmConfig } = await import("@/hooks/use-crm-config");

    vi.mocked(useDashboardStats).mockReturnValue({
      data: {
        peopleTotal: 47,
        peopleNewThisWeek: 3,
        dealsTotal: 12,
        dealsTotalValue: 2_100_000,
        tasksOpen: 8,
        tasksOverdue: 2,
        tasksDueToday: 3,
      },
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useRecentInteractions).mockReturnValue({
      data: [
        {
          interaction_id: "interaction-1",
          client_id: "client-1",
          contact_id: "contact-1",
          deal_id: null,
          type: "call",
          summary: "Call with Sarah Chen about the Bukit Timah shortlist",
          occurred_at: "2026-03-10T10:00:00+08:00",
          created_at: "2026-03-10T10:00:00+08:00",
          updated_at: "2026-03-10T10:00:00+08:00",
          contacts: {
            contact_id: "contact-1",
            first_name: "Sarah",
            last_name: "Chen",
          },
        },
      ],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useDeals).mockReturnValue({
      data: [
        { deal_id: "deal-1", stage: "negotiation", price: 1_500_000 },
        { deal_id: "deal-2", stage: "negotiation", price: 600_000 },
      ],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: CRM_DEFAULTS,
      },
    } as never);

    render(<CustomersPage />);

    expect(
      screen.getByRole("heading", { name: "Customers" }),
    ).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("+3 this week")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByText(/Call with Sarah Chen about the Bukit Timah shortlist/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Negotiation")).toBeInTheDocument();
    expect(screen.getByText("$2.1M")).toBeInTheDocument();
  });
});
