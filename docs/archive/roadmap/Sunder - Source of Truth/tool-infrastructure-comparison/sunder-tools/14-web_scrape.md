# 14. web_scrape

- Group: Web Tools
- Category: Read
- Source: `src/lib/runner/tools/web/scrape.ts`
- Factory: `createScrapeTool()` (no supabase/clientId needed)

## Verbatim Definition

```typescript
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
const MAX_TEXT_CHARACTERS = 10_000;

interface ExaContentResult {
  url?: string;
  title?: string;
  text?: string;
}

interface ExaStatusError {
  tag?: string;
}

interface ExaStatus {
  id?: string;
  status?: string;
  error?: ExaStatusError;
}

interface ExaContentsResponse {
  results?: ExaContentResult[];
  content?: ExaContentResult[];
  statuses?: ExaStatus[];
}

const web_scrape = tool({
  description:
    "Read a webpage and extract its text content. Use this to read articles, documentation, or any web page.",
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        message: "URL must use http:// or https:// protocol",
      })
      .describe("The URL of the webpage to read. Must be http:// or https://."),
  }),
  execute: async ({ url }) => {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      return {
        success: false as const,
        error: "EXA_API_KEY is not configured.",
      };
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return {
        success: false as const,
        error: "URL must use http:// or https:// protocol",
      };
    }

    try {
      const response = await fetchWithTimeout(EXA_CONTENTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          urls: [url],
          text: { maxCharacters: MAX_TEXT_CHARACTERS },
        }),
      });

      if (!response.ok) {
        return {
          success: false as const,
          error: `Exa API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as ExaContentsResponse;
      const items = data.results ?? data.content ?? [];
      const firstResult = items[0];

      if (!firstResult || !firstResult.text) {
        const statuses = data.statuses ?? [];
        const matchedStatus =
          statuses.find((status) => status.id === url && status.status === "error") ??
          statuses.find((status) => status.status === "error");
        if (matchedStatus?.status === "error") {
          const tag = matchedStatus.error?.tag ?? "UNKNOWN";
          return {
            success: false as const,
            error: `Scrape failed: ${tag}`,
          };
        }

        return {
          success: false as const,
          error: "No content could be extracted from the URL.",
        };
      }

      return {
        success: true as const,
        url: firstResult.url ?? url,
        title: firstResult.title ?? "",
        content: firstResult.text,
      };
    } catch (error) {
      const message = isAbortError(error)
        ? "Exa scrape request timed out."
        : error instanceof Error
          ? error.message
          : "Unknown scrape error";
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
| `url` | `string (url)` | Yes | The URL to read. Must be http:// or https:// |

## Result Shape

```typescript
// Success
{
  success: true,
  url: string,
  title: string,
  content: string    // max 10,000 characters
}

// Error
{ success: false, error: string }
```

## Notes

- Uses Exa API (not direct fetch) — `EXA_API_KEY` required
- Max 10,000 characters of text extracted
- Handles Exa's dual response format (`results` vs `content` arrays)
- Parses Exa status errors (e.g., blocked sites, timeouts) into structured error messages
- Double URL validation: Zod `.url().refine()` + runtime check
- 15-second timeout via `fetchWithTimeout`
- No tenant scoping — web scrape is stateless
