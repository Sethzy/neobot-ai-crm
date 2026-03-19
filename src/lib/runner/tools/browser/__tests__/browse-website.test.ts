/**
 * Tests for browse_website tool behavior.
 * @module lib/runner/tools/browser/__tests__/browse-website
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateTask,
  mockCreateSession,
  mockStopSession,
  mockWaitTask,
  MockBrowserUse,
  mockGetProfileForPlatform,
} = vi.hoisted(() => {
  const createTask = vi.fn();
  const createSession = vi.fn();
  const stopSession = vi.fn();
  const waitTask = vi.fn();
  const getProfileForPlatform = vi.fn();
  const BrowserUse = vi.fn(function BrowserUse() {
    return {
      sessions: {
        create: createSession,
        stop: stopSession,
      },
      tasks: {
        create: createTask,
        wait: waitTask,
      },
    };
  });

  return {
    mockCreateTask: createTask,
    mockCreateSession: createSession,
    mockStopSession: stopSession,
    mockWaitTask: waitTask,
    MockBrowserUse: BrowserUse,
    mockGetProfileForPlatform: getProfileForPlatform,
  };
});

vi.mock("browser-use-sdk", () => ({
  BrowserUse: MockBrowserUse,
}));

vi.mock("@/lib/browser-use/profiles", () => ({
  getProfileForPlatform: (...args: unknown[]) => mockGetProfileForPlatform(...args),
}));

import { createBrowseWebsiteTool } from "../browse-website";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;
const MOCK_SUPABASE = { from: vi.fn() } as never;
const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createBrowseWebsiteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BROWSER_USE_API_KEY", "bu_test-key");

    mockCreateSession.mockResolvedValue({ id: "session-1" });
    mockStopSession.mockResolvedValue(undefined);
    mockCreateTask.mockResolvedValue({ id: "task-1" });
    mockWaitTask.mockResolvedValue({
      isSuccess: true,
      output: "Found 5 listings",
      cost: "0.042",
    });
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
      cost: "0.042",
    });
  });

  it("creates a session and stops it after completion", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateSession).toHaveBeenCalledOnce();
    expect(mockCreateSession).toHaveBeenCalledWith({});
    expect(mockStopSession).toHaveBeenCalledWith("session-1");
    expect(mockWaitTask).toHaveBeenCalledWith("task-1");
  });

  it("creates tasks with the fixed model and step limit", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      {
        goal: "Search example.com",
        startUrl: "https://example.com",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Search example.com",
        llm: "browser-use-2.0",
        maxSteps: 25,
        startUrl: "https://example.com",
        sessionId: "session-1",
      }),
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

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task:
          "Search for condos\n\nReturn the results in this format: array of { name, price, url }",
      }),
    );
  });

  it("passes allowedDomains when provided", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await tools.browse_website.execute(
      {
        goal: "Search 99.co",
        allowedDomains: ["99.co"],
      },
      EXECUTION_OPTIONS,
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedDomains: ["99.co"],
      }),
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
    mockWaitTask.mockResolvedValueOnce({
      isSuccess: false,
      output: "Page not found",
      cost: "0.01",
    });

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const result = await tools.browse_website.execute(
      { goal: "Search missing page" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      output: "Page not found",
      cost: "0.01",
    });
  });

  it("rethrows Browser-Use execution errors after session cleanup", async () => {
    mockWaitTask.mockRejectedValueOnce(new Error("Network error"));

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);

    await expect(
      tools.browse_website.execute(
        { goal: "Search for condos" },
        EXECUTION_OPTIONS,
      ),
    ).rejects.toThrow("Network error");
    expect(mockStopSession).toHaveBeenCalledWith("session-1");
  });

  it("swallows session cleanup errors", async () => {
    mockStopSession.mockRejectedValueOnce(new Error("already stopped"));

    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    const result = await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
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
    expect(mockCreateSession).not.toHaveBeenCalled();
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
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("passes a saved profile id to the Browser-Use session", async () => {
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

    expect(mockCreateSession).toHaveBeenCalledWith({ profileId: "profile_123" });
  });

  it("does not look up profiles when no platform is specified", async () => {
    const tools = createBrowseWebsiteTool(MOCK_SUPABASE, CLIENT_ID);
    await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockGetProfileForPlatform).not.toHaveBeenCalled();
    expect(mockCreateSession).toHaveBeenCalledWith({});
  });
});
