# PR 57: Property Portal Listing Tools (search_99co + search_propertyguru)

**Date:** 2026-03-23
**Phase:** 3 (Connections + Subagents + Data Tools)
**Depends on:** Nothing (standalone tools, env-gated)
**Status:** Design complete

## What It Is

Two agent tools that search live property listings on 99.co and PropertyGuru via their respective Apify actors. Returns current asking prices, photos, agent details, and listing metadata — the "live market" layer that complements PR 55's historical transaction data.

## Why It Exists

| Tool | What it covers |
|------|---------------|
| `search_market_data` (PR 55) | What **actually sold** — URA/HDB/CEA historical transactions |
| `browse_website` / `search_property_portal` (PR 50/50c) | **Login-gated** internal portals (PropNex, inhouse systems) |
| **`search_99co` + `search_propertyguru` (this PR)** | **Live public listings** — asking prices, active inventory, agent contacts |

A real estate client asks "what's available in District 10 under $2M?" — the agent needs active listing data that only portal scraping can provide. Government APIs (URA/HDB) cover what already transacted. Browser-Use handles internal portals. This PR fills the gap for public consumer portals.

## Provider Selection

Both tools use Apify actors — the highest-credibility third-party option for each portal:

| Portal | Apify Actor API ID | Pricing (illustrative, verify before use) | MCP-ready | Notes |
|--------|---------------------|-------------------------------------------|-----------|-------|
| 99.co | `easyapi~99-co-property-listings-scraper` | Subscription + usage-based billing on Apify | Yes | Use the API actor ID format, not the store-page slug. OpenAPI spec available. Rich nested output (MRT walk times, mortgage estimates). |
| PropertyGuru | `fatihtahta~propertyguru-scraper-ddproperty-batdongsan-ppe` | Pay-per-result pricing on Apify | Yes | Use the API actor ID format, not the store-page slug. Structured query builder. Flat output. Covers SG/MY/TH/VN (we use SG only). |

> **Note:** Apify actor pricing changes frequently. The figures above are illustrative based on research conducted 2026-03-23. Verify current pricing on the actor pages before committing to budget assumptions.

**Why two separate tools (not one unified tool):**
- Input schemas are fundamentally different — 99.co is URL-based, PropertyGuru has a structured query builder
- Output shapes diverge — 99.co uses nested `{ value, unit, formatted_string }` objects, PG uses flat primitives
- Unique fields per portal (MRT walk times vs developer info)
- A normalization layer would add complexity for minimal gain — the LLM reasons about both formats natively

## Design Decisions (post-review)

Six decisions made after code review, documented here as the binding spec:

### D1. Chat-only scope

Tools are registered for **chat only** — excluded from autopilot and subagents. Rationale: paid scraping without a human in the loop is a cost risk. Automated flows for these portals remain deferred until we explicitly reopen that scope. Opening to autopilot/subagents is a one-line registry change if needed later.

### D2. Separate env gating from market data

Tools use a **distinct `isApifyConfigured()` gate** (`!!process.env.APIFY_TOKEN`), independent from `isPropertySupabaseConfigured()`. The two services are independently configurable — a client may have market data (Supabase) but no Apify subscription, or vice versa. Separate flags in `tool-registry.ts` and `context.ts` / prompt injection paths.

**Barrel isolation requirement:** The current `market/index.ts` barrel eagerly creates the property Supabase client at import time. Apify listing tools **must not** be exported from the same factory or gated behind the same barrel. Implementation must either: (a) export Apify tools from a separate `createListingTools()` factory that does not touch `createPropertyPublicServerClient()`, or (b) make the existing barrel lazily create the Supabase client only when `isPropertySupabaseConfigured()` is true. An APIFY-only deployment (no property Supabase) must not blow up on missing property-Supabase env vars.

### D3. Strict input contracts

- **PropertyGuru:** `country` is hardcoded to `"sg"` internally — never exposed to the agent. At least one of `searchQueries` or `startUrls` is required (Zod `.refine()` enforces this). `startUrls` are validated against an explicit hostname allowlist (`www.propertyguru.com.sg`, `propertyguru.com.sg`).
- **99.co:** URLs are validated against an explicit hostname allowlist (`www.99.co`, `99.co`) — not suffix matching (which would accept `evil99.co`). Path must start with `/singapore/`. Malformed or non-SG URLs are rejected before the Apify call. No URL-builder helper — LLMs handle readable query strings well, and a builder would mean reverse-engineering 99.co's param schema.

