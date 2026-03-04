/**
 * Web search tool for Brave Search API.
 * @module lib/runner/tools/web/search
 */
import { tool } from "ai";
import { z } from "zod";

import { fetchWithTimeout, isAbortError } from "./fetch-with-timeout";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 20;
const DEFAULT_COUNTRY = "SG";

const tbsToFreshnessMap: Record<string, string> = {
  // Brave has no past-hour mode; use past-day as the nearest equivalent.
  "qdr:h": "pd",
  "qdr:d": "pd",
  "qdr:w": "pw",
  "qdr:m": "pm",
  "qdr:y": "py",
};

interface BraveSearchResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

function mapTbsToFreshness(tbs?: string): string | undefined {
  if (!tbs) {
    return undefined;
  }

  // Keep unsupported values permissive and pass through unchanged for v1.
  return tbsToFreshnessMap[tbs] ?? tbs;
}

/**
 * Creates web-search utility tools.
 */
export function createSearchTool() {
  const web_search = tool({
    description:
      "Search the web for current information. Returns titles, URLs, and snippets.",
    inputSchema: z.object({
      query: z.string().trim().min(1).describe("The search query."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_RESULT_LIMIT)
        .optional()
        .describe("Maximum results to return. Defaults to 10, max 20."),
      location: z
        .string()
        .optional()
        .describe(
          'Geographic location for results as country code. Examples: "SG", "US", "GB". Defaults to "SG".',
        ),
      tbs: z
        .string()
        .optional()
        .describe("Time filter shortcuts: qdr:h, qdr:d, qdr:w, qdr:m, qdr:y."),
    }),
    execute: async ({ query, limit, location, tbs }) => {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return {
          success: false as const,
          error: "BRAVE_SEARCH_API_KEY is not configured.",
        };
      }

      const params = new URLSearchParams({ q: query });
      const resultLimit =
        limit === undefined
          ? DEFAULT_RESULT_LIMIT
          : Math.min(Math.max(Math.trunc(limit), 1), MAX_RESULT_LIMIT);
      params.set("count", String(resultLimit));
      params.set("country", location ?? DEFAULT_COUNTRY);

      const freshness = mapTbsToFreshness(tbs);
      if (freshness) {
        params.set("freshness", freshness);
      }

      try {
        const response = await fetchWithTimeout(`${BRAVE_SEARCH_URL}?${params.toString()}`, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey,
          },
        });

        if (!response.ok) {
          return {
            success: false as const,
            error: `Brave Search API error: ${response.status} ${response.statusText}`,
          };
        }

        const data = (await response.json()) as BraveSearchResponse;
        const webResults = data.web?.results ?? [];

        const results = webResults.map((result) => ({
          title: result.title ?? "",
          url: result.url ?? "",
          snippet: result.description ?? "",
        }));

        return {
          success: true as const,
          results,
          count: results.length,
        };
      } catch (error) {
        const message = isAbortError(error)
          ? "Brave Search request timed out."
          : error instanceof Error
            ? error.message
            : "Unknown search error";
        return {
          success: false as const,
          error: message,
        };
      }
    },
  });

  return { web_search };
}
