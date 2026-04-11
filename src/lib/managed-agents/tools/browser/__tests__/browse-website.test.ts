import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

const {
  mockGetBrowserUseClient,
  mockRun,
  mockGetProfileForPlatform,
} = vi.hoisted(() => {
  const run = vi.fn();
  const getBrowserUseClient = vi.fn(() => ({ run }));
  const getProfileForPlatform = vi.fn();

  return {
    mockGetBrowserUseClient: getBrowserUseClient,
    mockRun: run,
    mockGetProfileForPlatform: getProfileForPlatform,
  };
});

vi.mock("@/lib/browser-use/client", () => ({
  getBrowserUseClient: () => mockGetBrowserUseClient(),
}));

vi.mock("@/lib/browser-use/profiles", () => ({
  getProfileForPlatform: (...args: unknown[]) => mockGetProfileForPlatform(...args),
}));

import { browseWebsiteTool } from "../browse-website";

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: vi.fn() } as any,
    clientId: "client-1",
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("browseWebsiteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BROWSER_USE_API_KEY", "bu_test-key");
    mockGetBrowserUseClient.mockImplementation(() => {
      if (!process.env.BROWSER_USE_API_KEY) {
        throw new Error("BROWSER_USE_API_KEY is not configured.");
      }

      return { run: mockRun };
    });
    mockRun.mockResolvedValue({
      isSuccess: true,
      output: "Found 5 listings",
      cost: "0.042",
    });
    mockGetProfileForPlatform.mockResolvedValue(null);
  });

  it("returns browsing results for a public site", async () => {
    const result = await browseWebsiteTool.execute(
      {
        goal: "Go to example.com and return the page title",
        startUrl: "https://example.com",
      },
      makeContext(),
    );

    expect(result).toEqual({
      success: true,
      output: "Found 5 listings",
      cost: { total: 0.042, llm: 0, proxy: 0, browser: 0 },
    });
  });

  it("returns needsAuth when a platform has no saved profile", async () => {
    const result = await browseWebsiteTool.execute(
      { goal: "Search ProMap", platform: "propnex" },
      makeContext(),
    );

    expect(result).toEqual({
      success: false,
      error: "No saved login for propnex. Ask the user to connect it first.",
      needsAuth: true,
      platform: "propnex",
    });
  });

  it("passes a saved profile id to Browser-Use", async () => {
    mockGetProfileForPlatform.mockResolvedValueOnce({
      browser_use_profile_id: "profile_123",
    });

    await browseWebsiteTool.execute(
      {
        goal: "Search ProMap for condos in D15",
        startUrl: "https://promap.propnex.com",
        platform: "propnex",
      },
      makeContext(),
    );

    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sessionSettings: expect.objectContaining({ profileId: "profile_123" }),
      }),
    );
  });
});
