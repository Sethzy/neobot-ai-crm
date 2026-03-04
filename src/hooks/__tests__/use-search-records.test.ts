/**
 * Tests cross-record search query behavior.
 * @module hooks/__tests__/use-search-records
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSearchRecords } from "@/hooks/use-search-records";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSearchRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not execute when query is shorter than 2 chars", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const { result } = renderHook(() => useSearchRecords("a"), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("executes RPC and returns typed rows for valid query", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { type: "contact", id: "c1", title: "Sarah Tan", subtitle: "seller" },
        { type: "deal", id: "d1", title: "Bishan St 22", subtitle: "offer" },
      ],
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const { result } = renderHook(() => useSearchRecords("sarah"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("search_records", { query: "sarah" });
    expect(result.current.data).toEqual([
      { type: "contact", id: "c1", title: "Sarah Tan", subtitle: "seller" },
      { type: "deal", id: "d1", title: "Bishan St 22", subtitle: "offer" },
    ]);
  });

  it("throws when RPC returns error", async () => {
    const error = { message: "rpc failed" };
    mockRpc.mockResolvedValue({ data: null, error });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const { result } = renderHook(() => useSearchRecords("phone"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
