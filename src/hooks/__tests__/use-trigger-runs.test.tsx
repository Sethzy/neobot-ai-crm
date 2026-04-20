/**
 * Tests for automation run hooks.
 * @module hooks/__tests__/use-trigger-runs
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { triggerKeys } from "../use-triggers";
import { triggerRunKeys, useManualRun } from "../use-trigger-runs";

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

describe("useManualRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        runId: "run-1",
        sessionId: "session-1",
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts the manual run and invalidates trigger queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useManualRun("trigger-1"), {
      wrapper: createWrapper(queryClient).wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(fetch).toHaveBeenCalledWith("/api/automations/trigger-1/run", {
      method: "POST",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: triggerRunKeys.list("trigger-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: triggerKeys.all,
    });
  });
});
