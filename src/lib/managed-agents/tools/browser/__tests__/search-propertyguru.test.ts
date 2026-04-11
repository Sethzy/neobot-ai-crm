import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBrowserTask } = vi.hoisted(() => ({
  mockRunBrowserTask: vi.fn(),
}));

vi.mock("@/lib/browser-use/task-runner", () => ({
  runBrowserTask: mockRunBrowserTask,
}));

import { searchPropertyGuruTool } from "../search-propertyguru";

const PROPERTYGURU_FIXTURE_LISTING = {
  id: 500088257,
  localizedTitle: "Coco Palms",
  url: "https://www.propertyguru.com.sg/listing/for-sale-coco-palms-500088257",
  fullAddress: "21 Pasir Ris Grove",
  price: { value: 2377000, pretty: "S$ 2,377,000" },
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
      images: { items: [{ src: "https://img.pg/1.jpg" }, { src: "https://img.pg/2.jpg" }] },
    },
  },
};

describe("searchPropertyGuruTool", () => {
  beforeEach(() => {
    mockRunBrowserTask.mockReset();
  });

  it("builds a PropertyGuru search URL and normalizes listing output", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: [PROPERTYGURU_FIXTURE_LISTING],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });

    const result = await searchPropertyGuruTool.execute({
      searchQueries: ["east coast"],
      listingType: "sale",
      propertyType: "sg_condo",
      minPrice: 1000000,
      maxPrice: 3000000,
      maxItems: 10,
    });

    expect(mockRunBrowserTask).toHaveBeenCalledWith(
      expect.stringContaining("https://www.propertyguru.com.sg/property-for-sale?freetext=east+coast&property_type=N&minprice=1000000&maxprice=3000000"),
      { schema: expect.anything(), maxCostUsd: 0.05, maxSteps: 20 },
    );
    expect(result).toMatchObject({
      success: true,
      portal: "propertyguru",
      count: 1,
      results: [
        expect.objectContaining({
          id: 500088257,
          propertyType: "Condominium",
          agencyName: "HUTTONS ASIA PTE LTD",
        }),
      ],
    });
  });

  it("returns browser task errors without throwing", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: false,
      error: "task failed",
    });

    const result = await searchPropertyGuruTool.execute({
      startUrls: ["https://www.propertyguru.com.sg/property-for-sale"],
    });

    expect(result).toEqual({ success: false, error: "task failed" });
  });
});
