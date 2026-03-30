/**
 * Tests for the PropertyGuru property listing search tool.
 * @module lib/runner/tools/market/__tests__/search-propertyguru
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBrowserTask } = vi.hoisted(() => ({
  mockRunBrowserTask: vi.fn(),
}));

vi.mock("@/lib/browser-use/task-runner", () => ({
  runBrowserTask: mockRunBrowserTask,
}));

import { createSearchPropertyguruTool } from "../search-propertyguru";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

function createFixtureListing(
  overrides?: Partial<typeof PROPERTYGURU_FIXTURE_LISTING>,
) {
  return {
    ...PROPERTYGURU_FIXTURE_LISTING,
    ...overrides,
    price: {
      ...PROPERTYGURU_FIXTURE_LISTING.price,
      ...overrides?.price,
    },
    additionalData: {
      ...PROPERTYGURU_FIXTURE_LISTING.additionalData,
      ...overrides?.additionalData,
    },
    mrt: {
      ...PROPERTYGURU_FIXTURE_LISTING.mrt,
      ...overrides?.mrt,
    },
    postedOn: {
      ...PROPERTYGURU_FIXTURE_LISTING.postedOn,
      ...overrides?.postedOn,
    },
    agent: {
      ...PROPERTYGURU_FIXTURE_LISTING.agent,
      ...overrides?.agent,
    },
    agency: {
      ...PROPERTYGURU_FIXTURE_LISTING.agency,
      ...overrides?.agency,
    },
    mediaCarousel: {
      ...PROPERTYGURU_FIXTURE_LISTING.mediaCarousel,
      ...overrides?.mediaCarousel,
      previewMedia: {
        ...PROPERTYGURU_FIXTURE_LISTING.mediaCarousel.previewMedia,
        ...overrides?.mediaCarousel?.previewMedia,
        images: {
          ...PROPERTYGURU_FIXTURE_LISTING.mediaCarousel.previewMedia.images,
          ...overrides?.mediaCarousel?.previewMedia?.images,
        },
      },
    },
  };
}

const PROPERTYGURU_FIXTURE_LISTING = {
  id: 500088257,
  localizedTitle: "Coco Palms",
  url: "https://www.propertyguru.com.sg/listing/for-sale-coco-palms-500088257",
  fullAddress: "21 Pasir Ris Grove",
  price: {
    value: 2377000,
    pretty: "S$ 2,377,000",
  },
  psfText: "S$ 1,711.30 psf",
  bedrooms: 4,
  bathrooms: 3,
  floorArea: 1389,
  badges: [
    { name: "unit_type", text: "Condominium" },
    { name: "tenure", text: "99-year Leasehold" },
  ],
  additionalData: {
    tenure: "L99",
    districtCode: "D18",
    districtText: "Pasir Ris / Tampines",
  },
  mrt: { nearbyText: "6 min (480 m) from CP1 Pasir Ris MRT Station" },
  postedOn: { text: "Listed on Mar 30, 2026 (38m ago)" },
  agent: {
    name: "Henry Lim",
    license: "R000000A",
    profileUrl: "/agent/henry-lim-10353426",
  },
  agency: { name: "HUTTONS ASIA PTE LTD" },
  thumbnail: "https://img.pg/cover.jpg",
  mediaCarousel: {
    previewMedia: {
      images: {
        items: [{ src: "https://img.pg/1.jpg" }, { src: "https://img.pg/2.jpg" }],
      },
    },
  },
};

describe("createSearchPropertyguruTool", () => {
  beforeEach(() => {
    mockRunBrowserTask.mockReset();
  });

  it("builds a live-compatible search URL and normalizes listingData output", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: [PROPERTYGURU_FIXTURE_LISTING],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      {
        searchQueries: ["east coast"],
        listingType: "sale",
        propertyType: "sg_condo",
        minPrice: 1000000,
        maxPrice: 3000000,
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://www.propertyguru.com.sg/property-for-sale?freetext=east+coast&property_type=N&minprice=1000000&maxprice=3000000",
      ),
      { schema: expect.anything(), maxCostUsd: 0.05, maxSteps: 20 },
    );
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain(
      "Collect up to 10 listings across the current and subsequent result pages",
    );
    expect(result).toEqual({
      success: true,
      portal: "propertyguru",
      count: 1,
      results: [
        {
          id: 500088257,
          title: "Coco Palms",
          url: "https://www.propertyguru.com.sg/listing/for-sale-coco-palms-500088257",
          address: "21 Pasir Ris Grove",
          price: 2377000,
          priceFormatted: "S$ 2,377,000",
          psfFormatted: "S$ 1,711.30 psf",
          bedrooms: 4,
          bathrooms: 3,
          floorAreaSqft: 1389,
          propertyType: "Condominium",
          tenure: "99-year Leasehold",
          districtCode: "D18",
          districtText: "Pasir Ris / Tampines",
          mrtProximity: "6 min (480 m) from CP1 Pasir Ris MRT Station",
          postedOn: "Listed on Mar 30, 2026 (38m ago)",
          agentName: "Henry Lim",
          agentLicense: "R000000A",
          agencyName: "HUTTONS ASIA PTE LTD",
          agentProfileUrl: "https://www.propertyguru.com.sg/agent/henry-lim-10353426",
          thumbnail: "https://img.pg/cover.jpg",
          images: ["https://img.pg/1.jpg", "https://img.pg/2.jpg"],
        },
      ],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });
  });

  it("runs every provided startUrl and combines normalized results", async () => {
    mockRunBrowserTask
      .mockResolvedValueOnce({
        success: true,
        output: [PROPERTYGURU_FIXTURE_LISTING],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      })
      .mockResolvedValueOnce({
        success: true,
        output: [
          {
            ...PROPERTYGURU_FIXTURE_LISTING,
            id: 500054688,
            localizedTitle: "Piccadilly Grand",
            url: "https://www.propertyguru.com.sg/listing/for-sale-piccadilly-grand-500054688",
          },
        ],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      {
        startUrls: [
          "https://www.propertyguru.com.sg/property-for-sale",
          "https://www.propertyguru.com.sg/property-for-sale?property_type=H",
        ],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledTimes(2);
    expect(mockRunBrowserTask.mock.calls[0]?.[0]).toContain(
      "https://www.propertyguru.com.sg/property-for-sale",
    );
    expect(mockRunBrowserTask.mock.calls[1]?.[0]).toContain(
      "https://www.propertyguru.com.sg/property-for-sale?property_type=H",
    );
    expect(result).toMatchObject({
      success: true,
      count: 2,
      cost: { total: 0.04, llm: 0.02, proxy: 0.01, browser: 0.01 },
    });
  });

  it("stops calling extra URLs once maxItems is satisfied", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: Array.from({ length: 10 }, (_, index) =>
        createFixtureListing({
          id: 500088257 + index,
          localizedTitle: `Listing ${index + 1}`,
          url: `https://www.propertyguru.com.sg/listing/for-sale-listing-${index + 1}`,
        }),
      ),
      cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      {
        startUrls: [
          "https://www.propertyguru.com.sg/property-for-sale",
          "https://www.propertyguru.com.sg/property-for-sale?property_type=H",
        ],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      count: 10,
    });
  });

  it("returns tool-level failures from Browser-Use", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: false,
      error: "PropertyGuru task failed",
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      {
        searchQueries: ["east coast"],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "PropertyGuru task failed",
    });
  });

  it("filters malformed listings, preserves empty output, and dedupes repeated URLs", async () => {
    mockRunBrowserTask
      .mockResolvedValueOnce({
        success: true,
        output: [
          createFixtureListing(),
          createFixtureListing({
            price: {
              value: undefined,
              pretty: "S$ 2,377,000",
            },
          }),
          createFixtureListing(),
        ],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      })
      .mockResolvedValueOnce({
        success: true,
        output: [],
        cost: { total: 0.02, llm: 0.01, proxy: 0.005, browser: 0.005 },
      });

    const tools = createSearchPropertyguruTool();
    const partialResult = await tools.search_propertyguru.execute(
      {
        searchQueries: ["east coast"],
        maxItems: 10,
      },
      EXECUTION_OPTIONS,
    );
    const emptyResult = await tools.search_propertyguru.execute(
      {
        searchQueries: ["east coast"],
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
