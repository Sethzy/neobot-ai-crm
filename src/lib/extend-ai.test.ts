/**
 * @file Tests for ExtendAI raw fetch integration
 * @description Verifies fetch is called with correct payload and headers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock retry utilities
vi.mock("./retry.js", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
  shouldRetry: vi.fn().mockReturnValue(true),
  calculateBackoff: vi.fn().mockReturnValue(1000),
}));

import { sleep, shouldRetry, calculateBackoff } from "./retry.js";

describe("runExtraction with raw fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  const validRequest = {
    processorId: "dp_test123",
    fileUrl: "https://example.com/file.pdf",
    pageRange: { start: 5, end: 10 },
    config: {
      type: "EXTRACT" as const,
      baseProcessor: "extraction_light",
      baseVersion: "3.4.0",
      schema: { type: "object", properties: { amount: { type: "number" } } },
      advancedOptions: { citationsEnabled: true },
    },
  };

  it("calls fetch with correct URL and headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        processorRun: {
          id: "run_123",
          status: "PROCESSED",
          output: { value: {}, metadata: {} },
        },
      }),
    });

    const { runExtraction } = await import("./extend-ai.js");
    await runExtraction(validRequest, "test_api_key");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.extend.ai/processor_runs",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Authorization": "Bearer test_api_key",
          "Content-Type": "application/json",
          "x-extend-api-version": "2025-04-21",
        },
      })
    );
  });

  it("sends correct payload with config and 1-indexed pageRanges (no conversion)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        processorRun: {
          id: "run_123",
          status: "PROCESSED",
          output: { value: {}, metadata: {} },
        },
      }),
    });

    const { runExtraction } = await import("./extend-ai.js");
    await runExtraction(validRequest, "test_api_key");

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body).toEqual({
      processorId: "dp_test123",
      file: { fileUrl: "https://example.com/file.pdf" },
      sync: true,
      config: {
        type: "EXTRACT",
        baseProcessor: "extraction_light",
        baseVersion: "3.4.0",
        schema: { type: "object", properties: { amount: { type: "number" } } },
        advancedOptions: {
          citationsEnabled: true,
          pageRanges: [{ start: 5, end: 10 }], // 1-indexed - no conversion needed
        },
      },
    });
  });

  it("maps successful response to ExtendExtractionResult", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        processorRun: {
          id: "run_abc",
          status: "PROCESSED",
          output: {
            value: { amount: 500, provider: "Hospital" },
            metadata: { amount: { ocrConfidence: 0.95 } },
          },
          failureReason: null,
          failureMessage: null,
        },
      }),
    });

    const { runExtraction } = await import("./extend-ai.js");
    const result = await runExtraction(validRequest, "test_key");

    expect(result).toEqual({
      success: true,
      runId: "run_abc",
      status: "PROCESSED",
      value: { amount: 500, provider: "Hospital" },
      metadata: { amount: { ocrConfidence: 0.95 } },
      failureReason: null,
      failureMessage: null,
    });
  });
});

describe("runExtraction error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldRetry).mockReturnValue(false); // Don't retry for error tests
  });

  afterEach(() => {
    vi.resetModules();
  });

  const validRequest = {
    processorId: "dp_test",
    fileUrl: "https://example.com/file.pdf",
    pageRange: { start: 1, end: 1 },
    config: {
      type: "EXTRACT" as const,
      baseProcessor: "extraction_light",
      baseVersion: "3.4.0",
      schema: {},
      advancedOptions: {},
    },
  };

  it("throws descriptive error for 400 Bad Request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid schema format"),
    });

    const { runExtraction } = await import("./extend-ai.js");

    await expect(runExtraction(validRequest, "test_key")).rejects.toThrow(
      "Invalid extraction request"
    );
  });

  it("throws descriptive error for 401 Unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Invalid token"),
    });

    const { runExtraction } = await import("./extend-ai.js");

    await expect(runExtraction(validRequest, "test_key")).rejects.toThrow(
      "ExtendAI authentication failed"
    );
  });

  it("throws descriptive error for 429 Too Many Requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    const { runExtraction } = await import("./extend-ai.js");

    await expect(runExtraction(validRequest, "test_key")).rejects.toThrow(
      "ExtendAI rate limit exceeded"
    );
  });

  it("throws generic error for other status codes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal server error"),
    });

    const { runExtraction } = await import("./extend-ai.js");

    await expect(runExtraction(validRequest, "test_key")).rejects.toThrow(
      "ExtendAI API error: 500"
    );
  });
});

describe("runExtraction metadata enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldRetry).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetModules();
  });

  const validRequest = {
    processorId: "dp_test",
    fileUrl: "https://example.com/file.pdf",
    config: {
      type: "EXTRACT" as const,
      baseProcessor: "extraction_light",
      baseVersion: "3.4.0",
      schema: {},
      advancedOptions: {},
    },
  };

  it("includes dashboardUrl from run.url in result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        processorRun: {
          id: "run_123",
          status: "PROCESSED",
          url: "https://dashboard.extend.ai/runs/run_123",
          output: { value: { amount: 100 }, metadata: {} },
          config: { schema: { properties: {} } },
        },
      }),
    });

    const { runExtraction } = await import("./extend-ai.js");
    const result = await runExtraction(validRequest, "test_key");

    expect(result.dashboardUrl).toBe("https://dashboard.extend.ai/runs/run_123");
  });

  it("includes field descriptions from config.schema.properties", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        processorRun: {
          id: "run_123",
          status: "PROCESSED",
          output: {
            value: { amount: 100, provider: "Hospital" },
            metadata: {
              amount: { ocrConfidence: 0.95, citations: [] },
              provider: { ocrConfidence: 0.8, citations: [] },
            },
          },
          config: {
            schema: {
              properties: {
                amount: { type: "number", description: "Total bill amount" },
                provider: { type: "string", description: "Healthcare provider name" },
              },
            },
          },
        },
      }),
    });

    const { runExtraction } = await import("./extend-ai.js");
    const result = await runExtraction(validRequest, "test_key");

    expect(result.metadata.amount.description).toBe("Total bill amount");
    expect(result.metadata.provider.description).toBe("Healthcare provider name");
  });

  it("handles missing descriptions gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        processorRun: {
          id: "run_123",
          status: "PROCESSED",
          output: {
            value: { amount: 100 },
            metadata: { amount: { ocrConfidence: 0.95 } },
          },
          config: { schema: { properties: {} } }, // No description for amount
        },
      }),
    });

    const { runExtraction } = await import("./extend-ai.js");
    const result = await runExtraction(validRequest, "test_key");

    expect(result.metadata.amount.description).toBeUndefined();
  });
});

describe("runExtraction retry logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldRetry).mockReturnValue(true);
    vi.mocked(calculateBackoff).mockImplementation((attempt) => 1000 * Math.pow(2, attempt - 1));
  });

  afterEach(() => {
    vi.resetModules();
  });

  const validRequest = {
    processorId: "dp_test",
    fileUrl: "https://example.com/file.pdf",
    pageRange: { start: 1, end: 1 },
    config: {
      type: "EXTRACT" as const,
      baseProcessor: "extraction_light",
      baseVersion: "3.4.0",
      schema: {},
      advancedOptions: {},
    },
  };

  it("retries up to 3 times on transient failures", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("error") })
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("error") })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          processorRun: { id: "run_123", status: "PROCESSED", output: { value: {}, metadata: {} } },
        }),
      });

    const { runExtraction } = await import("./extend-ai.js");
    const result = await runExtraction(validRequest, "test_key");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // Backoff between retries
    expect(result.success).toBe(true);
  });

  it("throws after 3 failed attempts", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server error"),
    });

    const { runExtraction } = await import("./extend-ai.js");

    await expect(runExtraction(validRequest, "test_key")).rejects.toThrow(
      "ExtendAI API error: 500"
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors (400)", async () => {
    vi.mocked(shouldRetry).mockReturnValue(false);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad request"),
    });

    const { runExtraction } = await import("./extend-ai.js");

    await expect(runExtraction(validRequest, "test_key")).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses exponential backoff (1s, 2s, 4s)", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("error") })
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("error") })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          processorRun: { id: "run_123", status: "PROCESSED", output: { value: {}, metadata: {} } },
        }),
      });

    const { runExtraction } = await import("./extend-ai.js");
    await runExtraction(validRequest, "test_key");

    expect(calculateBackoff).toHaveBeenCalledWith(1);
    expect(calculateBackoff).toHaveBeenCalledWith(2);
    expect(sleep).toHaveBeenCalledWith(1000); // 2^0 * 1000
    expect(sleep).toHaveBeenCalledWith(2000); // 2^1 * 1000
  });
});
