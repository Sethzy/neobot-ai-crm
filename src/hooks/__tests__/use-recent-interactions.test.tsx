/**
 * Tests for recent-interactions dashboard query hook.
 * @module hooks/__tests__/use-recent-interactions
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recentInteractionKeys,
  useRecentInteractions,
} from "@/hooks/use-recent-interactions";

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

function createResolvedBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("recentInteractionKeys", () => {
  it("builds stable recent interaction key namespaces", () => {
    expect(recentInteractionKeys.all).toEqual(["recent-interactions"]);
    expect(recentInteractionKeys.lists()).toEqual([
      "recent-interactions",
      "list",
    ]);
    expect(recentInteractionKeys.list(5)).toEqual([
      "recent-interactions",
      "list",
      5,
    ]);
  });
});

describe("useRecentInteractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientId = "client-1";
  });

  it("fetches recent interactions with joined contact names and a limit", async () => {
    const builder = createResolvedBuilder([
      {
        interaction_id: "interaction-1",
        contact_id: "contact-1",
        type: "call",
        contacts: { contact_id: "contact-1", first_name: "Sarah", last_name: "Chen" },
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useRecentInteractions(5), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith("interactions");
    expect(builder.select).toHaveBeenCalledWith(
      "*, contacts!interactions_contact_id_fkey(contact_id, first_name, last_name)",
    );
    expect(builder.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("wires realtime invalidation for interactions and contacts", async () => {
    mockFrom.mockReturnValue(createResolvedBuilder([]));

    const { result } = renderHook(() => useRecentInteractions(5), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "interactions",
      filter: "client_id=eq.client-1",
      queryKeys: [recentInteractionKeys.all],
      enabled: true,
    });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "contacts",
      filter: "client_id=eq.client-1",
      queryKeys: [recentInteractionKeys.all],
      enabled: true,
    });
  });

  it("stays idle when the list limit is zero", () => {
    const { result } = renderHook(() => useRecentInteractions(0), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
