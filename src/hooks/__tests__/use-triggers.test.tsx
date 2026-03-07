/**
 * Tests for automation trigger query and mutation hooks.
 * @module hooks/__tests__/use-triggers
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TRIGGER_LIST_SELECT,
  triggerKeys,
  useSetTriggerEnabled,
  useTriggers,
} from "../use-triggers";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

const mockFrom = vi.fn();
const mockUseRealtimeTable = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({ data: CLIENT_ID }),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtimeTable: (options: unknown) => mockUseRealtimeTable(options),
}));

function createWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient: client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

function createThenableBuilder(data: unknown[], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);

  return builder;
}

describe("useTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches non-pulse trigger rows and wires realtime invalidation", async () => {
    const builder = createThenableBuilder([
      {
        id: "trigger-1",
        thread_id: "thread-1",
        name: "Daily briefing",
        trigger_type: "schedule",
        cron_expression: "0 9 * * *",
        payload: { timezone: "Asia/Singapore" },
        enabled: true,
        next_fire_at: "2026-03-07T01:00:00.000Z",
        last_fired_at: null,
        last_status: null,
        invocation_message: "Run the morning briefing",
      },
    ]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useTriggers(), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith("agent_triggers");
    expect(builder.select).toHaveBeenCalledWith(TRIGGER_LIST_SELECT);
    expect(builder.neq).toHaveBeenCalledWith("trigger_type", "pulse");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mockUseRealtimeTable).toHaveBeenCalledWith({
      table: "agent_triggers",
      filter: `client_id=eq.${CLIENT_ID}`,
      queryKeys: [triggerKeys.all],
      enabled: true,
    });
  });
});

describe("useSetTriggerEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates enabled state and invalidates the trigger query namespace", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mockFrom.mockReturnValue({ update });

    const { result } = renderHook(() => useSetTriggerEnabled(), {
      wrapper: createWrapper(queryClient).wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        triggerId: "trigger-1",
        enabled: false,
      });
    });

    expect(mockFrom).toHaveBeenCalledWith("agent_triggers");
    expect(update).toHaveBeenCalledWith({ enabled: false });
    expect(eq).toHaveBeenCalledWith("id", "trigger-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: triggerKeys.all });
  });
});
