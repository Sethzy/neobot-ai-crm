/**
 * Tests update mutation behavior for CRM deals.
 * @module hooks/__tests__/use-update-deal
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dealKeys } from "@/hooks/use-deals";
import { useUpdateDeal } from "@/hooks/use-update-deal";

const mockFrom = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUpdateDeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it("updates the row and invalidates deal query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateDeal("deal-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ address: "22 River Valley Road" });

    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(mockUpdate).toHaveBeenCalledWith({ address: "22 River Valley Road" });
    expect(mockEq).toHaveBeenCalledWith("deal_id", "deal-1");
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: dealKeys.all });
  });

  it("throws when Supabase returns an update error", async () => {
    const error = { message: "update failed" };
    mockEq.mockResolvedValue({ error });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateDeal("deal-1"), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({ stage: "offer" })).rejects.toEqual(error);
  });
});
