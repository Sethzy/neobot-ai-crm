/**
 * 99.co public listing search tool backed by Browser-Use Cloud.
 * @module lib/runner/tools/market/search-99co
 */
import { tool } from "ai";
import { z } from "zod";

import { runBrowserTask } from "@/lib/browser-use/task-runner";

const ALLOWED_99CO_HOSTS = new Set(["99.co", "www.99.co"]);
const MAX_TOOL_ITEMS = 100;
const MAX_COST_PER_SEARCH_USD = 0.05;
const MAX_STEPS = 20;
const NINETY_NINE_BASE_URL = "https://www.99.co";
const NINETY_NINE_PAGE_SIZE = 36;
const MAIN_CATEGORY_BY_PATH = {
  "/singapore/sale/condos-apartments": "condo",
  "/singapore/sale/hdb": "hdb",
  "/singapore/sale/houses": "landed",
  "/singapore/rent/condos-apartments": "condo",
  "/singapore/rent/hdb": "hdb",
  "/singapore/rent/houses": "landed",
} as const;

const ninetyNineRawListingSchema = z.object({
  listing_title: z.string().optional(),
  listing_url: z.string().optional(),
  photo_urls: z.array(z.string()).optional(),
  attributes: z
    .object({
      listing_id: z.string().optional(),
      main_category: z.string().optional(),
      price: z
        .object({
          value: z.number().optional(),
          formatted_string: z.string().optional(),
        })
        .optional(),
      psf: z
        .object({
          formatted_string: z.string().optional(),
        })
        .optional(),
      beds: z
        .object({
          value: z.union([z.string(), z.number()]).optional(),
        })
        .optional(),
      bathrooms: z
        .object({
          value: z.number().optional(),
        })
        .optional(),
      floorarea_sqft: z
        .object({
          value: z.number().optional(),
        })
        .optional(),
      top: z.string().optional(),
      lease_type: z.string().optional(),
      posted_at_formatted: z.string().optional(),
      formatted_address: z.string().optional(),
      highlights: z.string().nullable().optional(),
      est_mortgage_formatted: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  commute_nearest_mrt: z
    .object({
      name: z.string().optional(),
      duration: z.object({ value: z.number().optional() }).optional(),
      distance: z.object({ value: z.number().optional() }).optional(),
    })
    .optional(),
  agent: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
    })
    .optional(),
  usp_tags: z.array(z.string()).optional(),
});

const ninetyNineTaskOutputSchema = z.array(ninetyNineRawListingSchema);

type NinetyNineRawListing = z.output<typeof ninetyNineRawListingSchema>;

interface NinetyNineListing {
  id: string;
  title?: string;
  url: string;
  address?: string;
  postalCode?: string;
  price: number;
  priceFormatted?: string;
  psfFormatted?: string;
  bedrooms?: number;
  bathrooms?: number;
  floorAreaSqft?: number;
  tenure?: string;
  builtYear?: number;
  category?: string;
  postedAt?: string;
  highlights?: string;
  mortgageEstimate?: string;
  mrtName?: string;
  mrtDistanceM?: number;
  mrtWalkingMins?: number;
  agentName?: string;
  agentPhone?: string;
  agentWhatsapp?: string;
  coordinates?: { lat: number; lng: number };
  photos?: string[];
  tags?: string[];
}

function isAllowed99coSearchUrl(value: string): boolean {
  const parsed = new URL(value);

  return (
    ALLOWED_99CO_HOSTS.has(parsed.hostname) &&
    parsed.pathname.startsWith("/singapore/")
  );
}

function getMainCategory(pathname: string, fallbackCategory: string | null): string {
  return MAIN_CATEGORY_BY_PATH[pathname as keyof typeof MAIN_CATEGORY_BY_PATH] ?? fallbackCategory ?? "all";
}

function buildApiUrl(
  searchUrl: string,
  options: { pageNumber: number; pageSize: number },
): string {
  const parsed = new URL(searchUrl);
  const apiUrl = new URL(`${NINETY_NINE_BASE_URL}/api/v11/web/search/listings`);
  const pathname = parsed.pathname.toLowerCase();

  apiUrl.searchParams.set(
    "listing_type",
    parsed.searchParams.get("listing_type") ?? (pathname.includes("/rent") ? "rent" : "sale"),
  );

  apiUrl.searchParams.set(
    "main_category",
    getMainCategory(pathname, parsed.searchParams.get("main_category")),
  );

  apiUrl.searchParams.set("name", "Singapore");
  apiUrl.searchParams.set("page_num", String(options.pageNumber));
  apiUrl.searchParams.set("page_size", String(options.pageSize));
  apiUrl.searchParams.set("path", parsed.pathname);
  apiUrl.searchParams.set("property_segments", "residential");
  apiUrl.searchParams.set("query_name", "Singapore");
  apiUrl.searchParams.set("show_cluster_preview", "true");
  apiUrl.searchParams.set("show_description", "true");
  apiUrl.searchParams.set("show_internal_linking", "true");
  apiUrl.searchParams.set("show_meta_description", "true");
  apiUrl.searchParams.set("show_nearby", "true");
  apiUrl.searchParams.set("sort_field", "relevance");
  apiUrl.searchParams.set("sort_order", "desc");

  for (const [key, value] of parsed.searchParams.entries()) {
    if (!apiUrl.searchParams.has(key)) {
      apiUrl.searchParams.set(key, value);
    }
  }

  return apiUrl.toString();
}

