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
const mockOpen = vi.fn();
const mockCaptureTimelineActivity = vi.fn();
const mockFrom = vi.fn();

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

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    recordId: null,
    open: mockOpen,
  }),
}));

vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return { unsubscribe: vi.fn() };
      },
    }),
    removeChannel: vi.fn(),
  },
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
    vi.spyOn(window, "confirm").mockReturnValue(true);

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

    expect(screen.getByText("By Stage")).toBeInTheDocument();
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

  it("captures a created timeline activity when a deal is created from the page", async () => {
    const user = userEvent.setup();
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        deal_id: "deal-2",
        client_id: "client-1",
        address: "Untitled Deal",
        stage: "leads",
        amount: null,
        company_id: null,
        custom_fields: {},
        created_at: "2026-04-05T10:00:00+08:00",
        updated_at: "2026-04-05T10:00:00+08:00",
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    mockFrom.mockImplementation((table: string) => {
      if (table === "deals") {
        return { insert };
      }

      return {};
    });

    render(<DealsPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /^new$/i }));

    await waitFor(() => {
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          recordType: "deal",
          recordId: "deal-2",
          action: "created",
          actorType: "user",
          after: expect.objectContaining({
            deal_id: "deal-2",
          }),
        }),
      );
    });
    expect(mockOpen).toHaveBeenCalledWith("deal-2");
  });

  it("captures a deleted timeline activity when a deal is deleted from the page", async () => {
    const user = userEvent.setup();
    const selectSingle = vi.fn().mockResolvedValue({
      data: {
        deal_id: "deal-1",
        client_id: "client-1",
        address: "123 Bishan Street 13",
        stage: "leads",
        amount: 1850000,
        company_id: null,
        custom_fields: {},
        created_at: "2026-03-01T00:00:00+08:00",
        updated_at: "2026-03-05T00:00:00+08:00",
      },
      error: null,
    });
    const selectEq = vi.fn().mockReturnValue({ single: selectSingle });
    const select = vi.fn().mockReturnValue({ eq: selectEq });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteBuilder = vi.fn().mockReturnValue({ eq: deleteEq });

    mockFrom.mockImplementation((table: string) => {
      if (table === "deals") {
        return { select, delete: deleteBuilder };
      }

      return {};
    });

    render(<DealsPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: "Open row actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          recordType: "deal",
          recordId: "deal-1",
          action: "deleted",
          actorType: "user",
          before: expect.objectContaining({
            deal_id: "deal-1",
          }),
        }),
      );
    });
  });
});
