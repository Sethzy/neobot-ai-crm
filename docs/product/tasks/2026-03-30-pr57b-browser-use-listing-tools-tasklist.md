# Replace Apify Listing Tools with Browser-Use Tasks Implementation Plan

**PR:** PR 57b: Replace Apify listing tools with Browser-Use Tasks
**Decisions:** SERVICE-12
**Goal:** Rewire `search_propertyguru` and `search_99co` from Apify actors to Browser-Use Cloud Tasks with upgraded output schemas.

**Architecture:** Both portals expose structured JSON (PropertyGuru via `__NEXT_DATA__`, 99.co via live-verified `/api/v11/web/search/listings`). A shared `task-runner.ts` helper should wrap `client.run()` with cost caps ($0.05), Browser-Use config gating, and structured-schema output handling. Same tool names and input schemas, upgraded output schemas with bonus fields. Two-commit strategy: (1) wire Browser-Use, (2) delete Apify. Design doc: `docs/plans/2026-03-30-browser-use-listing-tools-design.md`. Parity test: `docs/debug/listing-tools-parity-test.md`.

**Tech Stack:** Browser-Use Cloud SDK v3 (`browser-use-sdk/v3`), Vercel AI SDK `tool()`, Zod, Vitest

---

## Relevant Files

### Create
- `src/lib/browser-use/task-runner.ts` — shared Browser-Use Task helper
- `src/lib/browser-use/__tests__/task-runner.test.ts` — tests for task runner

### Rewrite (same path, new internals)
- `src/lib/runner/tools/market/search-propertyguru.ts`
- `src/lib/runner/tools/market/search-99co.ts`
- `src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts`
- `src/lib/runner/tools/market/__tests__/search-99co.test.ts`

### Modify
- `src/lib/runner/tools/market/index.ts` — update JSDoc
- `src/lib/runner/tool-registry.ts` — gate on `isBrowserUseConfigured()`
- `src/lib/runner/run-agent.ts` — replace `isApifyConfigured()` with `isBrowserUseConfigured()`
- `src/lib/runner/__tests__/run-agent.test.ts` — update mock
- `src/lib/runner/__tests__/tool-registry.test.ts` — update expectations for Browser-Use gating
- `src/lib/runner/__tests__/context.test.ts` — no code changes needed (tests `includePropertyListings` flag, not gating)

### Delete (Commit 2)
- `src/lib/runner/tools/market/apify-client.ts`
- `src/lib/runner/tools/market/__tests__/apify-client.test.ts`
- `src/lib/apify/env.ts`

