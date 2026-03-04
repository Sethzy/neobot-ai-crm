# PR 8: Web Search Tool — Implementation Plan

**PR:** PR 8: Web search tool
**Decisions:** SERVICE-03, TOOL-03, TOOL-10, TOOL-01, TOOL-02
**Goal:** Give the agent `web_search` and `web_scrape` tools so it can search the web and read URL content during conversations.

**Architecture:** Two utility tools following Tasklet's verbatim contracts (TOOL-02). `web_search` uses Brave Search API in LLM Context mode (SERVICE-03) — the default general-purpose search. `web_scrape` uses Exa `/contents` endpoint in text mode (SERVICE-03) — optimized for extracting readable content from known URLs. Both are Category 9 (Utility) tools per TOOL-03. Both are auto-run (no approval gate) per SAFETY-01.

**Tech Stack:** Vercel AI SDK v6 `tool()`, Zod 4, Brave Search API, Exa API, Vitest

## 2026-03-02 Handover Overrides (Authoritative)

These notes supersede any contradictory details in the rest of this document.

1. API keys are mandatory for manual verification:
   - `BRAVE_SEARCH_API_KEY` (Brave Search)
   - `EXA_API_KEY` (Exa)
   - Keep real keys in `.env.local` only; add placeholders to `.env.example`.
2. Keep tool return shape consistent with existing codebase:
   - Success: `{ success: true, ...data }`
   - Failure: `{ success: false, error: string }`
3. Brave limits and mappings:
   - `limit` must be `1..20` (Brave `count` max is 20)
   - `qdr:h` has no Brave equivalent; map `qdr:h` to `pd` (closest available)
   - Do not implement `cdr:*` parsing in v1 (YAGNI); pass unsupported `tbs` through unchanged
   - Default `country` should be `"SG"` when `location` is omitted
4. Exa response handling:
   - Accept both response shapes: `results` and `content`
   - Inspect `statuses` for per-URL failures and surface tags (e.g., `CRAWL_NOT_FOUND`, `CRAWL_TIMEOUT`)
5. `web_scrape` URL validation must enforce `http://` or `https://` at schema level.
6. Runner integration tests are mandatory (not optional):
   - Add `mockCreateWebTools` in `src/lib/runner/__tests__/run-agent.test.ts`
   - Assert `streamText` receives both `web_search` and `web_scrape`
7. TDD is strict:
   - Each new behavior starts red first (write failing test, run, then implement)
   - Some tests are verification-only and may already be green; explicitly note this in the task step
8. Tasklet reference paths in this repo:
   - `roadmap docs/Sunder - Source of Truth/references/tasklet/tools/built-in/03-web_search_web.md`
   - `roadmap docs/Sunder - Source of Truth/references/tasklet/tools/built-in/04-web_scrape_website.md`

---

## Context You Need

### Existing patterns to follow

- **Tool factory pattern:** See `src/lib/runner/tools/crm/contacts.ts`. Each domain has a factory function (`createContactTools(supabase, clientId)`) that returns named tool objects created via `tool({ description, inputSchema, execute })`.
- **Return shape:** All tools return `{ success: true, ...data }` or `{ success: false, error: string }`. Use `as const` for discriminated unions.
- **Barrel exports:** Domain tool factories are re-exported from `src/lib/runner/tools/index.ts`, then spread into the `tools` object in `run-agent.ts`.
- **Test pattern:** See `src/lib/runner/tools/crm/__tests__/contacts.test.ts`. Uses `createMockSupabase()` for DB mocks, calls `tool.execute(input, EXECUTION_OPTIONS)` directly. Web tools won't use Supabase mocks — they mock HTTP fetches instead.
- **Zod schemas:** All input params use `.describe()` for LLM guidance. Enums use `z.enum()`, optionals use `.optional()`.

### Tasklet tool contracts (copy these schemas)

