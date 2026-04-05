/**
 * Tests for the shared Browser-Use task runner.
 * @module lib/browser-use/__tests__/task-runner
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockGetBrowserUseClient } = vi.hoisted(() => ({
  mockGetBrowserUseClient: vi.fn(),
}));

vi.mock("../client", () => ({
  getBrowserUseClient: mockGetBrowserUseClient,
}));

import { runBrowserTask } from "../task-runner";

const ListingSchema = z.object({
  listings: z.array(
    z.object({
      id: z.string(),
      url: z.string().url(),
    }),
  ),
});

describe("runBrowserTask", () => {
  const mockRun = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrowserUseClient.mockReturnValue({ run: mockRun });
  });

  it("calls client.run with schema output and normalizes numeric cost fields", async () => {
    mockRun.mockResolvedValueOnce({
      isSuccess: true,
      output: {
        listings: [{ id: "pg-1", url: "https://www.propertyguru.com.sg/listing/pg-1" }],
      },
      cost: "0.03",
    });

    const result = await runBrowserTask("Extract listings from page", {
      schema: ListingSchema,
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(mockRun).toHaveBeenCalledWith("Extract listings from page", {
      schema: ListingSchema,
      llm: "browser-use-2.0",
      maxSteps: 20,
    });
    expect(result).toEqual({
      success: true,
      output: {
        listings: [{ id: "pg-1", url: "https://www.propertyguru.com.sg/listing/pg-1" }],
      },
      cost: { total: 0.03, llm: 0, proxy: 0, browser: 0 },
    });
  });

  it("returns a failure envelope when Browser-Use reports the task as unsuccessful", async () => {
    mockRun.mockResolvedValueOnce({
      isSuccess: false,
      output: "Cloudflare blocked navigation",
      cost: "0.01",
    });

    const result = await runBrowserTask("Navigate to blocked page", {
      schema: ListingSchema,
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(result).toEqual({
      success: false,
      error: "Cloudflare blocked navigation",
    });
  });

  it("returns a failure envelope when Browser-Use is not configured", async () => {
    mockGetBrowserUseClient.mockImplementation(() => {
      throw new Error("BROWSER_USE_API_KEY is not configured.");
    });

    const result = await runBrowserTask("Any prompt", {
      schema: ListingSchema,
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(result).toEqual({
      success: false,
      error: "BROWSER_USE_API_KEY is not configured.",
    });
  });

  it("returns a failure envelope when client.run throws unexpectedly", async () => {
    mockRun.mockRejectedValueOnce(new Error("Browser task failed unexpectedly"));

    const result = await runBrowserTask("Any prompt", {
      schema: ListingSchema,
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(result).toEqual({
      success: false,
      error: "Browser task failed unexpectedly",
    });
  });
});
