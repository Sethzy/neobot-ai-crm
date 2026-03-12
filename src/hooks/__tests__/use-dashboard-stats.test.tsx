/**
 * Tests for customers dashboard stats query hook.
 * @module hooks/__tests__/use-dashboard-stats
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dashboardStatsKeys,
  getSingaporeDashboardDateBoundaries,
  useDashboardStats,
} from "@/hooks/use-dashboard-stats";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();
let mockClientId: string | undefined = "client-1";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: mockClientId }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (options: unknown) => mockUseRealtimeTable(options),
}));

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

function createResolvedBuilder(
  result: { count?: number | null; data?: unknown[] | null; error: { message: string } | null },
) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve(result).then(resolve);

  return builder;
}

describe("dashboardStatsKeys", () => {
  it("builds stable dashboard stats key namespaces", () => {
    expect(dashboardStatsKeys.all).toEqual(["dashboard-stats"]);
    expect(dashboardStatsKeys.current()).toEqual(["dashboard-stats", "current"]);
  });
});

describe("getSingaporeDashboardDateBoundaries", () => {
  it("returns Singapore-local day and week boundaries as UTC ISO strings", () => {
    expect(
      getSingaporeDashboardDateBoundaries(new Date("2026-03-10T15:30:00.000Z")),
    ).toEqual({
      startOfTodayIso: "2026-03-09T16:00:00.000Z",
      startOfTomorrowIso: "2026-03-10T16:00:00.000Z",
      startOfWeekIso: "2026-03-08T16:00:00.000Z",
    });
  });
});

describe("useDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientId = "client-1";
  });

  it("fetches all dashboard counts and deal value totals", async () => {
    const peopleTotalBuilder = createResolvedBuilder({ count: 47, error: null });
    const peopleNewBuilder = createResolvedBuilder({ count: 3, error: null });
    const dealsBuilder = createResolvedBuilder({
      count: 12,
      data: [{ price: 1_500_000 }, { price: 600_000 }, { price: null }],
      error: null,
    });
    const openTasksBuilder = createResolvedBuilder({ count: 8, error: null });
    const overdueTasksBuilder = createResolvedBuilder({ count: 2, error: null });
    const dueTodayTasksBuilder = createResolvedBuilder({ count: 3, error: null });

    mockFrom
      .mockReturnValueOnce(peopleTotalBuilder)
      .mockReturnValueOnce(peopleNewBuilder)
      .mockReturnValueOnce(dealsBuilder)
      .mockReturnValueOnce(openTasksBuilder)
      .mockReturnValueOnce(overdueTasksBuilder)
      .mockReturnValueOnce(dueTodayTasksBuilder);

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      peopleTotal: 47,
      peopleNewThisWeek: 3,
      dealsTotal: 12,
      dealsTotalValue: 2_100_000,
      tasksOpen: 8,
      tasksOverdue: 2,
      tasksDueToday: 3,
    });
    expect(mockFrom).toHaveBeenNthCalledWith(1, "contacts");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "contacts");
    expect(mockFrom).toHaveBeenNthCalledWith(3, "deals");
    expect(mockFrom).toHaveBeenNthCalledWith(4, "crm_tasks");
    expect(mockFrom).toHaveBeenNthCalledWith(5, "crm_tasks");
    expect(mockFrom).toHaveBeenNthCalledWith(6, "crm_tasks");
    expect(peopleTotalBuilder.select).toHaveBeenCalledWith("*", {
      count: "exact",
      head: true,
    });
    expect(peopleNewBuilder.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(dealsBuilder.select).toHaveBeenCalledWith("price", { count: "exact" });
    expect(openTasksBuilder.eq).toHaveBeenCalledWith("status", "open");
    expect(overdueTasksBuilder.not).toHaveBeenCalledWith("due_date", "is", null);
    expect(dueTodayTasksBuilder.gte).toHaveBeenCalledWith("due_date", expect.any(String));
    expect(dueTodayTasksBuilder.lt).toHaveBeenCalledWith("due_date", expect.any(String));
  });

  it("wires realtime invalidation for contacts, deals, and crm_tasks", async () => {
    mockFrom
      .mockReturnValueOnce(createResolvedBuilder({ count: 0, error: null }))
      .mockReturnValueOnce(createResolvedBuilder({ count: 0, error: null }))
      .mockReturnValueOnce(createResolvedBuilder({ count: 0, data: [], error: null }))
      .mockReturnValueOnce(createResolvedBuilder({ count: 0, error: null }))
      .mockReturnValueOnce(createResolvedBuilder({ count: 0, error: null }))
      .mockReturnValueOnce(createResolvedBuilder({ count: 0, error: null }));

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "contacts",
      filter: "client_id=eq.client-1",
      queryKeys: [dashboardStatsKeys.all],
      enabled: true,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "deals",
      filter: "client_id=eq.client-1",
      queryKeys: [dashboardStatsKeys.all],
      enabled: true,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "crm_tasks",
      filter: "client_id=eq.client-1",
      queryKeys: [dashboardStatsKeys.all],
      enabled: true,
    });
  });

  it("stays idle when the client id is unavailable", () => {
    mockClientId = undefined;

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
