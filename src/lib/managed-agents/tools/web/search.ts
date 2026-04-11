/**
 * Web search tool for managed agents.
 *
 * @module lib/managed-agents/tools/web/search
 */
import { z } from "zod";

import { fetchWithTimeout, isAbortError } from "@/lib/runner/tools/web/fetch-with-timeout";

import type { ManagedAgentTool } from "../types";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 20;
const BRAVE_SUPPORTED_COUNTRIES = new Set([
  "ALL", "AR", "AU", "AT", "BE", "BR", "CA", "CL", "CN", "DK", "FI", "FR",
  "DE", "GR", "HK", "IN", "ID", "IT", "JP", "KR", "MY", "MX", "NL", "NZ",
  "NO", "PH", "PL", "PT", "RU", "SA", "ZA", "ES", "SE", "CH", "TW", "TR",
  "GB", "US",
]);
const tbsToFreshnessMap: Record<string, string> = {
  "qdr:h": "pd",
  "qdr:d": "pd",
  "qdr:w": "pw",
  "qdr:m": "pm",
  "qdr:y": "py",
};

function mapTbsToFreshness(tbs?: string): string | undefined {
  return tbs ? (tbsToFreshnessMap[tbs] ?? tbs) : undefined;
}

const inputSchema = z.object({
  query: z.string().trim().min(1).describe("The search query."),
  limit: z.number().int().min(1).max(MAX_RESULT_LIMIT).optional().describe("Maximum results to return. Defaults to 10, max 20."),
  location: z.string().optional().describe("Country code to target results."),
  tbs: z.string().optional().describe("Time filter shortcuts: qdr:h, qdr:d, qdr:w, qdr:m, qdr:y."),
});

type WebSearchInput = z.infer<typeof inputSchema>;

export const webSearchTool: ManagedAgentTool<WebSearchInput> = {
  name: "web_search",
  description: "Search the web for current information. Returns titles, URLs, and snippets.",
  inputSchema,
  execute: async ({ query, limit, location, tbs }) => {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      return { success: false as const, error: "BRAVE_SEARCH_API_KEY is not configured." };
    }

    const params = new URLSearchParams({ q: query });
    const resultLimit = limit === undefined ? DEFAULT_RESULT_LIMIT : Math.min(Math.max(Math.trunc(limit), 1), MAX_RESULT_LIMIT);
    params.set("count", String(resultLimit));

    const country = location?.toUpperCase();
    if (country && BRAVE_SUPPORTED_COUNTRIES.has(country)) {
      params.set("country", country);
    }

    const freshness = mapTbsToFreshness(tbs);
    if (freshness) {
      params.set("freshness", freshness);
    }

    try {
      const response = await fetchWithTimeout(`${BRAVE_SEARCH_URL}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "Cache-Control": "no-cache",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!response.ok) {
        return { success: false as const, error: `Brave Search API error: ${response.status} ${response.statusText}` };
      }

      const data = (await response.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      const results = (data.web?.results ?? []).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        snippet: result.description ?? "",
      }));
      return { success: true as const, results, count: results.length };
    } catch (error) {
      return {
        success: false as const,
        error: isAbortError(error)
          ? "Brave Search request timed out."
          : error instanceof Error
            ? error.message
            : "Unknown search error",
      };
    }
  },
};
