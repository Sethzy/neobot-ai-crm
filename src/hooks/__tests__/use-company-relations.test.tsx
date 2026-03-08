/**
 * Tests for company relation query hooks.
 * @module hooks/__tests__/use-company-relations
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  companyRelationKeys,
  useCompanyContacts,
  useCompanyDeals,
} from "@/hooks/use-company-relations";

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
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("companyRelationKeys", () => {
  it("builds stable company relation cache keys", () => {
    expect(companyRelationKeys.contacts("company-1")).toEqual([
      "company-relations",
      "contacts",
      "company-1",
    ]);
    expect(companyRelationKeys.deals("company-1")).toEqual([
      "company-relations",
      "deals",
      "company-1",
    ]);
  });
});

describe("useCompanyContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches contacts linked to the company", async () => {
    const builder = createThenableBuilder([
      { contact_id: "contact-1", company_id: "company-1", first_name: "Sarah", last_name: "Tan" },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCompanyContacts("company-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("contacts");
    expect(builder.eq).toHaveBeenCalledWith("company_id", "company-1");
  });
});

describe("useCompanyDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches deals linked to the company", async () => {
    const builder = createThenableBuilder([
      { deal_id: "deal-1", company_id: "company-1", address: "123 Orchard Road" },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCompanyDeals("company-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(builder.eq).toHaveBeenCalledWith("company_id", "company-1");
  });
});
