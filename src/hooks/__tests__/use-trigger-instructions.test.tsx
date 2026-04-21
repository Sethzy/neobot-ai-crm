/**
 * Tests for the automation instruction API hook.
 * @module hooks/__tests__/use-trigger-instructions
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  prefetchTriggerInstructions,
  useTriggerInstructions,
} from "../use-trigger-instructions";

const mockFetch = vi.fn<typeof fetch>();

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

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("useTriggerInstructions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads instructions from the automation route", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        content: "# Daily Briefing",
        displayPath: "/agent/skills/daily-briefing/SKILL.md",
      }),
    );

    const { result } = renderHook(
      () => useTriggerInstructions("trigger-1", "skills/daily-briefing"),
      { wrapper: createWrapper().wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/automations/trigger-1/instructions",
      { method: "GET" },
    );
    expect(result.current.data).toEqual({
      content: "# Daily Briefing",
      displayPath: "/agent/skills/daily-briefing/SKILL.md",
    });
  });

  it("saves instructions through the automation route and updates cached data", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          content: "# Before save",
          displayPath: "/agent/state/triggers/daily-briefing.md",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content: "# After save",
          displayPath: "/agent/state/triggers/daily-briefing.md",
        }),
      );

    const { result } = renderHook(
      () => useTriggerInstructions("trigger-1", "state/triggers/daily-briefing.md"),
      { wrapper: createWrapper().wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.save.mutateAsync("# After save");

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/automations/trigger-1/instructions",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "# After save" }),
      },
    );
    await waitFor(() =>
      expect(result.current.data).toEqual({
        content: "# After save",
        displayPath: "/agent/state/triggers/daily-briefing.md",
      })
    );
  });

  it("prefetches instructions into the shared query cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        content: "# Prefetched",
        displayPath: "/agent/state/triggers/daily-briefing.md",
      }),
    );

    await prefetchTriggerInstructions(
      queryClient,
      "trigger-1",
      "state/triggers/daily-briefing.md",
    );

    expect(
      queryClient.getQueryData([
        "trigger-instructions",
        "trigger-1",
        "state/triggers/daily-briefing.md",
      ]),
    ).toEqual({
      content: "# Prefetched",
      displayPath: "/agent/state/triggers/daily-briefing.md",
    });
  });
});
