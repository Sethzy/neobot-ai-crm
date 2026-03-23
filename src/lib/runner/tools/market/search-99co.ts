/**
 * 99.co public listing search tool backed by Apify.
 * @module lib/runner/tools/market/search-99co
 */
import { tool } from "ai";
import { z } from "zod";

import { runActorSync } from "./apify-client";

const SEARCH_99CO_ACTOR_ID = "easyapi/99-co-property-listings-scraper";
const ALLOWED_99CO_HOSTS = new Set(["99.co", "www.99.co"]);
const MAX_TOOL_ITEMS = 30;
const MAX_IMAGE_COUNT = 5;
const COST_CAP_USD = 1;

interface Search99coListing {
  listing_url?: string;
  photo_urls?: string[];
  [key: string]: unknown;
}

function isAllowed99coSearchUrl(value: string): boolean {
  const parsed = new URL(value);

  return (
    ALLOWED_99CO_HOSTS.has(parsed.hostname) &&
    parsed.pathname.startsWith("/singapore/")
  );
}

function toAbsolute99coUrl(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://www.99.co${value.startsWith("/") ? value : `/${value}`}`;
}

function sanitize99coListing(listing: Search99coListing): Search99coListing {
  return {
    ...listing,
    ...(typeof listing.listing_url === "string"
      ? { listing_url: toAbsolute99coUrl(listing.listing_url) }
      : {}),
    ...(Array.isArray(listing.photo_urls)
      ? { photo_urls: listing.photo_urls.slice(0, MAX_IMAGE_COUNT) }
      : {}),
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
      try {
        const results = await runActorSync<Search99coListing>(
          SEARCH_99CO_ACTOR_ID,
          {
            searchUrls,
            maxItems: maxItems ?? MAX_TOOL_ITEMS,
          },
          { maxTotalChargeUsd: COST_CAP_USD },
        );

        const sanitizedResults = results.map(sanitize99coListing);

        return {
          success: true as const,
          portal: "99co" as const,
          count: sanitizedResults.length,
          results: sanitizedResults,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Unknown 99.co search error",
        };
      }
    },
  });

  return { search_99co };
}
