/**
 * Tests for Supabase Realtime query invalidation hook behavior.
 * @module hooks/__tests__/use-realtime
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useRealtimeTable } from "../use-realtime";

type PgChangesCallback = (payload: unknown) => void;

interface MockChannel {
  on: (
    event: string,
    options: unknown,
    callback: PgChangesCallback,
  ) => MockChannel;
  subscribe: () => MockChannel;
}

const channelRecords: {
  name: string;
  channel: MockChannel;
  callback?: PgChangesCallback;
}[] = [];

const mockChannelName = vi.fn<(name: string) => void>();
const mockOn = vi.fn<(event: string, opts: unknown, cb: PgChangesCallback) => void>();
const mockSubscribe = vi.fn();
const mockRemoveChannel = vi.fn();

function createMockChannel(name: string): MockChannel {
  const record: {
    name: string;
    channel: MockChannel;
    callback?: PgChangesCallback;
  } = {
    name,
    channel: {} as MockChannel,
  };

  const channel: MockChannel = {
    on: (event, options, callback) => {
      mockOn(event, options, callback);
      record.callback = callback;
      return channel;
    },
    subscribe: () => {
      mockSubscribe(name);
      return channel;
    },
  };

  record.channel = channel;
  channelRecords.push(record);

  return channel;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: (name: string) => {
      mockChannelName(name);
      return createMockChannel(name);
    },
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useRealtimeTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelRecords.length = 0;
  });

  test("subscribes to the expected postgres_changes channel", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    expect(mockChannelName).toHaveBeenCalledWith(
      "realtime:contacts:client_id=eq.client-1",
    );
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "contacts",
        filter: "client_id=eq.client-1",
      },
      expect.any(Function),
    );
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  test("supports agent_triggers subscriptions", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "agent_triggers",
          filter: "client_id=eq.client-1",
          queryKeys: [["triggers", "list"]],
        }),
      { wrapper },
    );

    expect(mockChannelName).toHaveBeenCalledWith(
      "realtime:agent_triggers:client_id=eq.client-1",
    );
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "agent_triggers",
        filter: "client_id=eq.client-1",
      },
      expect.any(Function),
    );
  });

  test("removes the active channel on unmount", () => {
    const { wrapper } = createWrapper();

    const { unmount } = renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    const firstChannel = channelRecords[0]?.channel;
    expect(firstChannel).toBeDefined();

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(firstChannel);
  });

  test("skips subscription when enabled is false", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [["contacts", "list", "client-1"]],
          enabled: false,
        }),
      { wrapper },
    );

    expect(mockChannelName).not.toHaveBeenCalled();
    expect(mockOn).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  test("skips subscription when filter is undefined", () => {
    const { wrapper } = createWrapper();

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: undefined,
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    expect(mockChannelName).not.toHaveBeenCalled();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  test("does not remove channel when no subscription was created", () => {
    const { wrapper } = createWrapper();

    const { unmount } = renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: undefined,
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      { wrapper },
    );

    unmount();

    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  test("invalidates all provided query keys when an event arrives", () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(
      () =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys: [
            ["contacts", "list", "client-1"],
            ["contacts", "detail", "contact-1"],
          ],
        }),
      { wrapper },
    );

    const callback = channelRecords[0]?.callback;
    expect(callback).toBeTypeOf("function");

    act(() => {
      callback?.({ eventType: "UPDATE" });
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["contacts", "list", "client-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["contacts", "detail", "contact-1"],
    });
  });

  test("resubscribes and cleans up old channel when filter changes", () => {
    const { wrapper } = createWrapper();

    const { rerender } = renderHook(
      ({ filter }) =>
        useRealtimeTable({
          table: "contacts",
          filter,
          queryKeys: [["contacts", "list", "client-1"]],
        }),
      {
        initialProps: { filter: "client_id=eq.client-1" },
        wrapper,
      },
    );

    const firstChannel = channelRecords[0]?.channel;
    expect(firstChannel).toBeDefined();

    rerender({ filter: "client_id=eq.client-2" });

    expect(mockRemoveChannel).toHaveBeenCalledWith(firstChannel);
    expect(mockChannelName).toHaveBeenCalledWith(
      "realtime:contacts:client_id=eq.client-2",
    );
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  });

  test("does not resubscribe when only queryKeys reference changes and uses latest keys", () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const initialKeys = [["contacts", "list", "client-1"]] as const;
    const updatedKeys = [["contacts", "detail", "contact-2"]] as const;

    const { rerender } = renderHook(
      ({ queryKeys }) =>
        useRealtimeTable({
          table: "contacts",
          filter: "client_id=eq.client-1",
          queryKeys,
        }),
      {
        initialProps: { queryKeys: initialKeys },
        wrapper,
      },
    );

    rerender({ queryKeys: updatedKeys });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockChannelName).toHaveBeenCalledTimes(1);

    const callback = channelRecords[0]?.callback;
    expect(callback).toBeTypeOf("function");

    act(() => {
      callback?.({ eventType: "INSERT" });
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["contacts", "detail", "contact-2"],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["contacts", "list", "client-1"],
    });
  });
});
