/**
 * Tests for CRM deals list page states and search wiring.
 * @module app/(dashboard)/crm/deals/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DealsPage from "../page";

vi.mock("@/hooks/use-deals", () => ({
  useDeals: vi.fn(),
}));

vi.mock("@/components/crm/deals-table", () => ({
  DealsTable: () => <div>Deals Table</div>,
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: false,
    recordId: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

describe("DealsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error state and retries when deals query fails", async () => {
    const { useDeals } = await import("@/hooks/use-deals");
    const mockRefetch = vi.fn();

    vi.mocked(useDeals).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<DealsPage />);

    expect(screen.getByText(/unable to load deals/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state with icon when no deals exist", async () => {
    const { useDeals } = await import("@/hooks/use-deals");

    vi.mocked(useDeals).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    render(<DealsPage />);

    expect(screen.getByText(/no deals yet/i)).toBeInTheDocument();
  });

  it("passes trimmed search text into the deals hook", async () => {
    const { useDeals } = await import("@/hooks/use-deals");

    vi.mocked(useDeals).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    const user = userEvent.setup();
    render(<DealsPage />);

    await user.type(screen.getByPlaceholderText(/search deals/i), "  orchard  ");

    expect(vi.mocked(useDeals)).toHaveBeenLastCalledWith({ search: "orchard" });
  });
});
