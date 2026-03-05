/**
 * Tests for web search tool behavior.
 * @module lib/runner/tools/web/__tests__/search
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSearchTool } from "../search";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("createSearchTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-key");
  });

  it("returns formatted search results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "HDB Resale Prices 2026",
              url: "https://example.com/hdb",
              description: "Latest HDB resale price data for Singapore.",
            },
          ],
        },
      }),
    });

    const tools = createSearchTool();
    const result = await tools.web_search.execute(
      { query: "HDB resale prices Singapore 2026" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [
        {
          title: "HDB Resale Prices 2026",
          url: "https://example.com/hdb",
          snippet: "Latest HDB resale price data for Singapore.",
        },
      ],
      count: 1,
    });
  });

  it("omits country param when location is not provided (SG unsupported by Brave)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute({ query: "condo prices" }, EXECUTION_OPTIONS);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.has("country")).toBe(false);
  });

  it("sends country param when a supported code is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute({ query: "news", location: "US" }, EXECUTION_OPTIONS);

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("country")).toBe("US");
  });

  it("ignores unsupported country codes like SG", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute({ query: "food", location: "SG" }, EXECUTION_OPTIONS);

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.has("country")).toBe(false);
  });

  it("maps qdr:h to Brave freshness pd", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute({ query: "latest launch", tbs: "qdr:h" }, EXECUTION_OPTIONS);

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("freshness")).toBe("pd");
  });

  it("passes unsupported tbs values through unchanged", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute(
      { query: "market", tbs: "cdr:1,cd_min:01/01/2026,cd_max:02/01/2026" },
      EXECUTION_OPTIONS,
    );

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("freshness")).toBe("cdr:1,cd_min:01/01/2026,cd_max:02/01/2026");
  });

  it("returns an error when BRAVE_SEARCH_API_KEY is missing", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");

    const tools = createSearchTool();
    const result = await tools.web_search.execute({ query: "test" }, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "BRAVE_SEARCH_API_KEY is not configured.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns API errors from Brave", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    const tools = createSearchTool();
    const result = await tools.web_search.execute({ query: "test" }, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "Brave Search API error: 429 Too Many Requests",
    });
  });

  it("returns network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const tools = createSearchTool();
    const result = await tools.web_search.execute({ query: "test" }, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "ECONNREFUSED",
    });
  });

  it("returns timeout error when Brave request aborts and passes AbortSignal", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValueOnce(abortError);

    const tools = createSearchTool();
    const result = await tools.web_search.execute({ query: "timeout case" }, EXECUTION_OPTIONS);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
    expect(result).toEqual({
      success: false,
      error: "Brave Search request timed out.",
    });
  });

  it("clamps limit values over Brave maximum to 20", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();

    await tools.web_search.execute({ query: "test", limit: 21 }, EXECUTION_OPTIONS);

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("count")).toBe("20");
  });
});
