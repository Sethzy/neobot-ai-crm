# 13. web_search

- Group: Web Tools
- Category: Read
- Source: `src/lib/runner/tools/web/search.ts`
- Factory: `createSearchTool()` (no supabase/clientId needed)

## Verbatim Definition

```typescript
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 20;
const DEFAULT_COUNTRY = "SG";

const tbsToFreshnessMap: Record<string, string> = {
  "qdr:h": "pd",   // Brave has no past-hour; use past-day
  "qdr:d": "pd",
  "qdr:w": "pw",
  "qdr:m": "pm",
  "qdr:y": "py",
};

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
```

## Input Schema

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | The search query |
| `limit` | `integer` | No | 1–20, defaults to 10 |
| `location` | `string` | No | Country code. Defaults to "SG" |
| `tbs` | `string` | No | Time filter: qdr:h, qdr:d, qdr:w, qdr:m, qdr:y |

## Result Shape

```typescript
// Success
{
  success: true,
  results: Array<{ title: string, url: string, snippet: string }>,
  count: number
}

// Error
{ success: false, error: string }
```

## Notes

- Brave Search API (not Google) — `BRAVE_SEARCH_API_KEY` required
- Defaults to Singapore (`SG`) for real estate context
- Time filter uses Google-style `tbs` shortcuts mapped to Brave's `freshness` param
- `qdr:h` (past hour) maps to `pd` (past day) since Brave has no hourly mode
- 15-second timeout via `fetchWithTimeout`
- No tenant scoping — web search is stateless