### D4. Safe shared Apify client

The `apify-client.ts` wrapper is thin but safe:
- **Auth:** `Authorization: Bearer ${APIFY_TOKEN}` header — not query string (avoids token leaking into logs/error messages).
- **Timeout:** Reuses the existing `fetchWithTimeout()` from `src/lib/runner/tools/web/fetch-with-timeout.ts` with a 90s timeout.
- **Error parsing:** Parses Apify error payloads (`error.message` from JSON body) instead of generic HTTP status errors.
- **Cost cap:** Passes `maxTotalChargeUsd` query param where the sync endpoint supports it, as a hard spending guard. Internal API name: `maxTotalChargeUsd` (matches Apify's query param name exactly — no aliasing).
- **No SDK dependency** — plain `fetch`.

### D5. Thin output envelope

Tool response shape: `{ success: true, portal: '99co' | 'propertyguru', count: number, results: T[] }` on success, `{ success: false, error: string }` on failure.
- 99.co `listing_url` values are canonicalized to absolute URLs (`https://www.99.co/...`).
- Otherwise, portal-native field shapes are preserved — no shared normalized listing schema. The LLM reasons about both formats natively.

### D6. Broad test coverage following existing patterns

Test responsibilities are split by concern:
- **`market/__tests__/apify-client.test.ts`** — Apify client unit tests (auth, timeout, error parsing, cost param)
- **`market/__tests__/search-99co.test.ts`** — tool unit tests (mock response, URL validation, output envelope, URL canonicalization)
- **`market/__tests__/search-propertyguru.test.ts`** — tool unit tests (mock response, refine validation, country hardcoding, output envelope)
- **`src/lib/ai/__tests__/system-prompt.test.ts`** — fragment content tests only (property search routing text is present in the prompt string). No env-conditional logic here.
- **`src/lib/runner/__tests__/context.test.ts`** — env-conditioned presence/absence of property listing prompt injection (independent from market data flag)
- **`src/lib/runner/__tests__/tool-registry.test.ts`** — env gating (Apify tools registered/absent), chat-only scope, independence from market data flag

## Tool 1: search_99co

### Input Schema

```ts
const ALLOWED_99CO_HOSTS = new Set(['99.co', 'www.99.co'])

z.object({
  searchUrls: z.array(
    z.string().url().refine(
      (url) => {
        const parsed = new URL(url)
        return ALLOWED_99CO_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith('/singapore/')
      },
      { message: 'Must be a 99.co Singapore search URL (https://www.99.co/singapore/...)' }
    )
  ).min(1).describe(
    '99.co search result URLs with filters in query params. ' +
    'Example: https://www.99.co/singapore/sale?query_ids=district-10&bedrooms=3&price_max=2500000'
  ),
  maxItems: z.number().int().min(1).max(100).default(30).optional()
    .describe('Maximum listings to return. Default 30, max 100.'),
})
```

### Output Fields (per listing)

| Field | Type | Example |
|-------|------|---------|
| `listing_title` | `string` | `"2 Bed Apartment (Condo) for Sale in City Gate"` |
| `listing_url` | `string` | **Absolute URL** (canonicalized from relative) |
| `attributes.price` | `{ value, unit, formatted_string }` | `{ value: 1670000, unit: "S$", formatted_string: "S$ 1,670,000" }` |
| `attributes.psf` | `{ value, unit, formatted_string }` | `"S$ 2,155 psf"` |
| `attributes.beds` | `{ value, formatted_string }` | `"2 Beds"` |
| `attributes.bathrooms` | `{ value, formatted_string }` | `"2 Baths"` |
| `attributes.floorarea_sqft` | `{ value, unit, formatted_string }` | `775 sqft` |
| `attributes.lease_type` | `string` | `"99 yrs"` |
| `attributes.top` | `string` | `"2024"` (TOP year) |
| `attributes.furnishing` | `string \| null` | |
| `attributes.formatted_address` | `string` | `"371 Beach Road 199597"` |
| `attributes.est_mortgage_formatted` | `string` | `"Est. Mortgage S$ 5,979/mo"` |
| `attributes.posted_at_formatted` | `string` | `"12m"` (12 minutes ago) |
| `commute_nearest_mrt.name` | `string` | `"Nicoll Highway MRT"` |
| `commute_nearest_mrt.distance` | `{ value, formatted_string }` | `"267m"` |
| `commute_nearest_mrt.duration` | `{ value, formatted_string }` | `"4 mins"` walk |
| `agent.name` | `string` | Agent name |
| `agent.phone` | `string` | `"+6586660118"` |
| `agent.whatsapp` | `string` | WhatsApp number |
| `photo_urls` | `string[]` | High-res photo URLs |

**Unique value:** MRT walk times, mortgage estimates, WhatsApp agent contact.

## Tool 2: search_propertyguru

### Input Schema

```ts
const ALLOWED_PG_HOSTS = new Set(['www.propertyguru.com.sg', 'propertyguru.com.sg'])

z.object({
  searchQueries: z.array(z.string()).optional()
    .describe('Freetext search queries, e.g. "marina bay 3 bedroom". Used when startUrls is empty.'),
  startUrls: z.array(
    z.string().url().refine(
      (url) => ALLOWED_PG_HOSTS.has(new URL(url).hostname),
      { message: 'Must be a PropertyGuru Singapore URL (propertyguru.com.sg)' }
    )
  ).optional()
    .describe('Direct PropertyGuru search result URLs. Overrides searchQueries if provided.'),
  listingType: z.enum(['sale', 'rent']).default('sale').optional(),
  propertyType: z.enum(['sg_all', 'sg_condo', 'sg_landed', 'sg_hdb']).default('sg_all').optional()
    .describe('Singapore property type filter.'),
  minPrice: z.number().int().optional(),
  maxPrice: z.number().int().optional(),
  maxItems: z.number().int().min(10).max(100).default(100).optional()
    .describe('Maximum listings to return. Default 100, provider minimum 10, max 100.'),
}).refine(
  (data) => (data.searchQueries?.length ?? 0) > 0 || (data.startUrls?.length ?? 0) > 0,
  { message: 'At least one of searchQueries or startUrls is required' }
)
```

**Note:** `country: "sg"` is hardcoded internally when calling the Apify actor — never exposed to the agent. The current PropertyGuru actor enforces a provider minimum of `10` for `maxItems`, so the wrapper mirrors that contract instead of silently coercing smaller values.

### Output Fields (per listing)

| Field | Type | Example |
|-------|------|---------|
| `id` | `string` | `"24240971"` |
| `title` | `string` | `"Marina Bay Residences"` |
| `url` | `string` | Full listing URL |
| `address` | `string` | `"18 Marina Boulevard"` |
| `price` | `number` | `5100000` |
| `currency` | `string` | `"SGD"` |
| `pricePerSqm` | `string` | `"43,220.34"` |
| `bedrooms` | `number` | `2` |
| `bathrooms` | `number` | `3` |
| `floorAreaSqm` | `number` | `118` |
| `propertyType` | `string` | `"Condominium"` |
| `developer` | `string` | Developer name |
| `postedOn` | `string` | `"19 Aug 2025"` |
| `agentName` | `string` | Agent name |
| `agentProfileUrl` | `string` | Agent profile URL |
| `images` | `string[]` | Image URLs |
| `thumbnail` | `string` | Thumbnail URL |

**Unique value:** Structured query builder (no URL construction needed), developer info, sqm-based pricing.

## Implementation Architecture

### File Structure

Tools live alongside `search-market-data.ts` in `market/`, but use a **separate factory** to avoid coupling to the property Supabase client:

```
src/lib/runner/tools/market/
  apify-client.ts           # shared Apify HTTP client
  search-99co.ts            # tool definition + Apify call
  search-propertyguru.ts    # tool definition + Apify call
  index.ts                  # barrel export (updated — separate createListingTools factory)
  __tests__/
    search-99co.test.ts
    search-propertyguru.test.ts
    apify-client.test.ts
```

### Shared Apify Client

`apify-client.ts` — thin but safe wrapper, no SDK dependency:

```ts
import { fetchWithTimeout, isAbortError } from '../web/fetch-with-timeout'

const APIFY_BASE = 'https://api.apify.com/v2'
const DEFAULT_TIMEOUT_MS = 90_000

/**
 * Runs an Apify actor synchronously and returns dataset items.
 * Uses the run-sync-get-dataset-items endpoint for single-request scraping.
 */
export async function runActorSync<T>(
  actorId: string,
  input: Record<string, unknown>,
  opts?: { timeoutMs?: number; maxTotalChargeUsd?: number }
): Promise<T[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN is not configured')

  const params = new URLSearchParams()
  if (opts?.maxTotalChargeUsd) params.set('maxTotalChargeUsd', String(opts.maxTotalChargeUsd))

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?${params}`

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      },
      opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = body?.error?.message ?? `HTTP ${res.status}`
      throw new Error(`Apify actor ${actorId}: ${msg}`)
    }

    return res.json()
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error('Scraping timed out — try fewer results or a narrower search')
    }
    throw err
  }
}
```

### Barrel and Factory Isolation

The existing `market/index.ts` eagerly creates the property Supabase client. Apify tools use a **separate factory** to avoid coupling:

```ts
// market/index.ts — updated

