/**
 * Tests update mutation behavior for CRM companies.
 * @module hooks/__tests__/use-update-company
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { companyKeys } from "@/hooks/use-companies";
import { useUpdateCompany } from "@/hooks/use-update-company";

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

describe("useUpdateCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { custom_fields: {} }, error: null });
    mockSelectEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockSelectEq });
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it("updates the row and invalidates company query keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ phone: "+6591112222" });

    expect(mockFrom).toHaveBeenCalledWith("companies");
    expect(mockUpdate).toHaveBeenCalledWith({ phone: "+6591112222" });
    expect(mockEq).toHaveBeenCalledWith("company_id", "company-1");
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: companyKeys.all });
  });

  it("merges company custom_fields patches with the latest stored value before updating", async () => {
    mockFrom.mockReset();
    mockFrom
      .mockImplementationOnce(() => ({ select: mockSelect }))
      .mockImplementationOnce(() => ({ update: mockUpdate }));
    mockSingle.mockResolvedValue({
      data: { custom_fields: { tier: "a", hq: "Singapore" } },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(() => useUpdateCompany("company-1"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      custom_fields: { tier: "b" },
    });

    expect(mockFrom).toHaveBeenNthCalledWith(1, "companies");
    expect(mockSelect).toHaveBeenCalledWith("custom_fields");
    expect(mockSelectEq).toHaveBeenCalledWith("company_id", "company-1");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "companies");
    expect(mockUpdate).toHaveBeenCalledWith({
      custom_fields: {
        tier: "b",
        hq: "Singapore",
      },
    });
  });
});
