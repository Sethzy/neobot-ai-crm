/**
 * Tests for the PropertyGuru property listing search tool.
 * @module lib/runner/tools/market/__tests__/search-propertyguru
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunActorSync } = vi.hoisted(() => ({
  mockRunActorSync: vi.fn(),
}));

vi.mock("../apify-client", () => ({
  runActorSync: mockRunActorSync,
}));

import { createSearchPropertyguruTool } from "../search-propertyguru";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createSearchPropertyguruTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the corrected pay-per-result actor and hardcodes country for query builder calls", async () => {
    mockRunActorSync.mockResolvedValueOnce([
      {
        id: "24240971",
        title: "Marina Bay Residences",
        images: [
          "https://img/1",
          "https://img/2",
          "https://img/3",
          "https://img/4",
          "https://img/5",
          "https://img/6",
        ],
      },
    ]);

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      {
        searchQueries: ["marina bay"],
        listingType: "sale",
        propertyType: "sg_condo",
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunActorSync).toHaveBeenCalledWith(
      "fatihtahta~propertyguru-scraper-ddproperty-batdongsan-ppe",
      {
        searchQueries: ["marina bay"],
        country: "sg",
        listingType: "sale",
        propertyType: "sg_condo",
        maxItems: 10,
      },
      { maxTotalChargeUsd: 1 },
    );
    expect(result).toEqual({
      success: true,
      portal: "propertyguru",
      count: 1,
      results: [
        {
          id: "24240971",
          title: "Marina Bay Residences",
          images: [
            "https://img/1",
            "https://img/2",
            "https://img/3",
            "https://img/4",
            "https://img/5",
            "https://img/6",
          ],
        },
      ],
    });
  });

  it("prefers startUrls mode and omits query-builder-only fields", async () => {
    mockRunActorSync.mockResolvedValueOnce([]);

    const tools = createSearchPropertyguruTool();
    await tools.search_propertyguru.execute(
      {
        searchQueries: ["should be ignored"],
        startUrls: ["https://www.propertyguru.com.sg/property-for-rent"],
        listingType: "rent",
        propertyType: "sg_landed",
        minPrice: 1000,
        maxPrice: 5000,
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunActorSync).toHaveBeenCalledWith(
      "fatihtahta~propertyguru-scraper-ddproperty-batdongsan-ppe",
      {
        startUrls: ["https://www.propertyguru.com.sg/property-for-rent"],
        maxItems: 10,
      },
      { maxTotalChargeUsd: 1 },
    );
  });

  it("requires at least one non-blank search query or a start URL", () => {
    const tools = createSearchPropertyguruTool();

    expect(
      tools.search_propertyguru.inputSchema.safeParse({
        searchQueries: ["   "],
      }).success,
    ).toBe(false);
    expect(
      tools.search_propertyguru.inputSchema.safeParse({}).success,
    ).toBe(false);
  });

  it("rejects non-PropertyGuru Singapore start URLs", () => {
    const tools = createSearchPropertyguruTool();
    const parsed = tools.search_propertyguru.inputSchema.safeParse({
      startUrls: ["https://fake-propertyguru.com.sg/listing/123"],
    });

    expect(parsed.success).toBe(false);
  });

  it("aligns maxItems with the actor minimum and chat payload ceiling", () => {
    const tools = createSearchPropertyguruTool();

    expect(
      tools.search_propertyguru.inputSchema.safeParse({
        searchQueries: ["marina bay"],
        maxItems: 9,
      }).success,
    ).toBe(false);
    expect(
      tools.search_propertyguru.inputSchema.safeParse({
        searchQueries: ["marina bay"],
        maxItems: 101,
      }).success,
    ).toBe(false);
  });
});