import { createPropertyPublicServerClient } from '@/lib/supabase/property-public-server'
import { createSearchMarketDataTool } from './search-market-data'
import { createSearch99coTool } from './search-99co'
import { createSearchPropertyguruTool } from './search-propertyguru'

/** Market data tools — requires property Supabase. */
export function createMarketTools() {
  const propertySupabase = createPropertyPublicServerClient()
  return { ...createSearchMarketDataTool(propertySupabase) }
}

/** Listing scraper tools — requires APIFY_TOKEN only. No Supabase dependency. */
export function createListingTools() {
  return {
    ...createSearch99coTool(),
    ...createSearchPropertyguruTool(),
  }
}
```

This ensures an APIFY-only deployment (no property Supabase) does not blow up on missing property-Supabase env vars.

### Env Gating

**Separate from market data gating** — independent flag and prompt path:

```ts
// In tool-registry.ts
export const isApifyConfigured = () => !!process.env.APIFY_TOKEN

// Registered separately from isPropertySupabaseConfigured() tools
if (isApifyConfigured()) {
  // chat-only — excluded from autopilot and subagents
  chatTools.push(...Object.values(createListingTools()))
}
```

```ts
// In context.ts — separate prompt injection path
if (isApifyConfigured()) {
  // inject property listing search guidance into <tool-usage>
}
```

### Tool Response Shape

Consistent envelope for both tools:

```ts
// Success
{ success: true, portal: '99co' | 'propertyguru', count: number, results: T[] }