**`web_search`** (Tasklet contract source: `roadmap docs/Sunder - Source of Truth/references/tasklet/tools/built-in/03-web_search_web.md`):
- `query` (string, required) — search query
- `limit` (number, 1-20, optional, default 10) — max results (Brave cap is 20)
- `location` (string, optional, default "SG") — geographic context passed to Brave `country`
- `tbs` (string, optional) — supported shortcuts: `qdr:h`, `qdr:d`, `qdr:w`, `qdr:m`, `qdr:y`
  - `qdr:h` maps to `pd` because Brave has no past-hour freshness mode
  - `cdr:*` format is not implemented in v1

**`web_scrape`** (Tasklet contract source: `roadmap docs/Sunder - Source of Truth/references/tasklet/tools/built-in/04-web_scrape_website.md`):
- `url` (string, required) — must be `http://` or `https://`

### Provider details (SERVICE-03)

**Brave Search API** (LLM Context mode):
- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Auth: `X-Subscription-Token` header
- Params: `q`, `count`, `search_lang`, `country`, `freshness`
- `freshness` maps to Tasklet's `tbs`: `pd` (day), `pw` (week), `pm` (month), `py` (year)
- Returns: `{ web: { results: [{ title, url, description, ... }] } }`
- Env var: `BRAVE_SEARCH_API_KEY`

**Exa API** (`/contents` endpoint):
- Endpoint: `https://api.exa.ai/contents`
- Auth: `x-api-key` header
- Body: `{ ids: [url], text: true }`
- Two-step: first `POST /search` to resolve URL → then `POST /contents` for text. Or use `GET /contents` with URL directly.
- Simpler approach: use `POST /contents` with `urls: [url]` and `text: { maxCharacters: 10000 }`.
- Returns: `{ results: [{ url, title, text, ... }] }`
- Env var: `EXA_API_KEY`

---

## Files

### Create

- `src/lib/runner/tools/web/__tests__/search.test.ts`
- `src/lib/runner/tools/web/__tests__/scrape.test.ts`
- `src/lib/runner/tools/web/search.ts`
- `src/lib/runner/tools/web/scrape.ts`
- `src/lib/runner/tools/web/index.ts`

### Modify

- `src/lib/runner/tools/index.ts` — add `createWebTools` export
- `src/lib/runner/run-agent.ts` — register web tools in `streamText({ tools })`
- `src/lib/runner/__tests__/run-agent.test.ts` — mock `createWebTools` and assert tools registration
- `.env.example` — add `BRAVE_SEARCH_API_KEY` and `EXA_API_KEY`

---

## TDD Rules (Mandatory)

For every behavior:

1. Write/extend one failing test.
2. Run targeted test and confirm failure for expected reason.
3. Implement minimum code to pass.
4. Re-run targeted tests.
5. Continue to next behavior.
6. Run full `vitest` suite at end.

Do not write production code before a failing test exists.

---

## Task 1 — Web Search Tool (`PR8-1`, `PR8-2`)

### Goal

Implement `web_search` tool that calls Brave Search API and returns formatted results. Follows Tasklet's `web_search_web` contract (TOOL-02).

**Files:**
- Create: `src/lib/runner/tools/web/__tests__/search.test.ts`
- Create: `src/lib/runner/tools/web/search.ts`

### Step 1: Write failing test — successful search

```bash
mkdir -p src/lib/runner/tools/web/__tests__
```

Create `src/lib/runner/tools/web/__tests__/search.test.ts`:

