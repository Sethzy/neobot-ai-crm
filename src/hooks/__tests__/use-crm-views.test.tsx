import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCrmViews } from "../use-crm-views";

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { view_id: "v1", name: "Active pipeline", entity_type: "deals", is_seeded: true },
                { view_id: "v2", name: "Custom view", entity_type: "deals", is_seeded: false },
              ],
              error: null,
            }),
          }),
        }),
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
  useRealtimeTable: vi.fn(),
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
  it("fetches views for an entity type", async () => {
    const { result } = renderHook(() => useCrmViews("deals"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe("Active pipeline");
  });
});
