/**
 * Tests for the 99.co property listing search tool.
 * @module lib/runner/tools/market/__tests__/search-99co
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunActorSync } = vi.hoisted(() => ({
  mockRunActorSync: vi.fn(),
}));

vi.mock("../apify-client", () => ({
  runActorSync: mockRunActorSync,
}));

import { createSearch99coTool } from "../search-99co";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createSearch99coTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns listings in a thin success envelope", async () => {
    mockRunActorSync.mockResolvedValueOnce([
      {
        listing_title: "City Gate",
        listing_url: "/singapore/sale/property/city-gate-condo-1",
        photo_urls: [
          "https://img/1",
          "https://img/2",
          "https://img/3",
          "https://img/4",
          "https://img/5",
          "https://img/6",
        ],
      },
    ]);

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      {
        searchUrls: [
          "https://www.99.co/singapore/sale?query_ids=district-10&price_max=2000000",
        ],
        maxItems: 12,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunActorSync).toHaveBeenCalledWith(
      "easyapi/99-co-property-listings-scraper",
      {
        searchUrls: [
          "https://www.99.co/singapore/sale?query_ids=district-10&price_max=2000000",
        ],
        maxItems: 12,
      },
      { maxTotalChargeUsd: 1 },
    );
    expect(result).toEqual({
      success: true,
      portal: "99co",
      count: 1,
      results: [
        {
          listing_title: "City Gate",
          listing_url: "https://www.99.co/singapore/sale/property/city-gate-condo-1",
          photo_urls: [
            "https://img/1",
            "https://img/2",
            "https://img/3",
            "https://img/4",
            "https://img/5",
          ],
        },
      ],
    });
  });

  it("rejects malicious lookalike hosts at the schema layer", () => {
    const tools = createSearch99coTool();
    const parsed = tools.search_99co.inputSchema.safeParse({
      searchUrls: ["https://evil99.co/singapore/sale?query_ids=district-10"],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects non-Singapore 99.co paths at the schema layer", () => {
    const tools = createSearch99coTool();
    const parsed = tools.search_99co.inputSchema.safeParse({
      searchUrls: ["https://www.99.co/malaysia/sale?query_ids=kuala-lumpur"],
    });

    expect(parsed.success).toBe(false);
  });

  it("caps maxItems for chat-sized payloads", () => {
    const tools = createSearch99coTool();
    const parsed = tools.search_99co.inputSchema.safeParse({
      searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
      maxItems: 31,
    });

    expect(parsed.success).toBe(false);
  });

  it("returns a structured failure envelope when scraping times out", async () => {
    mockRunActorSync.mockRejectedValueOnce(
      new Error("Scraping timed out — try fewer results or a narrower search"),
    );

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      {
        searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Scraping timed out — try fewer results or a narrower search",
    });
  });
});
