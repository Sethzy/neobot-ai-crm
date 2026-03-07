/**
 * Tests for loading Composio tools into the runner.
 * @module lib/composio/__tests__/tools
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetComposio, mockConsoleError } = vi.hoisted(() => ({
  mockGetComposio: vi.fn(),
  mockConsoleError: vi.fn(),
}));

vi.mock("../client", () => ({
  getComposio: mockGetComposio,
}));

describe("loadComposioTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.COMPOSIO_API_KEY;
    vi.stubGlobal("console", {
      ...console,
      error: mockConsoleError,
    });
  });

  it("returns an empty tool set when COMPOSIO_API_KEY is missing", async () => {
    const { loadComposioTools } = await import("../tools");

    await expect(loadComposioTools("client-1", ["gmail"])).resolves.toEqual({});
    expect(mockGetComposio).not.toHaveBeenCalled();
  });

  it("returns an empty tool set when COMPOSIO_API_KEY is only whitespace", async () => {
    process.env.COMPOSIO_API_KEY = "   ";
    const { loadComposioTools } = await import("../tools");

    await expect(loadComposioTools("client-1", ["gmail"])).resolves.toEqual({});
    expect(mockGetComposio).not.toHaveBeenCalled();
  });

  it("returns an empty tool set when no toolkits are active", async () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    const { loadComposioTools } = await import("../tools");

    await expect(loadComposioTools("client-1", [])).resolves.toEqual({});
    expect(mockGetComposio).not.toHaveBeenCalled();
  });

  it("loads direct Composio tools for the provided client and toolkits", async () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    const mockedTools = { GMAIL_FETCH_EMAILS: { description: "tool" } };
    const getTools = vi.fn().mockResolvedValue(mockedTools);
    mockGetComposio.mockReturnValue({
      tools: {
        get: getTools,
      },
    });

    const { loadComposioTools } = await import("../tools");
    const result = await loadComposioTools("client-1", ["gmail", "googlecalendar"]);

    expect(result).toEqual(mockedTools);
    expect(getTools).toHaveBeenCalledWith("client-1", {
      toolkits: ["gmail", "googlecalendar"],
    });
  });

  it("falls back to an empty tool set when Composio tool loading throws", async () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    mockGetComposio.mockReturnValue({
      tools: {
        get: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    const { loadComposioTools } = await import("../tools");
    await expect(loadComposioTools("client-1", ["gmail"])).resolves.toEqual({});
    expect(mockConsoleError).toHaveBeenCalled();
  });
});