// Failure
{ success: false, error: string }
```

99.co `listing_url` values are canonicalized to absolute URLs (`https://www.99.co${relative_path}`). All other fields preserve portal-native shapes.

### Tool Availability

**Chat only.** Excluded from autopilot and subagents to prevent uncontrolled paid scraping. Automated flows for these portals remain deferred until we explicitly reopen that scope. Opening to autopilot is a one-line registry change if needed later.

### System Prompt Guidance

Add to `<tool-usage>` in `system-prompt.ts` (conditional on `isApifyConfigured()`):

```
## Property Search Routing
- **search_99co** / **search_propertyguru**: Current listings and asking prices on public portals. Chat-only.
- **search_market_data**: Historical transactions, price trends, agent records (URA/HDB/CEA).
- **browse_website**: Login-gated internal portals (PropNex, inhouse systems).

When a client asks "what's available" → search listings.
When they ask "what did it sell for" → search market data.
When both are relevant, offer both. Prefer search_propertyguru for structured queries (beds, price range, property type). Prefer search_99co when MRT proximity or mortgage estimates matter.
```

## Tasks

| ID | Task |
|----|------|
| PR57-1 | `apify-client.ts` — shared Apify HTTP client (`runActorSync` with Bearer auth, `fetchWithTimeout` reuse, Apify error parsing, `maxTotalChargeUsd` guard) |
| PR57-2 | `market/__tests__/apify-client.test.ts` — unit tests (auth header, timeout via `fetchWithTimeout`, error payload parsing, `maxTotalChargeUsd` param, missing token) |
| PR57-3 | `search-99co.ts` — tool definition + Zod schema (explicit hostname allowlist `{'99.co', 'www.99.co'}` + path `/singapore/`). Canonicalize relative `listing_url` to absolute. |
| PR57-4 | `market/__tests__/search-99co.test.ts` — unit tests (mock Apify response, URL validation rejects `evil99.co` and non-SG paths, timeout handling, output envelope shape, URL canonicalization) |
| PR57-5 | `search-propertyguru.ts` — tool definition + Zod schema (hardcoded `country: "sg"`, explicit hostname allowlist for `startUrls`, `.refine()` requires `searchQueries` or `startUrls`) |
| PR57-6 | `market/__tests__/search-propertyguru.test.ts` — unit tests (mock Apify response, refine validation, `startUrls` hostname validation rejects non-PG URLs, country hardcoding, output envelope) |
| PR57-7 | `market/index.ts` — add `createListingTools()` factory (separate from `createMarketTools()`, no Supabase dependency). `tool-registry.ts` — separate `isApifyConfigured()` gate, chat-only registration. |
| PR57-8 | `context.ts` — separate property-listings prompt injection path (independent from market data flag) |
| PR57-9 | `system-prompt.ts` — property search routing `<tool-usage>` fragment |
| PR57-10 | `src/lib/ai/__tests__/system-prompt.test.ts` — fragment content tests (property search routing text present in prompt string). No env-conditional logic — that's PR57-11's job. |
| PR57-11 | `src/lib/runner/__tests__/context.test.ts` + `tool-registry.test.ts` — env-conditioned presence/absence of listing tools and prompt injection. Chat-only scope. Independence from market data flag. |
| PR57-12 | v2 plan update — ~~add PR 57 entry to Phase 3~~ (done) |

