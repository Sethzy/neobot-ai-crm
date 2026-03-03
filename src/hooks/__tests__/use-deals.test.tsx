/**
 * Tests for CRM deal query hooks.
 * @module hooks/__tests__/use-deals
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dealKeys,
  useDeal,
  useDeals,
} from "@/hooks/use-deals";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1" }),
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

function createThenableBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolvePromise };
}

describe("dealKeys", () => {
  it("builds stable deal key namespaces", () => {
    expect(dealKeys.all).toEqual(["deals"]);
    expect(dealKeys.lists()).toEqual(["deals", "list"]);
    expect(dealKeys.list({ search: "oak", stage: "viewing" })).toEqual([
      "deals",
      "list",
      { search: "oak", stage: "viewing" },
    ]);
    expect(dealKeys.detail("deal-1")).toEqual(["deals", "detail", "deal-1"]);
  });
});

describe("useDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches deals ordered by updated_at descending", async () => {
    const builder = createThenableBuilder([
      {
        deal_id: "deal-1",
        address: "123 Orchard Road",
        stage: "viewing",
        contacts: { first_name: "John", last_name: "Smith" },
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeals({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(builder.select).toHaveBeenCalledWith("*, contacts(first_name, last_name)");
    expect(builder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("applies escaped search filter across address and notes", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeals({ search: "oak" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledWith(
      'address.ilike."%oak%",notes.ilike."%oak%"',
    );
  });

  it("applies stage filter with eq", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeals({ stage: "offer" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("stage", "offer");
  });

  it("wires realtime invalidation for deals table", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeals({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "deals",
      filter: "client_id=eq.client-1",
      queryKeys: [dealKeys.all],
      enabled: true,
    });
  });

  it("surfaces Supabase errors", async () => {
    const builder = createThenableBuilder([], { message: "RLS denied" });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeals({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires realtime invalidation for selected deal id", async () => {
    const builder = createThenableBuilder([
      {
        deal_id: "deal-1",
        address: "123 Orchard Road",
        stage: "viewing",
        contacts: { first_name: "John", last_name: "Smith" },
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeal("deal-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "deals",
      filter: "client_id=eq.client-1",
      queryKeys: [dealKeys.detail("deal-1")],
      enabled: true,
    });
  });

  it("fetches one deal by deal_id", async () => {
    const builder = createThenableBuilder([
      {
        deal_id: "deal-1",
        address: "123 Orchard Road",
        stage: "viewing",
        contacts: { first_name: "John", last_name: "Smith" },
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDeal("deal-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("deal_id", "deal-1");
    expect(builder.single).toHaveBeenCalled();
  });

  it("does not fetch when dealId is empty", () => {
    const { result } = renderHook(() => useDeal(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not keep previous deal data while loading a new deal id", async () => {
    const firstBuilder = createThenableBuilder([
      {
        deal_id: "deal-1",
        address: "123 Orchard Road",
        stage: "viewing",
        contacts: { first_name: "John", last_name: "Smith" },
      },
    ]);

    const deferred = createDeferred<{
      data: {
        deal_id: string;
        address: string;
        stage: string;
        contacts: { first_name: string; last_name: string };
      };
      error: null;
    }>();

    const secondBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue(deferred.promise),
    };

    let queryBuilderCallCount = 0;
    mockFrom.mockImplementation(() => {
      queryBuilderCallCount += 1;
      return queryBuilderCallCount === 1 ? firstBuilder : secondBuilder;
    });

    const { result, rerender } = renderHook(({ dealId }) => useDeal(dealId), {
      initialProps: { dealId: "deal-1" },
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect((result.current.data as { deal_id?: string } | undefined)?.deal_id).toBe("deal-1"),
    );

    rerender({ dealId: "deal-2" });

    expect(result.current.data).toBeUndefined();

    deferred.resolvePromise({
      data: {
        deal_id: "deal-2",
        address: "456 Bukit Timah Road",
        stage: "offer",
        contacts: { first_name: "Jane", last_name: "Tan" },
      },
      error: null,
    });

    await waitFor(() =>
      expect((result.current.data as { deal_id?: string } | undefined)?.deal_id).toBe("deal-2"),
    );
  });
});