```typescript
/**
 * Tests for web search tool.
 * @module lib/runner/tools/web/__tests__/search.test
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSearchTool } from "../search";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-key");
  mockFetch.mockReset();
});

describe("web_search", () => {
  it("returns formatted search results for a query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "HDB Resale Prices 2026",
              url: "https://example.com/hdb",
              description: "Latest HDB resale price data for Singapore.",
            },
            {
              title: "PropertyGuru Market Report",
              url: "https://propertyguru.com/report",
              description: "Q1 2026 market trends.",
            },
          ],
        },
      }),
    });

    const tools = createSearchTool();
    const result = await tools.web_search.execute(
      { query: "HDB resale prices Singapore 2026" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [
        {
          title: "HDB Resale Prices 2026",
          url: "https://example.com/hdb",
          snippet: "Latest HDB resale price data for Singapore.",
        },
        {
          title: "PropertyGuru Market Report",
          url: "https://propertyguru.com/report",
          snippet: "Q1 2026 market trends.",
        },
      ],
      count: 2,
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: FAIL — `createSearchTool` does not exist.

### Step 3: Write minimal implementation

Create `src/lib/runner/tools/web/search.ts`:

```typescript
/**
 * Web search tool using Brave Search API.
 * @module lib/runner/tools/web/search
 */
import { tool } from "ai";
import { z } from "zod";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_LIMIT = 10;

/** Maps Tasklet tbs values to Brave freshness params. */
function mapTbsToFreshness(tbs: string | undefined): string | undefined {
  if (!tbs) return undefined;
  const map: Record<string, string> = {
    "qdr:h": "ph",
    "qdr:d": "pd",
    "qdr:w": "pw",
    "qdr:m": "pm",
    "qdr:y": "py",
  };
  return map[tbs];
}

interface BraveSearchResult {
  title?: string;
  url?: string;
  description?: string;
}

/**
 * Creates the web_search tool for runner registration.
 */
export function createSearchTool() {
  const web_search = tool({
    description:
      "Search the web for current information. Returns titles, URLs, and snippets.",
    inputSchema: z.object({
      query: z.string().min(1).describe("The search query."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum results to return. Defaults to 10, max 100."),
      location: z
        .string()
        .optional()
        .describe(
          'Geographic location for results. Examples: "Singapore", "San Francisco,California,United States". Defaults to "US".',
        ),
      tbs: z
        .string()
        .optional()
        .describe(
          "Time filter. Values: qdr:h (hour), qdr:d (day), qdr:w (week), qdr:m (month), qdr:y (year).",
        ),
    }),
    execute: async ({ query, limit, location, tbs }) => {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return { success: false as const, error: "BRAVE_SEARCH_API_KEY is not configured." };
      }

      const params = new URLSearchParams({ q: query });
      params.set("count", String(limit ?? DEFAULT_RESULT_LIMIT));

      if (location) {
        params.set("country", location);
      }

      const freshness = mapTbsToFreshness(tbs);
      if (freshness) {
        params.set("freshness", freshness);
      }

      try {
        const response = await fetch(`${BRAVE_SEARCH_URL}?${params.toString()}`, {
          headers: {
            "Accept": "application/json",
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

        const data = await response.json();
        const webResults: BraveSearchResult[] = data?.web?.results ?? [];

        const results = webResults.map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.description ?? "",
        }));

        return {
          success: true as const,
          results,
          count: results.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown search error";
        return { success: false as const, error: message };
      }
    },
  });

  return { web_search };
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 5: Write failing test — sends correct query params and headers

Add to `search.test.ts`:

```typescript
  it("sends correct query params and auth header to Brave API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute(
      { query: "condo prices", limit: 5, location: "Singapore" },
      EXECUTION_OPTIONS,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("q")).toBe("condo prices");
    expect(parsedUrl.searchParams.get("count")).toBe("5");
    expect(parsedUrl.searchParams.get("country")).toBe("Singapore");
    expect(options.headers["X-Subscription-Token"]).toBe("test-brave-key");
  });
```

### Step 6: Run test to verify it passes (should already pass)

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS (implementation already handles this)

### Step 7: Write failing test — tbs time filter mapping

Add to `search.test.ts`:

```typescript
  it("maps tbs parameter to Brave freshness param", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute(
      { query: "latest news", tbs: "qdr:w" },
      EXECUTION_OPTIONS,
    );

    const [url] = mockFetch.mock.calls[0];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("freshness")).toBe("pw");
  });
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 9: Write failing test — missing API key

Add to `search.test.ts`:

```typescript
  it("returns error when BRAVE_SEARCH_API_KEY is not set", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");

    const tools = createSearchTool();
    const result = await tools.web_search.execute(
      { query: "test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "BRAVE_SEARCH_API_KEY is not configured.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
```

### Step 10: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 11: Write failing test — API error response

Add to `search.test.ts`:

```typescript
  it("returns error on non-OK HTTP response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    const tools = createSearchTool();
    const result = await tools.web_search.execute(
      { query: "test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Brave Search API error: 429 Too Many Requests",
    });
  });
```

### Step 12: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 13: Write failing test — network error

Add to `search.test.ts`:

```typescript
  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const tools = createSearchTool();
    const result = await tools.web_search.execute(
      { query: "test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "ECONNREFUSED",
    });
  });
```

### Step 14: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 15: Write failing test — defaults to 10 results

Add to `search.test.ts`:

```typescript
  it("defaults count to 10 when limit is omitted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const tools = createSearchTool();
    await tools.web_search.execute(
      { query: "default limit test" },
      EXECUTION_OPTIONS,
    );

    const [url] = mockFetch.mock.calls[0];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("count")).toBe("10");
  });