## Test Criteria

- In chat: "Search 99.co for 3-bed condos in District 10 under $2M" → agent calls `search_99co` with constructed URL → returns `{ success: true, portal: '99co', count: N, results: [...] }` with MRT walk times and agent contacts
- In chat: "Find landed properties for rent on PropertyGuru" → agent calls `search_propertyguru` with `listingType: 'rent'`, `propertyType: 'sg_landed'` → returns listings with developer info
- 99.co URL with hostname `evil99.co` → Zod validation rejects before Apify call
- 99.co URL with hostname `99.co` but path `/malaysia/` → Zod validation rejects
- PropertyGuru `startUrls` with hostname `fake-propertyguru.com` → Zod validation rejects
- PropertyGuru call with neither `searchQueries` nor `startUrls` → Zod refine rejects
- Both tools not registered when `APIFY_TOKEN` is missing
- Both tools not available in autopilot or subagent runs
- Market data tools still register independently when only `NEXT_PUBLIC_PROPERTY_SUPABASE_URL` is set (no `APIFY_TOKEN`)
- Listing tools register when only `APIFY_TOKEN` is set (no `NEXT_PUBLIC_PROPERTY_SUPABASE_URL`) — no crash from missing Supabase env
- Apify timeout → `{ success: false, error: 'Scraping timed out...' }`
- Apify 4xx/5xx → parsed error message from response body
- `system-prompt.test.ts`: property search routing fragment is present in prompt string
- `context.test.ts`: property listing guidance injected when `APIFY_TOKEN` set, absent when not
- `tool-registry.test.ts`: Apify tools registered in chat-only scope when `APIFY_TOKEN` set, absent when not

**Acceptance command (all PR57 suites):**
```sh
npx vitest run src/lib/runner/tools/market/__tests__/apify-client.test.ts src/lib/runner/tools/market/__tests__/search-99co.test.ts src/lib/runner/tools/market/__tests__/search-propertyguru.test.ts src/lib/ai/__tests__/system-prompt.test.ts src/lib/runner/__tests__/context.test.ts src/lib/runner/__tests__/tool-registry.test.ts
```

## Resolved Questions

1. **Rate limiting / cost guardrails** — Resolved by D1 (chat-only) + D4 (`maxTotalChargeUsd` param). Chat-only scope means a human is always in the loop. The cost cap provides a hard ceiling per individual scrape. Daily counters are YAGNI for now.
2. **99.co URL construction** — Resolved by D3. LLM constructs URLs, validated by explicit hostname allowlist + path check. No builder helper.
3. **Result caching** — YAGNI for v1. Cost is negligible at chat-only scale. Revisit if usage spikes.

## Research Context

Full scraper credibility research (ranked options, anti-bot analysis, cost models, government data complement) was conducted during the design phase.

Key findings:
- Neither portal has a public API. PropertyGuru uses Cloudflare Bot Management (~23M threats/month blocked).
- Apify actors handle anti-bot internally (proxy rotation, JS rendering).
- URA API + data.gov.sg cover historical data for free — don't scrape what the government gives you.
- Open-source scrapers (GitHub) are all 3-7 years stale and non-functional. Avoid.
- Both Apify actors ship MCP servers — evaluated but not used; Next.js API route facade preferred for consistency with existing tool patterns.
