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
const mockSelect = vi.fn();
const mockSelectEq = vi.fn();
const mockSingle = vi.fn();
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
    mockSingle.mockResolvedValue({ data: { custom_fields: {} }, error: null });
    mockSelectEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockSelectEq });
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

  it("supports updating company_id on a deal", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateDeal("deal-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ company_id: "company-1" });

    expect(mockUpdate).toHaveBeenCalledWith({ company_id: "company-1" });
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

  it("merges deal custom_fields patches with the latest stored value before updating", async () => {
    mockFrom.mockReset();
    mockFrom
      .mockImplementationOnce(() => ({ select: mockSelect }))
      .mockImplementationOnce(() => ({ update: mockUpdate }));
    mockSingle.mockResolvedValue({
      data: { custom_fields: { policy_number: "P-123", coverage_amount: 250000 } },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateDeal("deal-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      custom_fields: { coverage_amount: 300000 },
    });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "deals");
    expect(mockSelect).toHaveBeenCalledWith("custom_fields");
    expect(mockSelectEq).toHaveBeenCalledWith("deal_id", "deal-1");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "deals");
    expect(mockUpdate).toHaveBeenCalledWith({
      custom_fields: {
        policy_number: "P-123",
        coverage_amount: 300000,
      },
    });
  });
});