```

### Step 16: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 17: Write failing test — handles empty/missing web results gracefully

Add to `search.test.ts`:

```typescript
  it("returns empty results when API returns no web results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const tools = createSearchTool();
    const result = await tools.web_search.execute(
      { query: "nothing found" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      results: [],
      count: 0,
    });
  });
```

### Step 18: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
```

Expected: PASS

### Step 19: Commit

```bash
git add src/lib/runner/tools/web/search.ts src/lib/runner/tools/web/__tests__/search.test.ts
git commit -m "feat(pr8): add web_search tool with Brave Search API"
```

---

## Task 2 — Web Scrape Tool (`PR8-3`)

### Goal

Implement `web_scrape` tool that calls Exa `/contents` API and returns extracted text. Follows Tasklet's `web_scrape_website` contract (TOOL-02).

**Files:**
- Create: `src/lib/runner/tools/web/__tests__/scrape.test.ts`
- Create: `src/lib/runner/tools/web/scrape.ts`

### Step 1: Write failing test — successful scrape

Create `src/lib/runner/tools/web/__tests__/scrape.test.ts`:

```typescript
/**
 * Tests for web scrape tool.
 * @module lib/runner/tools/web/__tests__/scrape.test
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createScrapeTool } from "../scrape";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.stubEnv("EXA_API_KEY", "test-exa-key");
  mockFetch.mockReset();
});

describe("web_scrape", () => {
  it("returns extracted text content from a URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            url: "https://example.com/article",
            title: "Example Article",
            text: "This is the full article content extracted by Exa.",
          },
        ],
      }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/article" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      url: "https://example.com/article",
      title: "Example Article",
      content: "This is the full article content extracted by Exa.",
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: FAIL — `createScrapeTool` does not exist.

### Step 3: Write minimal implementation

Create `src/lib/runner/tools/web/scrape.ts`:

```typescript
/**
 * Web scrape tool using Exa /contents API.
 * @module lib/runner/tools/web/scrape
 */
import { tool } from "ai";
import { z } from "zod";

const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
const MAX_TEXT_CHARACTERS = 10_000;

interface ExaContentResult {
  url?: string;
  title?: string;
  text?: string;
}

/**
 * Creates the web_scrape tool for runner registration.
 */
