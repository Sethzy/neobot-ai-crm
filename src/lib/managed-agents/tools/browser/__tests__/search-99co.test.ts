import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBrowserTask } = vi.hoisted(() => ({
  mockRunBrowserTask: vi.fn(),
}));

vi.mock("@/lib/browser-use/task-runner", () => ({
  runBrowserTask: mockRunBrowserTask,
}));

import { search99coTool } from "../search-99co";

const NINETY_NINE_FIXTURE_LISTING = {
  listing_title: "1 Bed Condo for Sale in Fourth Avenue Residences",
  listing_url: "/singapore/sale/property/fourth-avenue-residences-condo-9p2puTqAFeWF9nYSgzsAeT",
  photo_urls: ["https://pic2.99.co/v3/photo1.jpg"],
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
    lat: 1.33,
    lng: 103.79,
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
  usp_tags: ["Near MRT Station"],
};

describe("search99coTool", () => {
  beforeEach(() => {
    mockRunBrowserTask.mockReset();
  });

  it("normalizes 99.co listing output", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: [NINETY_NINE_FIXTURE_LISTING],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });

    const result = await search99coTool.execute({
      searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10&price_max=2000000"],
      maxItems: 10,
    });

    expect(mockRunBrowserTask).toHaveBeenCalledWith(
      expect.stringContaining("https://www.99.co/api/v11/web/search/listings"),
      { schema: expect.anything(), maxCostUsd: 0.05, maxSteps: 20 },
    );
    expect(result).toMatchObject({
      success: true,
      portal: "99co",
      count: 1,
      results: [
        expect.objectContaining({
          id: "9p2puTqAFeWF9nYSgzsAeT",
          postalCode: "268676",
          agentName: "Rachel Goo",
        }),
      ],
    });
  });

  it("returns tool errors without throwing", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: false,
      error: "browser task failed",
    });

    const result = await search99coTool.execute({
      searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
    });

    expect(result).toEqual({ success: false, error: "browser task failed" });
  });
});
