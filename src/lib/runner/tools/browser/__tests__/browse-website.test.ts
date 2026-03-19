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
} = vi.hoisted(() => {
  const createTask = vi.fn();
  const createSession = vi.fn();
  const stopSession = vi.fn();
  const waitTask = vi.fn();
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
  };
});

vi.mock("browser-use-sdk", () => ({
  BrowserUse: MockBrowserUse,
}));

import { createBrowseWebsiteTool } from "../browse-website";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

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
  });

  it("returns browsing results for a public site", async () => {
    const tools = createBrowseWebsiteTool();
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
    const tools = createBrowseWebsiteTool();

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
    const tools = createBrowseWebsiteTool();

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
    const tools = createBrowseWebsiteTool();

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
    const tools = createBrowseWebsiteTool();

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

  it("returns unsuccessful task results without throwing", async () => {
    mockWaitTask.mockResolvedValueOnce({
      isSuccess: false,
      output: "Page not found",
      cost: "0.01",
    });

    const tools = createBrowseWebsiteTool();
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

  it("stops the session even when task execution throws", async () => {
    mockWaitTask.mockRejectedValueOnce(new Error("Network error"));

    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      { goal: "Search for condos" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Network error",
    });
    expect(mockStopSession).toHaveBeenCalledWith("session-1");
  });

  it("swallows session cleanup errors", async () => {
    mockStopSession.mockRejectedValueOnce(new Error("already stopped"));

    const tools = createBrowseWebsiteTool();
    const result = await tools.browse_website.execute(
      { goal: "Search example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
  });

  it("returns an error when BROWSER_USE_API_KEY is missing", async () => {
    vi.stubEnv("BROWSER_USE_API_KEY", "");

    const tools = createBrowseWebsiteTool();
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
});