export function createScrapeTool() {
  const web_scrape = tool({
    description:
      "Read a webpage and extract its text content. Use this to read articles, documentation, or any web page.",
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe("The URL of the webpage to read. Must be http:// or https://."),
    }),
    execute: async ({ url }) => {
      const apiKey = process.env.EXA_API_KEY;
      if (!apiKey) {
        return { success: false as const, error: "EXA_API_KEY is not configured." };
      }

      try {
        const response = await fetch(EXA_CONTENTS_URL, {
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

        const data = await response.json();
        const results: ExaContentResult[] = data?.results ?? [];
        const firstResult = results[0];

        if (!firstResult || !firstResult.text) {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown scrape error";
        return { success: false as const, error: message };
      }
    },
  });

  return { web_scrape };
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: PASS

### Step 5: Write failing test — sends correct request body and auth

Add to `scrape.test.ts`:

```typescript
  it("sends correct request body and auth header to Exa API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", title: "Test", text: "Content" }],
      }),
    });

    const tools = createScrapeTool();
    await tools.web_scrape.execute(
      { url: "https://example.com" },
      EXECUTION_OPTIONS,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [fetchUrl, options] = mockFetch.mock.calls[0];
    expect(fetchUrl).toBe("https://api.exa.ai/contents");
    expect(options.method).toBe("POST");
    expect(options.headers["x-api-key"]).toBe("test-exa-key");
    const body = JSON.parse(options.body);
    expect(body.urls).toEqual(["https://example.com"]);
    expect(body.text.maxCharacters).toBe(10_000);
  });
```

### Step 6: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: PASS

### Step 7: Write failing test — missing API key

Add to `scrape.test.ts`:

```typescript
  it("returns error when EXA_API_KEY is not set", async () => {
    vi.stubEnv("EXA_API_KEY", "");

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "EXA_API_KEY is not configured.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: PASS

### Step 9: Write failing test — API error response

Add to `scrape.test.ts`:

```typescript
  it("returns error on non-OK HTTP response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      statusText: "Payment Required",
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Exa API error: 402 Payment Required",
    });
  });
```

### Step 10: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: PASS

### Step 11: Write failing test — no content extracted

Add to `scrape.test.ts`:

```typescript
  it("returns error when no content is extracted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com/empty" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "No content could be extracted from the URL.",
    });
  });
```

### Step 12: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: PASS

### Step 13: Write failing test — network error

Add to `scrape.test.ts`:

```typescript
  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const tools = createScrapeTool();
    const result = await tools.web_scrape.execute(
      { url: "https://example.com" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "ECONNREFUSED",
    });
  });
```

### Step 14: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
```

Expected: PASS

### Step 15: Commit

```bash
git add src/lib/runner/tools/web/scrape.ts src/lib/runner/tools/web/__tests__/scrape.test.ts
git commit -m "feat(pr8): add web_scrape tool with Exa API"
```

---

## Task 3 — Web Tools Barrel + Runner Registration (`PR8-1`, `PR8-2`, `PR8-3`)

### Goal

Wire both web tools into the runner via barrel export. The same pattern used for CRM and storage tools.

**Files:**
- Create: `src/lib/runner/tools/web/index.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `.env.example`

### Step 1: Create the web tools barrel

Create `src/lib/runner/tools/web/index.ts`:

```typescript
/**
 * Web tool factory barrel for the runner.
 * @module lib/runner/tools/web
 */
import { createSearchTool } from "./search";
import { createScrapeTool } from "./scrape";

/**
 * Creates all web utility tools for registration in `streamText({ tools })`.
 */
export function createWebTools() {
  return {
    ...createSearchTool(),
    ...createScrapeTool(),
  };
}
```

### Step 2: Add to tools barrel

Open `src/lib/runner/tools/index.ts` and add the export:

```typescript
// Add this line:
export { createWebTools } from "./web";
```

After edit, the file should be:

```typescript
/**
 * Tool category barrel for the runner.
 * @module lib/runner/tools
 */
export { createCrmTools } from "./crm";
export { createStorageTools } from "./storage";
export { createWebTools } from "./web";
```

### Step 3: Register web tools in run-agent.ts

In `src/lib/runner/run-agent.ts`:

1. Update the import to include `createWebTools`:

```typescript
import { createCrmTools, createStorageTools, createWebTools } from "@/lib/runner/tools";
```

2. Update the `RunnerTools` type:

```typescript
type RunnerTools = ReturnType<typeof createCrmTools> &
  ReturnType<typeof createStorageTools> &
  ReturnType<typeof createWebTools>;