function toAbsolute99coUrl(value: string): string {
  return new URL(value, NINETY_NINE_BASE_URL).toString();
}

function parseOptionalNumber(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function parsePostalCode(address: string | undefined): string | undefined {
  if (!address) {
    return undefined;
  }

  return address.match(/\b\d{6}\b/)?.[0];
}

function normalize99coListing(listing: NinetyNineRawListing): NinetyNineListing | null {
  const listingId = listing.attributes?.listing_id;
  const priceValue = listing.attributes?.price?.value;
  const listingUrl = listing.listing_url;

  if (!listingId || typeof priceValue !== "number" || !listingUrl) {
    return null;
  }

  const builtYear = listing.attributes?.top
    ? Number.parseInt(listing.attributes.top, 10)
    : undefined;
  const lat = listing.attributes?.lat;
  const lng = listing.attributes?.lng;

  return {
    id: listingId,
    title: listing.listing_title,
    url: toAbsolute99coUrl(listingUrl),
    address: listing.attributes?.formatted_address,
    postalCode: parsePostalCode(listing.attributes?.formatted_address),
    price: priceValue,
    priceFormatted: listing.attributes?.price?.formatted_string,
    psfFormatted: listing.attributes?.psf?.formatted_string,
    bedrooms: parseOptionalNumber(listing.attributes?.beds?.value),
    bathrooms: listing.attributes?.bathrooms?.value,
    floorAreaSqft: listing.attributes?.floorarea_sqft?.value,
    tenure: listing.attributes?.lease_type,
    builtYear: Number.isNaN(builtYear ?? Number.NaN) ? undefined : builtYear,
    category: listing.attributes?.main_category,
    postedAt: listing.attributes?.posted_at_formatted,
    highlights: listing.attributes?.highlights ?? undefined,
    mortgageEstimate: listing.attributes?.est_mortgage_formatted,
    mrtName: listing.commute_nearest_mrt?.name,
    mrtDistanceM: listing.commute_nearest_mrt?.distance?.value,
    mrtWalkingMins: listing.commute_nearest_mrt?.duration?.value,
    agentName: listing.agent?.name,
    agentPhone: listing.agent?.phone,
    agentWhatsapp: listing.agent?.whatsapp,
    coordinates:
      typeof lat === "number" && typeof lng === "number" ? { lat, lng } : undefined,
    photos: listing.photo_urls?.length ? listing.photo_urls : undefined,
    tags: listing.usp_tags?.length ? listing.usp_tags : undefined,
  };
}

const search99coInputSchema = z.object({
  searchUrls: z
    .array(
      z.string().url().refine(isAllowed99coSearchUrl, {
        message:
          "Must be a 99.co Singapore search URL (https://www.99.co/singapore/...)",
      }),
    )
    .min(1)
    .describe("99.co Singapore search result URLs with filter query parameters."),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOOL_ITEMS)
    .default(MAX_TOOL_ITEMS)
    .optional()
    .describe(`Maximum listings to return. Default ${MAX_TOOL_ITEMS}.`),
});

/**
 * Creates the 99.co listing tool.
 */
export function createSearch99coTool() {
  const search_99co = tool({
    description:
      "Search current public 99.co Singapore listings using one or more 99.co search URLs.",
    inputSchema: search99coInputSchema,
    execute: async ({ searchUrls, maxItems }) => {
      const resolvedMaxItems = maxItems ?? MAX_TOOL_ITEMS;
      const resultMap = new Map<string, NinetyNineListing>();
      const totalCost = { total: 0, llm: 0, proxy: 0, browser: 0 };

      for (const searchUrl of searchUrls) {
        if (resultMap.size >= resolvedMaxItems) {
          break;
        }

        let pageNumber = 1;
        while (resultMap.size < resolvedMaxItems) {
          const remainingItems = resolvedMaxItems - resultMap.size;
          const pageSize = Math.min(NINETY_NINE_PAGE_SIZE, remainingItems);
          const apiUrl = buildApiUrl(searchUrl, { pageNumber, pageSize });
          const taskPrompt = [
            `Navigate to ${searchUrl}.`,
            `Fetch ${apiUrl}.`,
            "Read data.main_results.listing_cards from the JSON response.",
            "Return the listing_cards array exactly.",
          ].join("\n");

          const taskResult = await runBrowserTask(taskPrompt, {
            schema: ninetyNineTaskOutputSchema,
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

          if (taskResult.output.length === 0) {
            break;
          }

          const existingCount = resultMap.size;
          for (const listing of taskResult.output) {
            const normalizedListing = normalize99coListing(listing);
            if (normalizedListing) {
              resultMap.set(normalizedListing.url, normalizedListing);
            }
          }

          if (taskResult.output.length < pageSize || resultMap.size === existingCount) {
            break;
          }

          pageNumber += 1;
        }
      }

      const results = Array.from(resultMap.values()).slice(0, resolvedMaxItems);

      return {
        success: true as const,
        portal: "99co" as const,
        count: results.length,
        results,
        cost: totalCost,
      };
    },
  });

  return { search_99co };
}
