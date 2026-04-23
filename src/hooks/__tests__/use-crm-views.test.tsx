import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCrmViews } from "../use-crm-views";

const {
  mockUseRealtimeTable,
  mockEq,
  mockFirstOrder,
  mockSecondOrder,
} = vi.hoisted(() => ({
  mockUseRealtimeTable: vi.fn(),
  mockEq: vi.fn(),
  mockFirstOrder: vi.fn(),
  mockSecondOrder: vi.fn(),
}));

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: "client-1" }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (...args: unknown[]) => mockUseRealtimeTable(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCrmViews", () => {
  beforeEach(() => {
    mockSecondOrder.mockResolvedValue({
      data: [
        { view_id: "v1", name: "Active pipeline", entity_type: "deals", is_seeded: true },
        { view_id: "v2", name: "Custom view", entity_type: "deals", is_seeded: false },
      ],
      error: null,
    });
    mockFirstOrder.mockReturnValue({ order: mockSecondOrder });
    mockEq.mockReturnValue({ order: mockFirstOrder });
    mockUseRealtimeTable.mockReset();
  });

  it("fetches views for an entity type", async () => {
    const { result } = renderHook(() => useCrmViews("deals"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe("Active pipeline");
    expect(result.current.data?.[0].state.viewType).toBe("table");
  });

  it("subscribes to crm_views realtime invalidation for the current client", () => {
    renderHook(() => useCrmViews("deals"), {
      wrapper: createWrapper(),
    });

    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "crm_views",
      filter: "client_id=eq.client-1",
      queryKeys: [["crm-views", "deals"]],
      enabled: true,
    });
  });
});
