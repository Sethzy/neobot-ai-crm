/**
 * Tests for the message quota query hook.
 * @module hooks/use-message-quota.test
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveClientId, mockGetMessageQuotaStatus } = vi.hoisted(() => ({
  mockResolveClientId: vi.fn(),
  mockGetMessageQuotaStatus: vi.fn(),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/usage/message-quota", () => ({
  getMessageQuotaStatus: (...args: unknown[]) => mockGetMessageQuotaStatus(...args),
}));

import { useMessageQuota } from "./use-message-quota";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMessageQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T15:59:59.500Z"));
    mockResolveClientId.mockResolvedValue("client-1");
    mockGetMessageQuotaStatus.mockResolvedValue({
      clientId: "client-1",
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 0,
      messagesRemaining: 100,
      periodStart: "2026-04-01",
      nextResetDate: "2026-05-01",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes quota automatically after the Singapore month rollover", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () =>
        useMessageQuota({
          clientId: "client-1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 100,
          messagesRemaining: 0,
          periodStart: "2026-03-01",
          nextResetDate: "2026-04-01",
        }),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.data?.messagesRemaining).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });

    expect(result.current.data?.messagesRemaining).toBe(0);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["message-quota"],
    });
  });
});
