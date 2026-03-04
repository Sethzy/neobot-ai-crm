/**
 * Tests for contact relation hooks (deals + contact/deal interactions).
 * @module hooks/__tests__/use-contact-relations
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  contactRelationKeys,
  useContactDeals,
  useContactInteractions,
  useDealInteractions,
} from "@/hooks/use-contact-relations";

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
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("contactRelationKeys", () => {
  it("builds stable keys for deal and interaction relation queries", () => {
    expect(contactRelationKeys.all).toEqual(["contact-relations"]);
    expect(contactRelationKeys.deals("contact-1")).toEqual([
      "contact-relations",
      "deals",
      "contact-1",
    ]);
    expect(contactRelationKeys.interactions("contact-1")).toEqual([
      "contact-relations",
      "interactions",
      "contact-1",
    ]);
    expect(contactRelationKeys.dealInteractions("deal-1")).toEqual([
      "contact-relations",
      "deal-interactions",
      "deal-1",
    ]);
  });
});

describe("useContactDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches deal_contacts filtered by contact_id with joined deals", async () => {
    const builder = createThenableBuilder([
      { deal_contact_id: "dc-1", deal_id: "deal-1", contact_id: "contact-1", deals: { deal_id: "deal-1", address: "123 Oak St" } },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContactDeals("contact-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("deal_contacts");
    expect(builder.select).toHaveBeenCalledWith("*, deals!deal_contacts_deal_id_fkey(*)");
    expect(builder.eq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "deal_contacts",
      filter: "client_id=eq.client-1",
      queryKeys: [contactRelationKeys.deals("contact-1")],
      enabled: true,
    });
  });

  it("is disabled when contactId is empty", () => {
    const { result } = renderHook(() => useContactDeals(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useContactInteractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches interactions filtered by contact_id ordered by occurred_at desc", async () => {
    const builder = createThenableBuilder([{ interaction_id: "int-1", type: "call" }]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContactInteractions("contact-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("interactions");
    expect(builder.eq).toHaveBeenCalledWith("contact_id", "contact-1");
    expect(builder.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "interactions",
      filter: "client_id=eq.client-1",
      queryKeys: [contactRelationKeys.interactions("contact-1")],
      enabled: true,
    });
  });
});

describe("useDealInteractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches deal interactions with joined contact names", async () => {
    const builder = createThenableBuilder([{ interaction_id: "int-1", type: "viewing" }]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useDealInteractions("deal-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("interactions");
    expect(builder.select).toHaveBeenCalledWith("*, contacts!interactions_contact_id_fkey(first_name, last_name)");
    expect(builder.eq).toHaveBeenCalledWith("deal_id", "deal-1");
    expect(builder.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "interactions",
      filter: "client_id=eq.client-1",
      queryKeys: [contactRelationKeys.dealInteractions("deal-1")],
      enabled: true,
    });
  });

  it("is disabled when dealId is empty", () => {
    const { result } = renderHook(() => useDealInteractions(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
