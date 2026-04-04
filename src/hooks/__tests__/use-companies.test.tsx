/**
 * Tests for CRM company query hooks.
 * @module hooks/__tests__/use-companies
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  companyKeys,
  useCompanies,
  useCompany,
} from "@/hooks/use-companies";

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
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("companyKeys", () => {
  it("builds stable company key namespaces", () => {
    expect(companyKeys.all).toEqual(["companies"]);
    expect(companyKeys.lists()).toEqual(["companies", "list"]);
    expect(companyKeys.list({ search: "propnex", industry: "developer" })).toEqual([
      "companies",
      "list",
      { search: "propnex", industry: "developer" },
    ]);
    expect(companyKeys.detail("company-1")).toEqual(["companies", "detail", "company-1"]);
  });
});

describe("useCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches companies ordered by updated_at descending", async () => {
    const companyBuilder = createThenableBuilder([
      {
        company_id: "company-1",
        client_id: "client-1",
        name: "PropNex Realty",
        industry: "property_agency",
        website: null,
        phone: null,
        email: null,
        address: null,
        custom_fields: {},
        created_at: "2026-03-01T00:00:00+08:00",
        updated_at: "2026-03-04T00:00:00+08:00",
      },
    ]);
    const contactCountBuilder = createThenableBuilder([
      { company_id: "company-1" },
      { company_id: "company-1" },
    ]);
    const dealCountBuilder = createThenableBuilder([
      { company_id: "company-1" },
    ]);
    mockFrom
      .mockImplementationOnce(() => companyBuilder)
      .mockImplementationOnce(() => contactCountBuilder)
      .mockImplementationOnce(() => dealCountBuilder);

    const { result } = renderHook(() => useCompanies({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenNthCalledWith(1, "companies");
    expect(companyBuilder.select).toHaveBeenCalledWith("*");
    expect(companyBuilder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(mockFrom).toHaveBeenNthCalledWith(2, "contacts");
    expect(contactCountBuilder.select).toHaveBeenCalledWith("company_id");
    expect(contactCountBuilder.in).toHaveBeenCalledWith("company_id", ["company-1"]);
    expect(mockFrom).toHaveBeenNthCalledWith(3, "deals");
    expect(dealCountBuilder.select).toHaveBeenCalledWith("company_id");
    expect(dealCountBuilder.in).toHaveBeenCalledWith("company_id", ["company-1"]);
    expect(result.current.data?.[0]).toMatchObject({
      company_id: "company-1",
      contact_count: 2,
      deal_count: 1,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "companies",
      filter: "client_id=eq.client-1",
      queryKeys: [companyKeys.all],
      enabled: true,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "contacts",
      filter: "client_id=eq.client-1",
      queryKeys: [companyKeys.all],
      enabled: true,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "deals",
      filter: "client_id=eq.client-1",
      queryKeys: [companyKeys.all],
      enabled: true,
    });
  });

  it("applies search via or() on company fields", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCompanies({ search: "propnex" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledTimes(1);
    expect(builder.or.mock.calls[0]?.[0]).toContain("name.ilike");
    expect(builder.or.mock.calls[0]?.[0]).toContain("website.ilike");
    expect(builder.or.mock.calls[0]?.[0]).toContain("phone.ilike");
  });

  it("applies company industry filter with eq()", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCompanies({ industry: "developer" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("industry", "developer");
  });

  it("applies saved view filters and sort overrides", async () => {
    const builder = createThenableBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(
      () =>
        useCompanies({
          viewFilters: { industry: "developer" },
          viewSort: {
            column: "name",
            ascending: true,
          },
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.order).toHaveBeenCalledWith("name", { ascending: true });
    expect(builder.eq).toHaveBeenCalledWith("industry", "developer");
  });
});

describe("useCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches one company by company_id", async () => {
    const builder = createThenableBuilder([
      { company_id: "company-1", name: "PropNex Realty" },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCompany("company-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(builder.single).toHaveBeenCalled();
  });

  it("does not fetch when companyId is empty", () => {
    const { result } = renderHook(() => useCompany(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
