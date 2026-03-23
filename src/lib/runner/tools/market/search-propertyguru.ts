/**
 * PropertyGuru public listing search tool backed by Apify.
 * @module lib/runner/tools/market/search-propertyguru
 */
import { tool } from "ai";
import { z } from "zod";

import { runActorSync } from "./apify-client";

const SEARCH_PROPERTYGURU_ACTOR_ID =
  "fatihtahta/propertyguru-scraper-ddproperty-batdongsan-ppe";
const ALLOWED_PROPERTYGURU_HOSTS = new Set([
  "propertyguru.com.sg",
  "www.propertyguru.com.sg",
]);
const MAX_TOOL_ITEMS = 30;
const MIN_PROVIDER_ITEMS = 10;
const MAX_IMAGE_COUNT = 5;
const COST_CAP_USD = 1;

interface SearchPropertyguruListing {
  images?: string[];
  [key: string]: unknown;
}

function isAllowedPropertyguruUrl(value: string): boolean {
  return ALLOWED_PROPERTYGURU_HOSTS.has(new URL(value).hostname);
}

function sanitizePropertyguruListing(
  listing: SearchPropertyguruListing,
): SearchPropertyguruListing {
  return {
    ...listing,
    ...(Array.isArray(listing.images)
      ? { images: listing.images.slice(0, MAX_IMAGE_COUNT) }
      : {}),
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
      const resolvedMaxItems = maxItems ?? MAX_TOOL_ITEMS;
      const actorInput =
        startUrls && startUrls.length > 0
          ? {
              startUrls,
              maxItems: resolvedMaxItems,
            }
          : {
              searchQueries,
              country: "sg",
              listingType,
              propertyType,
              ...(typeof minPrice === "number" ? { minPrice } : {}),
              ...(typeof maxPrice === "number" ? { maxPrice } : {}),
              maxItems: resolvedMaxItems,
            };

      try {
        const results = await runActorSync<SearchPropertyguruListing>(
          SEARCH_PROPERTYGURU_ACTOR_ID,
          actorInput,
          { maxTotalChargeUsd: COST_CAP_USD },
        );

        const sanitizedResults = results.map(sanitizePropertyguruListing);

        return {
          success: true as const,
          portal: "propertyguru" as const,
          count: sanitizedResults.length,
          results: sanitizedResults,
        };
      } catch (error) {
        return {
          success: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Unknown PropertyGuru search error",
        };
      }
    },
  });

  return { search_propertyguru };
}
