/**
 * Tests for browse_website tool behavior (v3 Browser-Use API).
 * @module lib/runner/tools/browser/__tests__/browse-website
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRun,
  MockBrowserUse,
  mockGetProfileForPlatform,
} = vi.hoisted(() => {
  const run = vi.fn();
  const getProfileForPlatform = vi.fn();
  const BrowserUse = vi.fn(function BrowserUse() {
    return { run };
  });

  return {
    mockRun: run,
    MockBrowserUse: BrowserUse,
    mockGetProfileForPlatform: getProfileForPlatform,
  };
});

vi.mock("browser-use-sdk/v3", () => ({
  BrowserUse: MockBrowserUse,
}));

vi.mock("@/lib/browser-use/profiles", () => ({
  getProfileForPlatform: (...args: unknown[]) => mockGetProfileForPlatform(...args),
}));

import { createBrowseWebsiteTool } from "../browse-website";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;
const MOCK_SUPABASE = { from: vi.fn() } as never;
const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

/** Default mock session result from Browser-Use v3. */
const defaultResult = {
  isTaskSuccessful: true,
  output: "Found 5 listings",
  totalCostUsd: "0.042",
  llmCostUsd: "0.030",
  proxyCostUsd: "0.002",
  browserCostUsd: "0.010",
};

describe("createBrowseWebsiteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BROWSER_USE_API_KEY", "bu_test-key");

    mockRun.mockResolvedValue(defaultResult);
    mockGetProfileForPlatform.mockResolvedValue(null);
  });

  it("returns browsing results for a public site", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const result = await tools.browse_website.execute(
      {
        goal: "Go to example.com and return the page title",
        startUrl: "https://example.com",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      output: "Found 5 listings",
      cost: {
        total: "0.042",
        llm: "0.030",
        proxy: "0.002",
        browser: "0.010",
      },
    });
  });

  it("calls client.run with cost ceiling and keepAlive false", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockRun).toHaveBeenCalledWith(
      "Search example.com",
      expect.objectContaining({
        model: "bu-mini",
        maxCostUsd: 0.50,
        keepAlive: false,
      }),
    );
  });

  it("folds startUrl into the task prompt", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      {
        goal: "Search example.com",
        startUrl: "https://example.com",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("Navigate to https://example.com first."),
      expect.any(Object),
    );
  });

  it("appends outputDescription to the task instruction", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      {
        goal: "Search for condos",
        outputDescription: "array of { name, price, url }",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining(
        "Return the results in this format: array of { name, price, url }",
      ),
      expect.any(Object),
    );
  });

  it("folds allowedDomains into the task prompt", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      {
        goal: "Search 99.co",
        allowedDomains: ["99.co"],
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("Only navigate within these domains: 99.co"),
      expect.any(Object),
    );
  });

  it("rejects invalid allowedDomains values at the schema layer", () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const parsed = tools.browse_website.inputSchema.safeParse({
      goal: "Search 99.co",
      allowedDomains: ["https://99.co"],
    });

    expect(parsed.success).toBe(false);
  });

  it("returns unsuccessful task results without throwing", async () => {
    mockRun.mockResolvedValueOnce({
      ...defaultResult,
      isTaskSuccessful: false,
      output: "Page not found",
    });

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const result = await tools.browse_website.execute(
      { goal: "Search missing page" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.output).toBe("Page not found");
  });

  it("rethrows Browser-Use execution errors", async () => {
    mockRun.mockRejectedValueOnce(new Error("Network error"));

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await expect(
      tools.browse_website.execute(
        { goal: "Search for condos" },
        EXECUTION_OPTIONS,
      ),
    ).rejects.toThrow("Network error");
  });

  it("returns an error when BROWSER_USE_API_KEY is missing", async () => {
    vi.stubEnv("BROWSER_USE_API_KEY", "");

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const result = await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("BROWSER_USE_API_KEY"),
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns needsAuth when a platform has no saved profile", async () => {
    mockGetProfileForPlatform.mockResolvedValueOnce(null);

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const result = await tools.browse_website.execute(
      { goal: "Search ProMap", platform: "propnex" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "No saved login for propnex. Ask the user to connect it first.",
      needsAuth: true,
      platform: "propnex",
    });
    expect(mockGetProfileForPlatform).toHaveBeenCalledWith(
      MOCK_SUPABASE,
      CLIENT_ID,
      "propnex",
    );
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("passes a saved profile id to the Browser-Use run options", async () => {
    mockGetProfileForPlatform.mockResolvedValueOnce({
      browser_use_profile_id: "profile_123",
    });

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    await tools.browse_website.execute(
      {
        goal: "Search ProMap for condos in D15",
        startUrl: "https://promap.propnex.com",
        platform: "propnex",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ profileId: "profile_123" }),
    );
  });

  it("does not look up profiles when no platform is specified", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockGetProfileForPlatform).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ profileId: expect.any(String) }),
    );
  });
});