### Reference (read these before starting)
- `docs/plans/2026-03-30-browser-use-listing-tools-design.md` — full design doc
- `docs/debug/listing-tools-parity-test.md` — field mapping and API endpoint reference
- `src/lib/browser-use/client.ts` — existing singleton client (you'll import `getBrowserUseClient`)
- `src/lib/runner/tools/browser/browse-website.ts` — existing Browser-Use tool (reference pattern for `client.run()`)

---

## Live Verification Overrides (2026-03-30)

These overrides are grounded in live Playwright verification against the production sites and supersede stale assumptions elsewhere in this tasklist.

- **PropertyGuru mapping is confirmed live:** `sg_condo -> N`, `sg_hdb -> H`, `sg_landed -> L`. `property_type` is accepted and canonicalizes to `propertyTypeGroup` on the live site. Do not switch this tasklist to the older `A/T` mapping from stale notes.
- **99.co endpoint is `v11`, not `v10`:** the live page embeds `api/v11/web/search/listings`, plus sibling search endpoints like `widgets` and `relevant-keywords`. Do not implement `/api/v10/web/search/listings`.
- **99.co category mapping is live-verified from page paths:** `/singapore/sale -> main_category=all`, `/singapore/sale/condos-apartments -> condo`, `/singapore/sale/hdb -> hdb`, `/singapore/sale/houses -> landed`.
- **99.co query scaffold is stable enough to build deterministically:** preserve `listing_type`, `main_category`, `name`, `page_num`, `page_size`, `path`, `property_segments`, `query_name`, `show_cluster_preview`, `show_description`, `show_internal_linking`, `show_meta_description`, `show_nearby`, `sort_field=relevance`, and `sort_order=desc`.
- **99.co response shape is live-verified:** listing cards come back under `data.main_results.listing_cards`, not `data.sections[0].listings` or `data.search_results.listings`. The useful fields are primarily nested under `listing_title`, `attributes`, `agent`, and `commute_nearest_mrt`.
- **99.co mortgage estimate is supported by the live API:** `attributes.est_mortgage_formatted` is present in the live `v11` payload and can be normalized directly. Do not treat mortgage as UI-only or best-effort.
- **99.co live payload differs from the older parity fixture:** `xvalue` and `district_number` were not present in the live sample and should not be treated as required output fields for this PR. `highlights` exists under `attributes.highlights` but may be null.
- **Preserve existing public tool contracts:** current tool schemas support multiple `startUrls` / `searchUrls` and `maxItems`. The Browser-Use rewrite should not silently narrow to only the first URL unless the schema changes explicitly.
- **Follow the v2 plan literally on gating:** when `BROWSER_USE_API_KEY` is missing, listing tools should not register and listing prompt injection should be disabled.

---

## Task 1: Shared Browser-Use Task Runner

**Files:**
- Create: `src/lib/browser-use/__tests__/task-runner.test.ts`
- Create: `src/lib/browser-use/task-runner.ts`

This helper wraps `client.run()` with cost caps, structured schema output, and error handling. Both listing tools will use it. Centralize Browser-Use parsing here instead of duplicating `JSON.parse` logic in each market tool.

**Step 1: Write the failing test — happy path**

```typescript
// src/lib/browser-use/__tests__/task-runner.test.ts
/**
 * Tests for the shared Browser-Use Task runner.
 * @module lib/browser-use/__tests__/task-runner
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetBrowserUseClient } = vi.hoisted(() => ({
  mockGetBrowserUseClient: vi.fn(),
}));

vi.mock("../client", () => ({
  getBrowserUseClient: mockGetBrowserUseClient,
}));

import { runBrowserTask } from "../task-runner";

describe("runBrowserTask", () => {
  const mockRun = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrowserUseClient.mockReturnValue({ run: mockRun });
  });

  it("calls client.run with prompt, model, cost cap, and returns parsed output", async () => {
    mockRun.mockResolvedValueOnce({
      isTaskSuccessful: true,
      output: JSON.stringify([{ id: 1, url: "https://pg.com/1", price: 500000 }]),
      totalCostUsd: 0.03,
      llmCostUsd: 0.02,
      proxyCostUsd: 0.005,
      browserCostUsd: 0.005,
    });

    const result = await runBrowserTask("Extract listings from page", {
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(mockRun).toHaveBeenCalledWith("Extract listings from page", {
      model: "bu-mini",
      maxCostUsd: 0.05,
      maxSteps: 20,
      keepAlive: false,
    });
    expect(result).toEqual({
      success: true,
      output: JSON.stringify([{ id: 1, url: "https://pg.com/1", price: 500000 }]),
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/browser-use/__tests__/task-runner.test.ts
```

Expected: FAIL — `runBrowserTask` is not defined.

**Step 3: Write minimal implementation**

```typescript
// src/lib/browser-use/task-runner.ts
/**
 * Shared Browser-Use Cloud Task runner with cost cap and error handling.
 * @module lib/browser-use/task-runner
 */
import { getBrowserUseClient } from "./client";

/** Browser-Use model tier — bu-mini for cost efficiency. */
const BROWSER_USE_MODEL = "bu-mini" as const;

interface RunBrowserTaskOptions {
  /** Hard cost ceiling in USD. Browser-Use stops the session when reached. */
  maxCostUsd: number;
  /** Maximum steps before stopping. */
  maxSteps: number;
}

interface BrowserTaskSuccess {
  success: true;
  output: string;
  cost: { total: number; llm: number; proxy: number; browser: number };
}

interface BrowserTaskFailure {
  success: false;
  error: string;
}

export type BrowserTaskResult = BrowserTaskSuccess | BrowserTaskFailure;

/**
 * Runs a Browser-Use Cloud Task and returns a normalized result envelope.
 */
export async function runBrowserTask(
  prompt: string,
  options: RunBrowserTaskOptions,
): Promise<BrowserTaskResult> {
  const client = getBrowserUseClient();

  const result = await client.run(prompt, {
    model: BROWSER_USE_MODEL,
    maxCostUsd: options.maxCostUsd,
    maxSteps: options.maxSteps,
    keepAlive: false,
  });

  if (!result.isTaskSuccessful) {
    return {
      success: false,
      error: result.output ?? "Browser task failed",
    };
  }

  return {
    success: true,
    output: result.output,
    cost: {
      total: result.totalCostUsd,
      llm: result.llmCostUsd,
      proxy: result.proxyCostUsd,
      browser: result.browserCostUsd,
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/browser-use/__tests__/task-runner.test.ts
```

Expected: PASS.

**Step 5: Write failing test — task failure**

Add to the same test file:

```typescript
  it("returns a failure envelope when the task is not successful", async () => {
    mockRun.mockResolvedValueOnce({
      isTaskSuccessful: false,
      output: "Cloudflare blocked navigation",
      totalCostUsd: 0.01,
      llmCostUsd: 0.008,
      proxyCostUsd: 0.001,
      browserCostUsd: 0.001,
    });

    const result = await runBrowserTask("Navigate to blocked site", {
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(result).toEqual({
      success: false,
      error: "Cloudflare blocked navigation",
    });
  });
```

**Step 6: Run test to verify it passes (already handled by implementation)**

```bash
npx vitest run src/lib/browser-use/__tests__/task-runner.test.ts
```

Expected: PASS — the `!result.isTaskSuccessful` branch already handles this.

**Step 7: Write failing test — client not configured**

```typescript
  it("returns a failure envelope when BROWSER_USE_API_KEY is not configured", async () => {
    mockGetBrowserUseClient.mockImplementation(() => {
      throw new Error("BROWSER_USE_API_KEY is not configured.");
    });

    const result = await runBrowserTask("Any prompt", {
      maxCostUsd: 0.05,
      maxSteps: 20,
    });

    expect(result).toEqual({
      success: false,
      error: "BROWSER_USE_API_KEY is not configured.",
    });
  });
```

**Step 8: Run test to verify it fails**

```bash
npx vitest run src/lib/browser-use/__tests__/task-runner.test.ts
```

Expected: FAIL — currently throws instead of returning failure envelope.

**Step 9: Add try/catch to implementation**

Update `runBrowserTask` in `task-runner.ts` — wrap `getBrowserUseClient()` and `client.run()` in a try/catch:

```typescript
export async function runBrowserTask(
  prompt: string,
  options: RunBrowserTaskOptions,
): Promise<BrowserTaskResult> {
  let client;
  try {
    client = getBrowserUseClient();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "BROWSER_USE_API_KEY is not configured.",
    };
  }

  try {
    const result = await client.run(prompt, {
      model: BROWSER_USE_MODEL,
      maxCostUsd: options.maxCostUsd,
      maxSteps: options.maxSteps,
      keepAlive: false,
    });

    if (!result.isTaskSuccessful) {
      return {
        success: false,
        error: result.output ?? "Browser task failed",
      };
    }

    return {
      success: true,
      output: result.output,
      cost: {
        total: result.totalCostUsd,
        llm: result.llmCostUsd,
        proxy: result.proxyCostUsd,
        browser: result.browserCostUsd,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Browser task failed unexpectedly",
    };
  }
}
```

**Step 10: Run all task-runner tests**

```bash
npx vitest run src/lib/browser-use/__tests__/task-runner.test.ts
```

Expected: All 3 tests PASS.

**Step 11: Commit**

```bash
git add src/lib/browser-use/task-runner.ts src/lib/browser-use/__tests__/task-runner.test.ts
git commit -m "feat(pr57b): add shared Browser-Use task runner with cost cap and error handling"
```

---

## Task 2: Rewrite search-propertyguru.ts

**Files:**
- Rewrite: `src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts`
- Rewrite: `src/lib/runner/tools/market/search-propertyguru.ts`

The public input schema stays the same. The internals change from Apify to Browser-Use. Output schema is upgraded with bonus fields. Preserve support for multiple `startUrls` plus `maxItems`; do not silently collapse to only the first URL.

**Step 1: Write the failing test — happy path with Browser-Use mock**

Replace the entire contents of `search-propertyguru.test.ts`:

```typescript
// src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts
/**
 * Tests for the PropertyGuru property listing search tool (Browser-Use backend).
 * @module lib/runner/tools/market/__tests__/search-propertyguru
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBrowserTask } = vi.hoisted(() => ({
  mockRunBrowserTask: vi.fn(),
}));

vi.mock("@/lib/browser-use/task-runner", () => ({
  runBrowserTask: mockRunBrowserTask,
}));

import { createSearchPropertyguruTool } from "../search-propertyguru";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

/** Fixture matching the __NEXT_DATA__ listingData structure from the parity test. */
const PG_FIXTURE_LISTING = {
  id: 500087559,
  localizedTitle: "Seaside Residences",
  url: "https://www.propertyguru.com.sg/listing/for-sale-seaside-residences-500087559",
  fullAddress: "18 Siglap Link",
  price: { value: 2580000, pretty: "S$ 2,580,000", currency: "SGD" },
  psfText: "S$ 2,521.99 psf",
  bedrooms: 3,
  bathrooms: 2,
  floorArea: 1023,
  badges: [
    { name: "unit_type", text: "Apartment" },
    { name: "tenure", text: "99-year Leasehold" },
  ],
  additionalData: {
    tenure: "L99",
    districtCode: "D15",
    districtText: "East Coast / Marine Parade",
  },
  mrt: { nearbyText: "5 min (410 m) from TE28 Siglap MRT Station" },
  postedOn: { text: "30 Mar 2026" },
  agent: {
    name: "Wayne Tang",
    license: "R063246I",
    profileUrl: "/agent/wayne-tang-21564",
  },
  agency: { name: "KW SINGAPORE REAL ESTATE PTE. LTD." },
  thumbnail: "https://sg1-cdn.pgimgs.com/listing/500087559/UPHO.159086882.V550/Seaside-Residences.jpg",
  mediaCarousel: {
    previewMedia: {
      images: {
        items: [
          { src: "https://sg1-cdn.pgimgs.com/listing/500087559/img1.jpg" },
          { src: "https://sg1-cdn.pgimgs.com/listing/500087559/img2.jpg" },
        ],
      },
    },
  },
};

describe("createSearchPropertyguruTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized listings from Browser-Use task output", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify([PG_FIXTURE_LISTING]),
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      { searchQueries: ["marina bay"], listingType: "sale", propertyType: "sg_condo", maxItems: 10 },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledWith(
      expect.stringContaining("propertyguru.com.sg"),
      { maxCostUsd: 0.05, maxSteps: 20 },
    );
    expect(result).toEqual({
      success: true,
      portal: "propertyguru",
      count: 1,
      results: [
        {
          id: 500087559,
          title: "Seaside Residences",
          url: "https://www.propertyguru.com.sg/listing/for-sale-seaside-residences-500087559",
          address: "18 Siglap Link",
          price: 2580000,
          priceFormatted: "S$ 2,580,000",
          psfFormatted: "S$ 2,521.99 psf",
          bedrooms: 3,
          bathrooms: 2,
          floorAreaSqft: 1023,
          propertyType: "Apartment",
          tenure: "99-year Leasehold",
          districtCode: "D15",
          districtText: "East Coast / Marine Parade",
          mrtProximity: "5 min (410 m) from TE28 Siglap MRT Station",
          postedOn: "30 Mar 2026",
          agentName: "Wayne Tang",
          agentLicense: "R063246I",
          agencyName: "KW SINGAPORE REAL ESTATE PTE. LTD.",
          agentProfileUrl: "https://www.propertyguru.com.sg/agent/wayne-tang-21564",
          thumbnail: "https://sg1-cdn.pgimgs.com/listing/500087559/UPHO.159086882.V550/Seaside-Residences.jpg",
          images: [
            "https://sg1-cdn.pgimgs.com/listing/500087559/img1.jpg",
            "https://sg1-cdn.pgimgs.com/listing/500087559/img2.jpg",
          ],
        },
      ],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });
  });

  it("builds a search URL from query params when no startUrls provided", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify([]),
      cost: { total: 0.01, llm: 0.008, proxy: 0.001, browser: 0.001 },
    });

    const tools = createSearchPropertyguruTool();
    await tools.search_propertyguru.execute(
      { searchQueries: ["orchard road"], listingType: "rent", propertyType: "sg_condo", minPrice: 3000, maxPrice: 5000 },
      EXECUTION_OPTIONS,
    );

    const prompt = mockRunBrowserTask.mock.calls[0][0] as string;
    expect(prompt).toContain("propertyguru.com.sg");
    expect(prompt).toContain("__NEXT_DATA__");
  });

  it("uses startUrls directly when provided", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify([]),
      cost: { total: 0.01, llm: 0.008, proxy: 0.001, browser: 0.001 },
    });

    const tools = createSearchPropertyguruTool();
    await tools.search_propertyguru.execute(
      {
        startUrls: ["https://www.propertyguru.com.sg/property-for-rent?freetext=orchard"],
      },
      EXECUTION_OPTIONS,
    );

    const prompt = mockRunBrowserTask.mock.calls[0][0] as string;
    expect(prompt).toContain("https://www.propertyguru.com.sg/property-for-rent?freetext=orchard");
  });

  it("returns a structured failure envelope when Browser-Use task fails", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: false,
      error: "Cloudflare blocked navigation",
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      { searchQueries: ["marina bay"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Cloudflare blocked navigation",
    });
  });

  it("returns a failure when Browser-Use output is not valid JSON", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: "not json",
      cost: { total: 0.01, llm: 0.008, proxy: 0.001, browser: 0.001 },
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      { searchQueries: ["marina bay"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: false });
  });

  it("rejects non-PropertyGuru Singapore start URLs", () => {
    const tools = createSearchPropertyguruTool();
    const parsed = tools.search_propertyguru.inputSchema.safeParse({
      startUrls: ["https://fake-propertyguru.com.sg/listing/123"],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires at least one search query or start URL", () => {
    const tools = createSearchPropertyguruTool();
    expect(tools.search_propertyguru.inputSchema.safeParse({}).success).toBe(false);
    expect(tools.search_propertyguru.inputSchema.safeParse({ searchQueries: ["   "] }).success).toBe(false);
  });

  it("caps maxItems between 10 and 100", () => {
    const tools = createSearchPropertyguruTool();
    expect(
      tools.search_propertyguru.inputSchema.safeParse({ searchQueries: ["test"], maxItems: 9 }).success,
    ).toBe(false);
    expect(
      tools.search_propertyguru.inputSchema.safeParse({ searchQueries: ["test"], maxItems: 101 }).success,
    ).toBe(false);
  });

  it("handles partial listing data gracefully (missing optional fields)", async () => {
    const partialListing = {
      id: 123,
      url: "https://www.propertyguru.com.sg/listing/test-123",
      price: { value: 100000 },
      // All other fields missing
    };
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify([partialListing]),
      cost: { total: 0.01, llm: 0.008, proxy: 0.001, browser: 0.001 },
    });

    const tools = createSearchPropertyguruTool();
    const result = await tools.search_propertyguru.execute(
      { searchQueries: ["test"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true, count: 1 });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts
```

Expected: FAIL — `search-propertyguru.ts` still imports `apify-client` and doesn't use `runBrowserTask`.

**Step 3: Rewrite the implementation**

Replace the entire contents of `search-propertyguru.ts`:

Implementation note: keep the live-verified PropertyGuru mapping `sg_condo -> N`, `sg_hdb -> H`, `sg_landed -> L`. The current tasklist is correct on this point; older parity notes are stale.

```typescript
// src/lib/runner/tools/market/search-propertyguru.ts
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

/** Hard per-call cost ceiling in USD. */
const MAX_COST_PER_SEARCH_USD = 0.05;
/** Maximum Browser-Use steps per task. */
const MAX_STEPS = 20;

const PG_BASE_URL = "https://www.propertyguru.com.sg";

/** PropertyGuru listing type to URL path segment. */
const LISTING_TYPE_PATH: Record<string, string> = {
  sale: "property-for-sale",
  rent: "property-for-rent",
};

/** PropertyGuru property type to URL query value. */
const PROPERTY_TYPE_PARAM: Record<string, string> = {
  sg_all: "N",
  sg_condo: "N",
  sg_landed: "L",
  sg_hdb: "H",
};

function isAllowedPropertyguruUrl(value: string): boolean {
  return ALLOWED_PROPERTYGURU_HOSTS.has(new URL(value).hostname);
}

/**
 * Builds a PropertyGuru search URL from query parameters.
 */
function buildSearchUrl(params: {
  searchQueries?: string[];
  listingType?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
}): string {
  const listingPath = LISTING_TYPE_PATH[params.listingType ?? "sale"] ?? "property-for-sale";
  const url = new URL(`${PG_BASE_URL}/${listingPath}`);

  if (params.searchQueries?.length) {
    url.searchParams.set("freetext", params.searchQueries.join(" "));
  }
  if (params.propertyType && PROPERTY_TYPE_PARAM[params.propertyType]) {
    url.searchParams.set("property_type", PROPERTY_TYPE_PARAM[params.propertyType]);
  }
  if (typeof params.minPrice === "number") {
    url.searchParams.set("minprice", String(params.minPrice));
  }
  if (typeof params.maxPrice === "number") {
    url.searchParams.set("maxprice", String(params.maxPrice));
  }

  return url.toString();
}

/** Raw listing shape from PropertyGuru's __NEXT_DATA__. */
interface PgRawListing {
  id?: number;
  localizedTitle?: string;
  url?: string;
  fullAddress?: string;
  price?: { value?: number; pretty?: string; currency?: string };
  psfText?: string;
  bedrooms?: number;
  bathrooms?: number;
  floorArea?: number;
  badges?: Array<{ name?: string; text?: string }>;
  additionalData?: { tenure?: string; districtCode?: string; districtText?: string };
  mrt?: { nearbyText?: string };
  postedOn?: { text?: string };
  agent?: { name?: string; license?: string; profileUrl?: string };
  agency?: { name?: string };
  thumbnail?: string;
  mediaCarousel?: {
    previewMedia?: {
      images?: { items?: Array<{ src?: string }> };
    };
  };
}

/** Normalized listing returned to the agent. */
interface PgNormalizedListing {
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

/**
 * Normalizes a raw __NEXT_DATA__ listing into the agent-facing schema.
 */
function normalizePgListing(raw: PgRawListing): PgNormalizedListing | null {
  if (!raw.id || !raw.url || !raw.price?.value) return null;

  const unitTypeBadge = raw.badges?.find((b) => b.name === "unit_type");
  const tenureBadge = raw.badges?.find((b) => b.name === "tenure");
  const images = raw.mediaCarousel?.previewMedia?.images?.items
    ?.map((item) => item.src)
    .filter((src): src is string => Boolean(src));

  const agentProfileUrl = raw.agent?.profileUrl
    ? (raw.agent.profileUrl.startsWith("http")
        ? raw.agent.profileUrl
        : `${PG_BASE_URL}${raw.agent.profileUrl}`)
    : undefined;

  return {
    id: raw.id,
    title: raw.localizedTitle,
    url: raw.url,
    address: raw.fullAddress,
    price: raw.price.value,
    priceFormatted: raw.price.pretty,
    psfFormatted: raw.psfText,
    bedrooms: raw.bedrooms,
    bathrooms: raw.bathrooms,
    floorAreaSqft: raw.floorArea,
    propertyType: unitTypeBadge?.text,
    tenure: tenureBadge?.text ?? raw.additionalData?.tenure,
    districtCode: raw.additionalData?.districtCode,
    districtText: raw.additionalData?.districtText,
    mrtProximity: raw.mrt?.nearbyText,
    postedOn: raw.postedOn?.text,
    agentName: raw.agent?.name,
    agentLicense: raw.agent?.license,
    agencyName: raw.agency?.name,
    agentProfileUrl,
    thumbnail: raw.thumbnail,
    images: images?.length ? images : undefined,
  };
}

const searchPropertyguruInputSchema = z
  .object({
    searchQueries: z
      .array(z.string().trim().min(1, "Search queries cannot be blank"))
      .optional()
      .describe("Free-text PropertyGuru search queries. Only used when startUrls is empty."),
    startUrls: z
      .array(
        z.string().url().refine(isAllowedPropertyguruUrl, {
          message: "Must be a PropertyGuru Singapore URL (propertyguru.com.sg)",
        }),
      )
      .optional()
      .describe("Direct PropertyGuru Singapore search result URLs. Overrides query-builder fields when provided."),
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
      .describe(`Maximum listings to return. Minimum ${MIN_PROVIDER_ITEMS}, default ${MAX_TOOL_ITEMS}.`),
  })
  .refine(
    (value) =>
      (value.searchQueries?.length ?? 0) > 0 ||
      (value.startUrls?.length ?? 0) > 0,
    { message: "At least one of searchQueries or startUrls is required" },
  );

/**
 * Creates the PropertyGuru listing tool backed by Browser-Use Cloud.
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
    }) => {
      const searchUrl =
        startUrls && startUrls.length > 0
          ? startUrls[0]
          : buildSearchUrl({ searchQueries, listingType, propertyType, minPrice, maxPrice });

      const taskPrompt = [
        `Navigate to ${searchUrl}.`,
        "Wait for the page to fully load (a Cloudflare challenge may take a few seconds).",
        "Extract the JSON from: window.__NEXT_DATA__.props.pageProps.pageData.data.listingsData",
        "For each item, read the .listingData object.",
        "Return the array of listingData objects as a JSON array.",
      ].join("\n");

      const taskResult = await runBrowserTask(taskPrompt, {
        maxCostUsd: MAX_COST_PER_SEARCH_USD,
        maxSteps: MAX_STEPS,
      });

      if (!taskResult.success) {
        return { success: false as const, error: taskResult.error };
      }

      let rawListings: PgRawListing[];
      try {
        const parsed = JSON.parse(taskResult.output);
        rawListings = Array.isArray(parsed) ? parsed : [];
      } catch {
        return { success: false as const, error: "Failed to parse listing data from PropertyGuru" };
      }

      const results = rawListings
        .map(normalizePgListing)
        .filter((listing): listing is PgNormalizedListing => listing !== null);

      return {
        success: true as const,
        portal: "propertyguru" as const,
        count: results.length,
        results,
        cost: taskResult.cost,
      };
    },
  });

  return { search_propertyguru };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts
```

Expected: All 8 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/tools/market/search-propertyguru.ts src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts
git commit -m "feat(pr57b): rewrite search_propertyguru with Browser-Use Cloud backend"
```

---

## Task 3: Rewrite search-99co.ts

**Files:**
- Rewrite: `src/lib/runner/tools/market/__tests__/search-99co.test.ts`
- Rewrite: `src/lib/runner/tools/market/search-99co.ts`

Same pattern as Task 2. The public input schema stays the same. Output schema upgraded with bonus fields. Preserve support for multiple `searchUrls` plus `maxItems`; do not silently collapse to only the first URL.

Implementation override for the example below: the older parity fixture shape in this section is stale. The live `v11` response uses `listing_title`, `attributes`, `agent`, and `commute_nearest_mrt` rather than the older top-level fields like `sub_category_formatted`, `project_name`, `district_number`, and `xvalue`. When implementing, model the normalized output from the live `listing_cards` payload, not the older fixture shape.

**Step 1: Write the failing test**

Replace the entire contents of `search-99co.test.ts`:

```typescript
// src/lib/runner/tools/market/__tests__/search-99co.test.ts
/**
 * Tests for the 99.co property listing search tool (Browser-Use backend).
 * @module lib/runner/tools/market/__tests__/search-99co
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBrowserTask } = vi.hoisted(() => ({
  mockRunBrowserTask: vi.fn(),
}));

vi.mock("@/lib/browser-use/task-runner", () => ({
  runBrowserTask: mockRunBrowserTask,
}));

import { createSearch99coTool } from "../search-99co";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

/** Fixture matching the live-verified v11 listing card structure. */
const NINETY_NINE_FIXTURE_LISTING = {
  id: "LEJKAkNxXRnv2njgxYna3u",
  sub_category_formatted: "HDB 5 Rooms",
  project_name: "467 Segar Road",
  listing_url: "/singapore/sale/property/467-segar-road-hdb-LEJKAkNxXRnv2njgxYna3u",
  address_line_1: "467 Segar Rd",
  address_line_2: "Singapore 670467 · D23",
  postal_code: "670467",
  district_number: 23,
  attributes: {
    price: 590000,
    price_formatted: "S$ 590,000",
    area_ppsf: 498,
    area_ppsf_formatted: "S$ 498 psf",
    bedrooms: 3,
    bathrooms: 2,
    area_size: 1184,
    area_size_sqm: 110,
    tenure: "99 yrs",
    completed_at: 2002,
  },
  date_formatted: "14 mins ago",
  highlights: "Very windy park view 5i 467 segar road",
  xvalue: { val: 584000 },
  within_distance_from_query: {
    exact_distance: 392,
    closest_mrt: { title: "Fajar LRT", walking_time_in_mins: 5 },
  },
  user: {
    name: "Mark Tan",
    phone: "+6590093803",
    whatsapp: "+6590093803",
  },
  location: { coordinates: { lat: 1.387, lng: 103.774 } },
  photos: [
    { url: "https://pic2.99.co/v3/photo1.jpg" },
    { url: "https://pic2.99.co/v3/photo2.jpg" },
  ],
};

describe("createSearch99coTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized listings from Browser-Use task output", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify([NINETY_NINE_FIXTURE_LISTING]),
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      { searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10&price_max=2000000"] },
      EXECUTION_OPTIONS,
    );

    expect(mockRunBrowserTask).toHaveBeenCalledWith(
      expect.stringContaining("99.co"),
      { maxCostUsd: 0.05, maxSteps: 20 },
    );
    expect(result).toEqual({
      success: true,
      portal: "99co",
      count: 1,
      results: [
        {
          id: "LEJKAkNxXRnv2njgxYna3u",
          title: "HDB 5 Rooms in 467 Segar Road",
          url: "https://www.99.co/singapore/sale/property/467-segar-road-hdb-LEJKAkNxXRnv2njgxYna3u",
          address: "467 Segar Rd, Singapore 670467 · D23",
          postalCode: "670467",
          district: 23,
          price: 590000,
          priceFormatted: "S$ 590,000",
          psf: 498,
          psfFormatted: "S$ 498 psf",
          bedrooms: 3,
          bathrooms: 2,
          floorAreaSqft: 1184,
          floorAreaSqm: 110,
          tenure: "99 yrs",
          builtYear: 2002,
          category: "HDB 5 Rooms",
          postedAt: "14 mins ago",
          highlights: "Very windy park view 5i 467 segar road",
          xvalue: 584000,
          mrtName: "Fajar LRT",
          mrtDistanceM: 392,
          mrtWalkingMins: 5,
          agentName: "Mark Tan",
          agentPhone: "+6590093803",
          agentWhatsapp: "+6590093803",
          coordinates: { lat: 1.387, lng: 103.774 },
          photos: [
            "https://pic2.99.co/v3/photo1.jpg",
            "https://pic2.99.co/v3/photo2.jpg",
          ],
        },
      ],
      cost: { total: 0.03, llm: 0.02, proxy: 0.005, browser: 0.005 },
    });
  });

  it("returns a failure envelope when Browser-Use task fails", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: false,
      error: "Browser task failed: timeout",
    });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      { searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Browser task failed: timeout" });
  });

  it("returns a failure when output is not valid JSON", async () => {
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: "not json",
      cost: { total: 0.01, llm: 0.008, proxy: 0.001, browser: 0.001 },
    });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      { searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: false });
  });

  it("rejects malicious lookalike hosts at the schema layer", () => {
    const tools = createSearch99coTool();
    const parsed = tools.search_99co.inputSchema.safeParse({
      searchUrls: ["https://evil99.co/singapore/sale?query_ids=district-10"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-Singapore 99.co paths at the schema layer", () => {
    const tools = createSearch99coTool();
    const parsed = tools.search_99co.inputSchema.safeParse({
      searchUrls: ["https://www.99.co/malaysia/sale?query_ids=kuala-lumpur"],
    });
    expect(parsed.success).toBe(false);
  });

  it("caps maxItems at 100", () => {
    const tools = createSearch99coTool();
    const parsed = tools.search_99co.inputSchema.safeParse({
      searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"],
      maxItems: 101,
    });
    expect(parsed.success).toBe(false);
  });

  it("handles partial listing data gracefully", async () => {
    const partialListing = {
      id: "abc123",
      listing_url: "/singapore/sale/property/test-abc123",
      attributes: { price: 100000 },
    };
    mockRunBrowserTask.mockResolvedValueOnce({
      success: true,
      output: JSON.stringify([partialListing]),
      cost: { total: 0.01, llm: 0.008, proxy: 0.001, browser: 0.001 },
    });

    const tools = createSearch99coTool();
    const result = await tools.search_99co.execute(
      { searchUrls: ["https://www.99.co/singapore/sale?query_ids=district-10"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true, count: 1 });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-99co.test.ts
```

Expected: FAIL — `search-99co.ts` still imports `apify-client`.

**Step 3: Rewrite the implementation**

Replace the entire contents of `search-99co.ts`:

```typescript
// src/lib/runner/tools/market/search-99co.ts
/**
 * 99.co public listing search tool backed by Browser-Use Cloud.
 * @module lib/runner/tools/market/search-99co
 */
import { tool } from "ai";
import { z } from "zod";

import { runBrowserTask } from "@/lib/browser-use/task-runner";

const ALLOWED_99CO_HOSTS = new Set(["99.co", "www.99.co"]);
const MAX_TOOL_ITEMS = 100;

/** Hard per-call cost ceiling in USD. */
const MAX_COST_PER_SEARCH_USD = 0.05;
/** Maximum Browser-Use steps per task. */
const MAX_STEPS = 20;

const NINETY_NINE_BASE_URL = "https://www.99.co";

function isAllowed99coSearchUrl(value: string): boolean {
  const parsed = new URL(value);
  return (
    ALLOWED_99CO_HOSTS.has(parsed.hostname) &&
    parsed.pathname.startsWith("/singapore/")
  );
}

/** Extracts API query params from a 99.co search URL. */
function buildApiUrl(searchUrl: string): string {
  const parsed = new URL(searchUrl);
  const apiUrl = new URL(`${NINETY_NINE_BASE_URL}/api/v11/web/search/listings`);

  // Use the live-verified query scaffold from the streamed page payload.
  apiUrl.searchParams.set(
    "listing_type",
    parsed.searchParams.get("listing_type") ?? (parsed.pathname.includes("/rent") ? "rent" : "sale"),
  );
  apiUrl.searchParams.set("main_category", parsed.searchParams.get("main_category") ?? "all");
  apiUrl.searchParams.set("property_segments", "residential");
  apiUrl.searchParams.set("page_num", "1");
  apiUrl.searchParams.set("page_size", "36");
  apiUrl.searchParams.set("show_cluster_preview", "true");
  apiUrl.searchParams.set("show_nearby", "true");
  apiUrl.searchParams.set("show_description", "true");
  apiUrl.searchParams.set("show_internal_linking", "true");
  apiUrl.searchParams.set("show_meta_description", "true");
  apiUrl.searchParams.set("sort_field", "relevance");
  apiUrl.searchParams.set("sort_order", "desc");

  // Copy over any query params from the original search URL
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!apiUrl.searchParams.has(key)) {
      apiUrl.searchParams.set(key, value);
    }
  }

  // Live-verified path/category mapping:
  // /singapore/sale -> all
  // /singapore/sale/condos-apartments -> condo
  // /singapore/sale/hdb -> hdb
  // /singapore/sale/houses -> landed
  const lowerPath = parsed.pathname.toLowerCase();
  if (lowerPath === "/singapore/sale/condos-apartments") {
    apiUrl.searchParams.set("main_category", "condo");
  } else if (lowerPath === "/singapore/sale/hdb") {
    apiUrl.searchParams.set("main_category", "hdb");
  } else if (lowerPath === "/singapore/sale/houses") {
    apiUrl.searchParams.set("main_category", "landed");
  }

  apiUrl.searchParams.set("name", "Singapore");
  apiUrl.searchParams.set("query_name", "Singapore");
  apiUrl.searchParams.set("path", parsed.pathname);

  return apiUrl.toString();
}

/** Raw listing shape from 99.co's live-verified v11 listing card payload. */
interface NinetyNineRawListing {
  id?: string;
  sub_category_formatted?: string;
  project_name?: string;
  listing_url?: string;
  address_line_1?: string;
  address_line_2?: string;
  postal_code?: string;
  district_number?: number;
  attributes?: {
    price?: number;
    price_formatted?: string;
    area_ppsf?: number;
    area_ppsf_formatted?: string;
    bedrooms?: number;
    bathrooms?: number;
    area_size?: number;
    area_size_sqm?: number;
    tenure?: string;
    completed_at?: number;
  };
  date_formatted?: string;
  highlights?: string;
  xvalue?: { val?: number };
  within_distance_from_query?: {
    exact_distance?: number;
    closest_mrt?: { title?: string; walking_time_in_mins?: number };
  };
  user?: { name?: string; phone?: string; whatsapp?: string };
  location?: { coordinates?: { lat?: number; lng?: number } };
  photos?: Array<{ url?: string }>;
}

/** Normalized listing returned to the agent. */
interface NinetyNineNormalizedListing {
  id: string;
  title?: string;
  url: string;
  address?: string;
  postalCode?: string;
  district?: number;
  price: number;
  priceFormatted?: string;
  psf?: number;
  psfFormatted?: string;
  bedrooms?: number;
  bathrooms?: number;
  floorAreaSqft?: number;
  floorAreaSqm?: number;
  tenure?: string;
  builtYear?: number;
  category?: string;
  postedAt?: string;
  highlights?: string;
  xvalue?: number;
  mrtName?: string;
  mrtDistanceM?: number;
  mrtWalkingMins?: number;
  agentName?: string;
  agentPhone?: string;
  agentWhatsapp?: string;
  coordinates?: { lat: number; lng: number };
  photos?: string[];
}

/**
 * Normalizes a raw v11 listing card into the agent-facing schema.
 */
function normalize99coListing(raw: NinetyNineRawListing): NinetyNineNormalizedListing | null {
  if (!raw.id || !raw.listing_url || !raw.attributes?.price) return null;

  const url = raw.listing_url.startsWith("http")
    ? raw.listing_url
    : `${NINETY_NINE_BASE_URL}${raw.listing_url}`;

  const title =
    raw.sub_category_formatted && raw.project_name
      ? `${raw.sub_category_formatted} in ${raw.project_name}`
      : raw.sub_category_formatted ?? raw.project_name;

  const address =
    raw.address_line_1 && raw.address_line_2
      ? `${raw.address_line_1}, ${raw.address_line_2}`
      : raw.address_line_1 ?? raw.address_line_2;

  const photos = raw.photos
    ?.map((p) => p.url)
    .filter((u): u is string => Boolean(u));

  const coords = raw.location?.coordinates;
  const coordinates =
    typeof coords?.lat === "number" && typeof coords?.lng === "number"
      ? { lat: coords.lat, lng: coords.lng }
      : undefined;

  return {
    id: raw.id,
    title,
    url,
    address,
    postalCode: raw.postal_code,
    district: raw.district_number,
    price: raw.attributes.price,
    priceFormatted: raw.attributes.price_formatted,
    psf: raw.attributes.area_ppsf,
    psfFormatted: raw.attributes.area_ppsf_formatted,
    bedrooms: raw.attributes.bedrooms,
    bathrooms: raw.attributes.bathrooms,
    floorAreaSqft: raw.attributes.area_size,
    floorAreaSqm: raw.attributes.area_size_sqm,
    tenure: raw.attributes.tenure,
    builtYear: raw.attributes.completed_at,
    category: raw.sub_category_formatted,
    postedAt: raw.date_formatted,
    highlights: raw.highlights,
    xvalue: raw.xvalue?.val,
    mrtName: raw.within_distance_from_query?.closest_mrt?.title,
    mrtDistanceM: raw.within_distance_from_query?.exact_distance,
    mrtWalkingMins: raw.within_distance_from_query?.closest_mrt?.walking_time_in_mins,
    agentName: raw.user?.name,
    agentPhone: raw.user?.phone,
    agentWhatsapp: raw.user?.whatsapp,
    coordinates,
    photos: photos?.length ? photos : undefined,
  };
}

const search99coInputSchema = z.object({
  searchUrls: z
    .array(
      z.string().url().refine(isAllowed99coSearchUrl, {
        message: "Must be a 99.co Singapore search URL (https://www.99.co/singapore/...)",
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
 * Creates the 99.co listing tool backed by Browser-Use Cloud.
 */
export function createSearch99coTool() {
  const search_99co = tool({
    description:
      "Search current public 99.co Singapore listings using one or more 99.co search URLs.",
    inputSchema: search99coInputSchema,
    execute: async ({ searchUrls }) => {
      const apiUrl = buildApiUrl(searchUrls[0]);

      const taskPrompt = [
        `Navigate to ${searchUrls[0]}.`,
        "Once the page loads, execute this JavaScript in the page context:",
        `fetch('${apiUrl}').then(r => r.json())`,
        "Read data.main_results.listing_cards from the response.",
        "Return the listing_cards array as a JSON array.",
      ].join("\n");

      const taskResult = await runBrowserTask(taskPrompt, {
        maxCostUsd: MAX_COST_PER_SEARCH_USD,
        maxSteps: MAX_STEPS,
      });

      if (!taskResult.success) {
        return { success: false as const, error: taskResult.error };
      }

      let rawListings: NinetyNineRawListing[];
      try {
        const parsed = JSON.parse(taskResult.output);
        rawListings = Array.isArray(parsed) ? parsed : [];
      } catch {
        return { success: false as const, error: "Failed to parse listing data from 99.co" };
      }

      const results = rawListings
        .map(normalize99coListing)
        .filter((listing): listing is NinetyNineNormalizedListing => listing !== null);

      return {
        success: true as const,
        portal: "99co" as const,
        count: results.length,
        results,
        cost: taskResult.cost,
      };
    },
  });

  return { search_99co };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/search-99co.test.ts
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/tools/market/search-99co.ts src/lib/runner/tools/market/__tests__/search-99co.test.ts
git commit -m "feat(pr57b): rewrite search_99co with Browser-Use Cloud backend"
```

---

## Task 4: Update tool registration & context gating

**Files:**
- Modify: `src/lib/runner/tools/market/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`

The listing tools are currently unconditionally created for non-subagent runs. The `includePropertyListings` prompt flag is gated on `isApifyConfigured()`. Per the v2 plan, we need to gate both tool registration and prompt injection on `isBrowserUseConfigured()`.

**Step 1: Update `index.ts` JSDoc**

In `src/lib/runner/tools/market/index.ts`, change the JSDoc on `createListingTools`:

```typescript
/**
 * Creates the Browser-Use-backed public listing tools without any Supabase dependency.
 */
export function createListingTools() {
```

**Step 2: Update `tool-registry.ts` — gate listing tools on Browser-Use**

In `src/lib/runner/tool-registry.ts`, the current line 64 is:

```typescript
const listingTools = isSubagent ? {} : createListingTools();
```

Change to:

```typescript
const listingTools =
  isSubagent || !isBrowserUseConfigured() ? {} : createListingTools();
```

This gate is required. Returning a failure envelope from the tool implementation is not enough because the v2 plan explicitly says the tools should not register when `BROWSER_USE_API_KEY` is missing.

**Step 3: Update `run-agent.ts` — replace Apify check with Browser-Use check**

In `src/lib/runner/run-agent.ts`, line 15 currently imports:

```typescript
import { isApifyConfigured } from "@/lib/apify/env";
```

And line 296-297:

```typescript
includePropertyListings:
  payload.triggerType === "chat" && isApifyConfigured(),
```

Change to:

```typescript
// Line 15: remove the isApifyConfigured import (isBrowserUseConfigured is already imported on line 16)
// Line 296-297: replace isApifyConfigured() with isBrowserUseConfigured()
includePropertyListings:
  payload.triggerType === "chat" && isBrowserUseConfigured(),
```

Delete the `import { isApifyConfigured } from "@/lib/apify/env";` line entirely. `isBrowserUseConfigured` is already imported from `@/lib/browser-use/client` on the next line.

**Step 4: Update `run-agent.test.ts` — replace Apify mock with Browser-Use mock**

In `src/lib/runner/__tests__/run-agent.test.ts`:

1. Remove the `mockIsApifyConfigured` from the hoisted mock declarations.
2. Remove the `vi.mock("@/lib/apify/env", ...)` block.
3. Find all places where `mockIsApifyConfigured` is used and replace with `mockIsBrowserUseConfigured` (which already exists in the test file — it mocks `@/lib/browser-use/client`).
4. Update the assertions: where tests check `includePropertyListings: true`, make sure the setup sets `mockIsBrowserUseConfigured.mockReturnValue(true)`.
5. Where tests check `includePropertyListings: false` for non-chat triggers, ensure `mockIsBrowserUseConfigured` returns true but trigger type is not "chat".

**Step 5: Run all affected tests**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/tool-registry.test.ts src/lib/runner/__tests__/context.test.ts
```

Expected: All PASS.

**Step 6: Run the full market test suite**

```bash
npx vitest run src/lib/runner/tools/market/__tests__/ src/lib/browser-use/__tests__/
```

Expected: All PASS.

**Step 7: Commit (this is the final piece of Commit 1)**

```bash
git add src/lib/runner/tools/market/index.ts src/lib/runner/tool-registry.ts src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(pr57b): gate listing tools on BROWSER_USE_API_KEY, remove Apify import from run-agent"
```

---

## Task 5: Delete Apify plumbing (Commit 2)

**Files:**
- Delete: `src/lib/runner/tools/market/apify-client.ts`
- Delete: `src/lib/runner/tools/market/__tests__/apify-client.test.ts`
- Delete: `src/lib/apify/env.ts`
- Modify: `src/lib/runner/__tests__/integration-lifecycle.test.ts` — remove Apify mock
- Modify: `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts` — remove Apify mock

This is a separate commit so it can be independently reverted.

**Step 1: Delete the Apify files**

```bash
rm src/lib/runner/tools/market/apify-client.ts
rm src/lib/runner/tools/market/__tests__/apify-client.test.ts
rm src/lib/apify/env.ts
```

**Step 2: Check if `src/lib/apify/` directory is now empty and remove it**

```bash
ls src/lib/apify/
# If empty:
rmdir src/lib/apify/
```

**Step 3: Remove Apify mock from `integration-lifecycle.test.ts`**

In `src/lib/runner/__tests__/integration-lifecycle.test.ts`, find and delete the block (around lines 385-387):

```typescript
vi.mock("@/lib/apify/env", () => ({
  isApifyConfigured: vi.fn(() => false),
}));
```

**Step 4: Remove Apify mock from `run-subagent.test.ts`**

In `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`, find and delete:

1. The `mockIsApifyConfigured` from the hoisted declaration
2. The `vi.mock("@/lib/apify/env", ...)` block
3. Any references to `mockIsApifyConfigured` in test setup/assertions

**Step 5: Search for any remaining Apify references**

```bash
grep -r "apify\|Apify\|APIFY" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining references. Expected files: none (system-prompt.ts `PROPERTY_LISTING_PROMPT` doesn't mention Apify — it only mentions tool names).

**Step 6: Run all tests to confirm nothing is broken**

```bash
npx vitest run src/lib/runner/ src/lib/browser-use/
```

Expected: All PASS.

**Step 7: Commit (Commit 2 — independently revertable)**

```bash
git add -A
git commit -m "chore(pr57b): delete Apify plumbing (apify-client, env, tests, mocks)"
```

---

## Task 6: Manual integration smoke test & v2 plan update

**Step 1: Set BROWSER_USE_API_KEY in local `.env`**

Verify `BROWSER_USE_API_KEY` is set in your local `.env` file. It should already be there from PR 50.

**Step 2: Run one live PropertyGuru search**

Start the dev server and trigger a chat message like:

> "Search PropertyGuru for 3-bed condos in East Coast under $3M"

Verify:
- Tool call resolves within 30 seconds
- Response includes bonus fields (tenure, district, MRT proximity, agency)
- `cost.total` is under $0.05
- Compare a few listings against `docs/debug/listing-tools-parity-test.md`

**Step 3: Run one live 99.co search**

Trigger:

> "Search 99.co for HDB in Bukit Panjang under $600K"

Verify:
- Tool call resolves within 30 seconds
- Response includes supported live fields (mortgage estimate, coordinates, postal code, MRT proximity, agent contact info)
- `highlights` is optional and may be null depending on the listing card payload
- `cost.total` is under $0.05

**Step 4: Mark PR 57b as `in_progress` in v2 plan**

Update `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`:

```json
{
  "pr": "57b",
  "status": "in_progress",
  ...
}
```

**Step 5: Final commit**

```bash
git add docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json
git commit -m "docs(pr57b): mark PR 57b in_progress in v2 plan"
```
