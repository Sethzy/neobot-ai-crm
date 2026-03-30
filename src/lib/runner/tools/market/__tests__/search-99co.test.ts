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

function createFixtureListing(overrides?: Partial<typeof NINETY_NINE_FIXTURE_LISTING>) {
  return {
    ...NINETY_NINE_FIXTURE_LISTING,
    ...overrides,
    attributes: {
      ...NINETY_NINE_FIXTURE_LISTING.attributes,
      ...overrides?.attributes,
      price: {
        ...NINETY_NINE_FIXTURE_LISTING.attributes.price,
        ...overrides?.attributes?.price,
      },
      psf: {
        ...NINETY_NINE_FIXTURE_LISTING.attributes.psf,
        ...overrides?.attributes?.psf,
      },
      beds: {
        ...NINETY_NINE_FIXTURE_LISTING.attributes.beds,
        ...overrides?.attributes?.beds,
      },
      bathrooms: {
        ...NINETY_NINE_FIXTURE_LISTING.attributes.bathrooms,
        ...overrides?.attributes?.bathrooms,
      },
      floorarea_sqft: {
        ...NINETY_NINE_FIXTURE_LISTING.attributes.floorarea_sqft,
        ...overrides?.attributes?.floorarea_sqft,
      },
    },
    commute_nearest_mrt: {
      ...NINETY_NINE_FIXTURE_LISTING.commute_nearest_mrt,
      ...overrides?.commute_nearest_mrt,
      duration: {
        ...NINETY_NINE_FIXTURE_LISTING.commute_nearest_mrt.duration,
        ...overrides?.commute_nearest_mrt?.duration,
      },
      distance: {
        ...NINETY_NINE_FIXTURE_LISTING.commute_nearest_mrt.distance,
        ...overrides?.commute_nearest_mrt?.distance,
      },
    },
    agent: {
      ...NINETY_NINE_FIXTURE_LISTING.agent,
      ...overrides?.agent,
    },
    usp_tags: overrides?.usp_tags ?? NINETY_NINE_FIXTURE_LISTING.usp_tags,
    photo_urls: overrides?.photo_urls ?? NINETY_NINE_FIXTURE_LISTING.photo_urls,
  };
}

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
    mockRunBrowserTask.mockReset();
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
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain("page_num=1");
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain("page_size=10");
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

  it("paginates within a single search URL until maxItems is satisfied", async () => {
    const firstPage = Array.from({ length: 36 }, (_, index) =>
      createFixtureListing({
        listing_title: `Listing ${index + 1}`,
        listing_url: `/singapore/sale/property/listing-${index + 1}`,
        attributes: {
          listing_id: `listing-${index + 1}`,
          formatted_address: `Address ${index + 1} 12345${String(index).padStart(1, "0")}`,
        },
      }),
    );
    const secondPage = Array.from({ length: 8 }, (_, index) =>
      createFixtureListing({
        listing_title: `Listing ${index + 37}`,
        listing_url: `/singapore/sale/property/listing-${index + 37}`,
        attributes: {
          listing_id: `listing-${index + 37}`,
          formatted_address: `Address ${index + 37} 22345${String(index).padStart(1, "0")}`,
        },
      }),
    );

    mockRunBrowserTask
      .mockResolvedValueOnce({
        success: true,
        output: firstPage,
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      })
      .mockResolvedValueOnce({
        success: true,
        output: secondPage,
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      {
        searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
        maxItems: 40,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledTimes(2);
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain("page_num=1");
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain("page_size=36");
    expect(mockRunBrowserTask.mock.calls[1]?.[0]).toContain("page_num=2");
    expect(mockRunBrowserTask.mock.calls[1]?.[0]).toContain("page_size=4");
    expect(result).toMatchObject({
      success: true,
      count: 40,
      cost: { total: 0.04, llm: 0.02, proxy: 0.01, browser: 0.01 },
    });
  });

  it("maps rent category paths to the correct main_category", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: [NINETY_NINE_FIXTURE_LISTING],
      cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
    });

    const tools = createSearch99coTool();
    await tools.search_99co.execute(
      {
        searchUrls: [
          "https://www.99.co/singapore/rent/hdb?query_ids=planning-area-bedok",
        ],
        maxItems: 5,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain("listing_type=rent");
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain("main_category=hdb");
  });

  it("returns tool-level failures from Browser-Use", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: false,
      error: "99.co task failed",
    });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      {
        searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
        maxItems: 5,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "99.co task failed",
    });
  });

  it("filters malformed listing cards and supports empty task output", async () => {
    mockRunBrowserTask
      .mockResolvedValueOnce({
        success: true,
        output: [
          createFixtureListing(),
          createFixtureListing({
            listing_url: undefined,
            attributes: {
              listing_id: "bad-listing",
            },
          }),
        ],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      })
      .mockResolvedValueOnce({
        success: true,
        output: [],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      });

    const tools = createSearch99coTool();
    const partialResult = await tools.search_99co.execute(
      {
        searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );
    const emptyResult = await tools.search_99co.execute(
      {
        searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(partialResult).toMatchObject({
      success: true,
      count: 1,
    });
    expect(emptyResult).toMatchObject({
      success: true,
      count: 0,
      results: [],
    });
  });
});
