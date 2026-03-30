/**
 * Tests for the 99.co property listing search tool.
 * @module lib/runner/tools/market/__tests__/search-99co
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBrowserTask } = vi.hoisted(() => ({
  mockRunBrowserTask: vi.fn(),
}));

vi.mock("@/lib/browser-use/task-runner", () => ({
  runBrowserTask: mockRunBrowserTask,
}));

import { createSearch99coTool } from "../search-99co";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const NINETY_NINE_FIXTURE_LISTING = {
  listing_title: "1 Bed Condo for Sale in Fourth Avenue Residences",
  listing_url: "/singapore/sale/property/fourth-avenue-residences-condo-9p2puTqAFeWF9nYSgzsAeT",
  photo_urls: ["https://pic2.99.co/v3/photo1.jpg", "https://pic2.99.co/v3/photo2.jpg"],
  attributes: {
    listing_id: "9p2puTqAFeWF9nYSgzsAeT",
    main_category: "condo",
    price: { value: 1200000, formatted_string: "S$ 1,200,000" },
    psf: { formatted_string: "S$ 2,479 psf" },
    beds: { value: "1" },
    bathrooms: { value: 1 },
    floorarea_sqft: { value: 484 },
    top: "2023",
    lease_type: "99 yrs",
    posted_at_formatted: "22m",
    formatted_address: "12 Fourth Avenue 268676",
    highlights: "Quiet Environment",
    est_mortgage_formatted: "Est. Mortgage S$ 4,296/mo",
    lat: 1.3300913829188277,
    lng: 103.796767985324,
  },
  commute_nearest_mrt: {
    name: "Sixth Avenue MRT",
    duration: { value: 1 },
    distance: { value: 73 },
  },
  agent: {
    name: "Rachel Goo",
    phone: "+6592224026",
    whatsapp: "+6592224026",
  },
  usp_tags: [
    "Near MRT Station",
    "Quiet Environment",
    "Investment-Friendly Unit",
  ],
};

describe("createSearch99coTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a live-compatible v11 URL and normalizes listing card output", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: [NINETY_NINE_FIXTURE_LISTING],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      {
        searchUrls: [
          "https://www.99.co/singapore/sale?query_ids=district-10&price_max=2000000",
        ],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledWith(
      expect.stringContaining("https://www.99.co/api/v11/web/search/listings"),
      { schema: expect.anything(), maxCostUsd: 0.05, maxSteps: 20 },
    );
    expect(result).toEqual({
      success: true,
      portal: "99co",
      count: 1,
      results: [
        {
          id: "9p2puTqAFeWF9nYSgzsAeT",
          title: "1 Bed Condo for Sale in Fourth Avenue Residences",
          url: "https://www.99.co/singapore/sale/property/fourth-avenue-residences-condo-9p2puTqAFeWF9nYSgzsAeT",
          address: "12 Fourth Avenue 268676",
          postalCode: "268676",
          price: 1200000,
          priceFormatted: "S$ 1,200,000",
          psfFormatted: "S$ 2,479 psf",
          bedrooms: 1,
          bathrooms: 1,
          floorAreaSqft: 484,
          tenure: "99 yrs",
          builtYear: 2023,
          category: "condo",
          postedAt: "22m",
          highlights: "Quiet Environment",
          mortgageEstimate: "Est. Mortgage S$ 4,296/mo",
          mrtName: "Sixth Avenue MRT",
          mrtDistanceM: 73,
          mrtWalkingMins: 1,
          agentName: "Rachel Goo",
          agentPhone: "+6592224026",
          agentWhatsapp: "+6592224026",
          coordinates: { lat: 1.3300913829188277, lng: 103.796767985324 },
          photos: ["https://pic2.99.co/v3/photo1.jpg", "https://pic2.99.co/v3/photo2.jpg"],
          tags: [
            "Near MRT Station",
            "Quiet Environment",
            "Investment-Friendly Unit",
          ],
        },
      ],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });
  });

  it("runs every provided searchUrl, dedupes by listing URL, and aggregates cost", async () => {
    mockRunBrowserTask
      .mockResolvedValueOnce({
        success: true,
        output: [NINETY_NINE_FIXTURE_LISTING],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      })
      .mockResolvedValueOnce({
        success: true,
        output: [
          NINETY_NINE_FIXTURE_LISTING,
          {
            ...NINETY_NINE_FIXTURE_LISTING,
            listing_title: "1 Room HDB for Sale in 8 Bedok South Avenue 2",
            listing_url:
              "/singapore/sale/property/8-bedok-south-avenue-2-hdb-abc123",
            attributes: {
              ...NINETY_NINE_FIXTURE_LISTING.attributes,
              listing_id: "abc123",
              main_category: "hdb",
              price: { value: 540000, formatted_string: "S$ 540,000" },
              formatted_address: "8 Bedok South Avenue 2 460008",
            },
          },
        ],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      {
        searchUrls: [
          "https://www.99.co/singapore/sale?query_ids=district-10",
          "https://www.99.co/singapore/sale/hdb?price_max=600000&query_ids=planning-area-bukit-panjang",
        ],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      success: true,
      count: 2,
      cost: { total: 0.04, llm: 0.02, proxy: 0.01, browser: 0.01 },
    });
  });
});
