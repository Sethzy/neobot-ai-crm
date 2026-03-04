/**
 * Tests for web scrape tool behavior.
 * @module lib/runner/tools/web/__tests__/scrape
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createScrapeTool } from "../scrape";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("createScrapeTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("EXA_API_KEY", "test-exa-key");
  });

  it("returns extracted text content from a URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            url: "https://example.com/article",
            title: "Example Article",
            text: "This is the full article content extracted by Exa.",
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/article" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      url: "https://example.com/article",
      title: "Example Article",
      content: "This is the full article content extracted by Exa.",
    });
  });

  it("accepts Exa responses with content key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            url: "https://example.com/content-shape",
            title: "Content Key Shape",
            text: "Extracted from content key.",
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/content-shape" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      url: "https://example.com/content-shape",
      title: "Content Key Shape",
      content: "Extracted from content key.",
    });
  });

  it("sends correct request body and auth header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", title: "Test", text: "Content" }],
      }),
    });

    const tools = createScrapeTool();
    await tools.web_scrape.execute({ url: "https://example.com" }, EXECUTION_OPTIONS);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [fetchUrl, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toBe("https://api.exa.ai/contents");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["x-api-key"]).toBe("test-exa-key");
    const body = JSON.parse(options.body as string) as {
      urls: string[];
      text: { maxCharacters: number };
    };
    expect(body.urls).toEqual(["https://example.com"]);
    expect(body.text.maxCharacters).toBe(10_000);
  });

  it("returns an error when EXA_API_KEY is missing", async () => {
    vi.stubEnv("EXA_API_KEY", "");

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute({ url: "https://example.com" }, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "EXA_API_KEY is not configured.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns API errors from Exa", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      statusText: "Payment Required",
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute({ url: "https://example.com" }, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "Exa API error: 402 Payment Required",
    });
  });

  it("returns scrape status tags when Exa reports CRAWL_NOT_FOUND", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
        statuses: [
          {
            id: "https://example.com/missing",
            status: "error",
            error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 },
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/missing" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Scrape failed: CRAWL_NOT_FOUND",
    });
  });

  it("returns scrape status tags when Exa reports CRAWL_TIMEOUT", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
        statuses: [
          {
            id: "https://example.com/slow",
            status: "error",
            error: { tag: "CRAWL_TIMEOUT" },
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/slow" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Scrape failed: CRAWL_TIMEOUT",
    });
  });

  it("falls back to first error status when exact URL id does not match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
        statuses: [
          {
            id: "https://example.com/normalized",
            status: "error",
            error: { tag: "CRAWL_NOT_FOUND" },
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/original" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Scrape failed: CRAWL_NOT_FOUND",
    });
  });

  it("falls back to generic extraction error when there is no matching status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
        statuses: [
          {
            id: "https://example.com/other",
            status: "ok",
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/no-status" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "No content could be extracted from the URL.",
    });
  });

  it("returns network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute({ url: "https://example.com" }, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "ECONNREFUSED",
    });
  });

  it("returns timeout error when Exa request aborts and passes AbortSignal", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValueOnce(abortError);

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute({ url: "https://example.com" }, EXECUTION_OPTIONS);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
    expect(result).toEqual({
      success: false,
      error: "Exa scrape request timed out.",
    });
  });

});