```

3. In the `runAgent` function body, after `const storageTools = createStorageTools(supabase, clientId);`, add:

```typescript
const webTools = createWebTools();
```

4. Spread `webTools` into the tools object:

```typescript
const tools = {
  ...crmTools,
  ...storageTools,
  ...webTools,
};
```

### Step 4: Update .env.example

Add these two env vars to `.env.example` under the `# AI providers` section:

```
# Web search and scraping
BRAVE_SEARCH_API_KEY=
EXA_API_KEY=
```

### Step 5: Run existing runner tests to verify nothing broke

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: PASS — existing tests should still pass since web tools don't require any constructor arguments that would break mocking.

If runner tests mock `createCrmTools`/`createStorageTools` via `vi.mock`, you may also need to mock `createWebTools`. Check the runner test file:

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/serialization.test.ts src/lib/runner/__tests__/stale-cleanup.test.ts
```

If any fail because `createWebTools` is not mocked, add the mock in the test setup:

```typescript
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: vi.fn().mockReturnValue({}),
  createStorageTools: vi.fn().mockReturnValue({}),
  createWebTools: vi.fn().mockReturnValue({}),
}));
```

### Step 6: Run full test suite

```bash
npx vitest run
```

Expected: All tests PASS.

### Step 7: Commit

```bash
git add src/lib/runner/tools/web/index.ts src/lib/runner/tools/index.ts src/lib/runner/run-agent.ts .env.example
git commit -m "feat(pr8): register web tools in runner and update env example"
```

---

## Task 4 — Verification

### Full test suite

```bash
npx vitest run src/lib/runner/tools/web/__tests__/search.test.ts
npx vitest run src/lib/runner/tools/web/__tests__/scrape.test.ts
npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/serialization.test.ts src/lib/runner/__tests__/stale-cleanup.test.ts
npx vitest run
```

### Manual checklist

- [ ] `web_search` tool is registered in `streamText({ tools })` via `run-agent.ts`
- [ ] `web_scrape` tool is registered in `streamText({ tools })` via `run-agent.ts`
- [ ] `BRAVE_SEARCH_API_KEY` env var is documented in `.env.example`
- [ ] `EXA_API_KEY` env var is documented in `.env.example`
- [ ] Both tools follow `{ success: true, ...data } | { success: false, error }` return shape
- [ ] Both tools handle missing API keys gracefully (no crash, returns error)
- [ ] Both tools handle API errors and network failures
- [ ] `web_search` supports Tasklet contract: `query`, `limit`, `location`, `tbs`
- [ ] `web_scrape` supports Tasklet contract: `url`
- [ ] No Supabase dependency (these are external API tools, not DB tools)
- [ ] Route file (`app/api/chat/route.ts`) not modified — tools registered through runner

### Test criteria (from implementation plan)

- [ ] "Ask agent 'search for recent home sales in Austin TX' → returns real results"

This test criteria requires actual API keys. Verify locally with real keys set, or defer to integration testing.

---

## Commit Guidance

Keep commits focused and small:

1. `feat(pr8): add web_search tool with Brave Search API` — search tool + tests
2. `feat(pr8): add web_scrape tool with Exa API` — scrape tool + tests
3. `feat(pr8): register web tools in runner and update env example` — wiring

No unrelated refactors.

---

## Done Criteria

PR 8 is complete when:

- `web_search` calls Brave Search API with correct params and returns formatted results
- `web_scrape` calls Exa `/contents` API and returns extracted text
- Both tools are registered in the runner's `streamText({ tools })` call
- Both handle missing keys, API errors, and network failures gracefully
- All tests pass
- Env vars documented in `.env.example`
