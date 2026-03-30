/**
 * PropertyGuru public listing search tool backed by Browser-Use Cloud.
 * @module lib/runner/tools/market/search-propertyguru
 */
import { tool } from "ai";
import { z } from "zod";

import { runBrowserTask } from "@/lib/browser-use/task-runner";

const ALLOWED_PROPERTYGURU_HOSTS = new Set([
  "propertyguru.com.sg",
  "www.propertyguru.com.sg",
]);
const MAX_TOOL_ITEMS = 100;
const MIN_PROVIDER_ITEMS = 10;
const MAX_COST_PER_SEARCH_USD = 0.05;
const MAX_STEPS = 20;
const PROPERTYGURU_BASE_URL = "https://www.propertyguru.com.sg";

const LISTING_TYPE_PATH = {
  sale: "property-for-sale",
  rent: "property-for-rent",
} as const;

const PROPERTY_TYPE_PARAM = {
  sg_all: undefined,
  sg_condo: "N",
  sg_hdb: "H",
  sg_landed: "L",
} as const;

const propertyGuruRawListingSchema = z.object({
  id: z.number().optional(),
  localizedTitle: z.string().optional(),
  url: z.string().url().optional(),
  fullAddress: z.string().optional(),
  price: z
    .object({
      value: z.number().optional(),
      pretty: z.string().optional(),
    })
    .optional(),
  psfText: z.string().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  floorArea: z.number().optional(),
  badges: z
    .array(
      z.object({
        name: z.string().optional(),
        text: z.string().optional(),
      }),
    )
    .optional(),
  additionalData: z
    .object({
      tenure: z.string().optional(),
      districtCode: z.string().optional(),
      districtText: z.string().optional(),
    })
    .optional(),
  mrt: z
    .object({
      nearbyText: z.string().optional(),
    })
    .optional(),
  postedOn: z
    .object({
      text: z.string().optional(),
    })
    .optional(),
  agent: z
    .object({
      name: z.string().optional(),
      license: z.string().optional(),
      profileUrl: z.string().optional(),
    })
    .optional(),
  agency: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
  thumbnail: z.string().optional(),
  mediaCarousel: z
    .object({
      previewMedia: z
        .object({
          images: z
            .object({
              items: z.array(z.object({ src: z.string().optional() })).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const propertyGuruTaskOutputSchema = z.array(propertyGuruRawListingSchema);

type PropertyGuruRawListing = z.output<typeof propertyGuruRawListingSchema>;

interface PropertyGuruListing {
  id: number;
  title?: string;
  url: string;
  address?: string;
  price: number;
  priceFormatted?: string;
  psfFormatted?: string;
  bedrooms?: number;
  bathrooms?: number;
  floorAreaSqft?: number;
  propertyType?: string;
  tenure?: string;
  districtCode?: string;
  districtText?: string;
  mrtProximity?: string;
  postedOn?: string;
  agentName?: string;
  agentLicense?: string;
  agencyName?: string;
  agentProfileUrl?: string;
  thumbnail?: string;
  images?: string[];
}

function isAllowedPropertyguruUrl(value: string): boolean {
  return ALLOWED_PROPERTYGURU_HOSTS.has(new URL(value).hostname);
}

function buildSearchUrl(params: {
  searchQuery?: string;
  listingType?: "sale" | "rent";
  propertyType?: "sg_all" | "sg_condo" | "sg_landed" | "sg_hdb";
  minPrice?: number;
  maxPrice?: number;
}): string {
  const path = LISTING_TYPE_PATH[params.listingType ?? "sale"];
  const url = new URL(`${PROPERTYGURU_BASE_URL}/${path}`);

  if (params.searchQuery) {
    url.searchParams.set("freetext", params.searchQuery);
  }

  const propertyTypeParam = PROPERTY_TYPE_PARAM[params.propertyType ?? "sg_all"];
  if (propertyTypeParam) {
    url.searchParams.set("property_type", propertyTypeParam);
  }

  if (typeof params.minPrice === "number") {
    url.searchParams.set("minprice", String(params.minPrice));
  }

  if (typeof params.maxPrice === "number") {
    url.searchParams.set("maxprice", String(params.maxPrice));
  }

  return url.toString();
}

function normalizePropertyGuruListing(
  listing: PropertyGuruRawListing,
): PropertyGuruListing | null {
  if (
    typeof listing.id !== "number" ||
    typeof listing.url !== "string" ||
    typeof listing.price?.value !== "number"
  ) {
    return null;
  }

  const unitTypeBadge = listing.badges?.find((badge) => badge.name === "unit_type");
  const tenureBadge = listing.badges?.find((badge) => badge.name === "tenure");
  const images = listing.mediaCarousel?.previewMedia?.images?.items
    ?.map((item) => item.src)
    .filter((item): item is string => Boolean(item));

  return {
    id: listing.id,
    title: listing.localizedTitle,
    url: listing.url,
    address: listing.fullAddress,
    price: listing.price.value,
    priceFormatted: listing.price.pretty,
    psfFormatted: listing.psfText,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    floorAreaSqft: listing.floorArea,
    propertyType: unitTypeBadge?.text,
    tenure: tenureBadge?.text ?? listing.additionalData?.tenure,
    districtCode: listing.additionalData?.districtCode,
    districtText: listing.additionalData?.districtText,
    mrtProximity: listing.mrt?.nearbyText,
    postedOn: listing.postedOn?.text,
    agentName: listing.agent?.name,
    agentLicense: listing.agent?.license,
    agencyName: listing.agency?.name,
    agentProfileUrl: listing.agent?.profileUrl
      ? new URL(listing.agent.profileUrl, PROPERTYGURU_BASE_URL).toString()
      : undefined,
    thumbnail: listing.thumbnail,
    images: images?.length ? images : undefined,
  };
}

const searchPropertyguruInputSchema = z
  .object({
    searchQueries: z
      .array(z.string().trim().min(1, "Search queries cannot be blank"))
      .optional()
      .describe(
        "Free-text PropertyGuru search queries. Only used when startUrls is empty.",
      ),
    startUrls: z
      .array(
        z.string().url().refine(isAllowedPropertyguruUrl, {
          message: "Must be a PropertyGuru Singapore URL (propertyguru.com.sg)",
        }),
      )
      .optional()
      .describe(
        "Direct PropertyGuru Singapore search result URLs. Overrides query-builder fields when provided.",
      ),
    listingType: z.enum(["sale", "rent"]).default("sale").optional(),
    propertyType: z
      .enum(["sg_all", "sg_condo", "sg_landed", "sg_hdb"])
      .default("sg_all")
      .optional(),
    minPrice: z.number().int().optional(),
    maxPrice: z.number().int().optional(),
    maxItems: z
      .number()
      .int()
      .min(MIN_PROVIDER_ITEMS)
      .max(MAX_TOOL_ITEMS)
      .default(MAX_TOOL_ITEMS)
      .optional()
      .describe(
        `Maximum listings to return. Minimum ${MIN_PROVIDER_ITEMS}, default ${MAX_TOOL_ITEMS}.`,
      ),
  })
  .refine(
    (value) =>
      (value.searchQueries?.length ?? 0) > 0 ||
      (value.startUrls?.length ?? 0) > 0,
    { message: "At least one of searchQueries or startUrls is required" },
  );

/**
 * Creates the PropertyGuru listing tool.
 */
export function createSearchPropertyguruTool() {
  const search_propertyguru = tool({
    description:
      "Search current public PropertyGuru Singapore listings using queries or direct search result URLs.",
    inputSchema: searchPropertyguruInputSchema,
    execute: async ({
      searchQueries,
      startUrls,
      listingType,
      propertyType,
      minPrice,
      maxPrice,
      maxItems,
    }) => {
      const targetUrls =
        startUrls && startUrls.length > 0
          ? startUrls
          : (searchQueries ?? []).map((searchQuery) =>
              buildSearchUrl({
                searchQuery,
                listingType,
                propertyType,
                minPrice,
                maxPrice,
              }),
            );
      const resolvedMaxItems = maxItems ?? MAX_TOOL_ITEMS;
      const resultMap = new Map<string, PropertyGuruListing>();
      const totalCost = { total: 0, llm: 0, proxy: 0, browser: 0 };

      for (const searchUrl of targetUrls) {
        if (resultMap.size >= resolvedMaxItems) {
          break;
        }

        const remainingItems = resolvedMaxItems - resultMap.size;
        const taskPrompt = [
          `Navigate to ${searchUrl}.`,
          "Wait for the page to fully load.",
          "Read the JSON from window.__NEXT_DATA__.",
          `Collect up to ${remainingItems} listings across the current and subsequent result pages until you reach the limit or there are no more pages.`,
          "Extract props.pageProps.pageData.data.listingsData[].listingData from each visited result page.",
          "Return a single combined listingData array exactly.",
        ].join("\n");

        const taskResult = await runBrowserTask(taskPrompt, {
          schema: propertyGuruTaskOutputSchema,
          maxCostUsd: MAX_COST_PER_SEARCH_USD,
          maxSteps: MAX_STEPS,
        });

        if (!taskResult.success) {
          return {
            success: false as const,
            error: taskResult.error,
          };
        }

        totalCost.total += taskResult.cost.total;
        totalCost.llm += taskResult.cost.llm;
        totalCost.proxy += taskResult.cost.proxy;
        totalCost.browser += taskResult.cost.browser;
        for (const listing of taskResult.output) {
          const normalizedListing = normalizePropertyGuruListing(listing);
          if (normalizedListing) {
            resultMap.set(normalizedListing.url, normalizedListing);
          }
        }
      }

      const results = Array.from(resultMap.values()).slice(0, resolvedMaxItems);

      return {
        success: true as const,
        portal: "propertyguru" as const,
        count: results.length,
        results,
        cost: totalCost,
      };
    },
  });

  return { search_propertyguru };
}
