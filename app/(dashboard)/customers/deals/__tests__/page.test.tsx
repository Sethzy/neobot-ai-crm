/**
 * Tests unified deals workspace behavior.
 * @module app/(dashboard)/customers/deals/__tests__/page
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DealsPage from "../page";

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/customers/deals",
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: vi.fn(() => ({ data: "client-1", isLoading: false })),
}));

vi.mock("@/hooks/use-deals", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-deals")>("@/hooks/use-deals");

  return {
    ...actual,
    useDeals: vi.fn(),
    usePaginatedDeals: vi.fn(),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("DealsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();

    const { useCrmConfig } = await import("@/hooks/use-crm-config");
    const { useDeals, usePaginatedDeals } = await import("@/hooks/use-deals");

    vi.mocked(useCrmConfig).mockReturnValue({
      data: {
        hasConfig: false,
        config: {
          deal_stages: ["leads", "offer", "closing", "lost"],
        },
      },
    } as never);

    vi.mocked(usePaginatedDeals).mockReturnValue({
      data: {
        rows: [
          {
            deal_id: "deal-1",
            client_id: "client-1",
            address: "123 Bishan Street 13",
            stage: "leads",
            amount: 1850000,
            company_id: null,
            notes: null,
            custom_fields: {},
            created_at: "2026-03-01T00:00:00+08:00",
            updated_at: "2026-03-05T00:00:00+08:00",
            deal_contacts: [],
            companies: null,
          },
        ],
        total: 1,
        totalPages: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    vi.mocked(useDeals).mockReturnValue({
      data: [
        {
          deal_id: "deal-1",
          client_id: "client-1",
          address: "123 Bishan Street 13",
          stage: "leads",
          amount: 1850000,
          company_id: null,
          notes: null,
          custom_fields: {},
          created_at: "2026-03-01T00:00:00+08:00",
          updated_at: "2026-03-05T00:00:00+08:00",
          deal_contacts: [],
          companies: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it("renders table and board inside one deals workspace", () => {
    render(<DealsPage />, { wrapper: createWrapper() });

    expect(screen.getByRole("radio", { name: /table view/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /board view/i })).toBeInTheDocument();
  });

  it("keeps search text when switching from table to board", async () => {
    const user = userEvent.setup();

    render(<DealsPage />, { wrapper: createWrapper() });

    await user.type(screen.getByPlaceholderText(/search deals/i), "Bishan");
    await user.click(screen.getByRole("radio", { name: /board view/i }));

    expect(screen.getByDisplayValue("Bishan")).toBeInTheDocument();
  });

  it("uses truthful board copy and keeps the sort control", async () => {
    const user = userEvent.setup();

    render(<DealsPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("radio", { name: /board view/i }));

    expect(screen.getByText(/move deals forward from the board/i)).toBeInTheDocument();
    expect(screen.queryByText(/drag them between lanes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /sort deals/i })).toBeInTheDocument();
  });

  it("only enables the active view query", async () => {
    const user = userEvent.setup();
    const { useDeals, usePaginatedDeals } = await import("@/hooks/use-deals");

    render(<DealsPage />, { wrapper: createWrapper() });

    expect(vi.mocked(usePaginatedDeals)).toHaveBeenLastCalledWith(
      expect.any(Object),
      { enabled: true },
    );
    expect(vi.mocked(useDeals)).toHaveBeenLastCalledWith(
      expect.any(Object),
      { enabled: false },
    );

    await user.click(screen.getByRole("radio", { name: /board view/i }));

    await waitFor(() => {
      expect(vi.mocked(usePaginatedDeals)).toHaveBeenLastCalledWith(
        expect.any(Object),
        { enabled: false },
      );
      expect(vi.mocked(useDeals)).toHaveBeenLastCalledWith(
        expect.any(Object),
        { enabled: true },
      );
    });
  });
});
