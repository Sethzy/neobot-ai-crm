# PR 57b — Replace Apify listing tools with Browser-Use Tasks

**Date:** 2026-03-30
**Status:** Design approved
**Depends on:** PR 57 (done), PR 50 (done)
**Parity test:** `docs/debug/listing-tools-parity-test.md`

---

## 1. Problem Statement

PR 57 shipped two property listing tools (`search_propertyguru`, `search_99co`) backed by Apify actors. Three problems:

1. **Cost:** Apify's 99.co actor costs $19.99/mo rental + per-result fees. Total ~$60/mo.
2. **Sunset risk:** The 99.co actor (`easyapi~99-co-property-listings-scraper`) sunsets October 2026.
3. **Vendor lock-in:** Two different actor APIs with different schemas.

**Replacement:** Rewire both tools to use Browser-Use Cloud Tasks (already configured via `browse-website.ts`). Both portals expose structured JSON — PropertyGuru via `__NEXT_DATA__`, 99.co via `/api/v10/web/search/listings` — so the Browser-Use agent extracts clean data with minimal steps.

**Cost after:** ~$0.03–0.05 per search, no monthly fees. ~$5–8/mo at real usage vs $60/mo today.

**Parity:** Confirmed via Playwright testing. All critical Apify fields recoverable + bonus fields not available via Apify. See `docs/debug/listing-tools-parity-test.md`.

---

## 2. Commit Strategy & Scope

**Two commits, one PR:**

| Commit | What | Why |
|--------|------|-----|
| 1 | Wire Browser-Use Task wrappers for both tools + shared helper + tests | New code, Apify untouched |
| 2 | Delete `apify-client.ts`, remove `APIFY_API_TOKEN` refs | Clean break, independently revertable |

**Scope boundary:**
- Same tool names (`search_propertyguru`, `search_99co`)
- Same input schemas (no new search capabilities)
- Upgraded output schemas (bonus fields from parity test)
- No system prompt changes — agent calls the same tools
- No UI changes

**Out of scope:**
- New search modes (district-based, MRT-based)
- Pagination across multiple pages (single page of results per call for v1)
- Browser-Use Skills (PR 50c remains deferred)
- Authenticated portal browsing (login-gated features)

---

## 3. Architecture

### Files changed/created

```
src/lib/browser-use/
  client.ts                    # existing — already exports getBrowserUseClient()
  task-runner.ts               # NEW — shared helper: create task, poll, enforce cost cap

src/lib/runner/tools/market/
  search-propertyguru.ts       # REWRITE — same interface, Browser-Use internals
  search-99co.ts               # REWRITE — same interface, Browser-Use internals
  apify-client.ts              # DELETE (commit 2)

src/lib/runner/tools/market/__tests__/
  search-propertyguru.test.ts  # NEW — unit tests with mocked Browser-Use
  search-99co.test.ts          # NEW — unit tests with mocked Browser-Use
```

### Data flow

```
Agent calls search_propertyguru(params)
  → Build PropertyGuru search URL from params
  → Build task prompt: "Navigate to URL, extract __NEXT_DATA__ listings JSON"
  → Build Zod output schema (flat listing fields)
  → task-runner.ts: client.run(prompt, { model: "bu-mini", maxCostUsd: 0.05 })
  → Browser-Use Cloud: navigate → Cloudflare resolves → evaluate JS → return structured output
  → Normalize response (prefix relative URLs, label units)
  → Return { success: true, portal: "propertyguru", count, results }
```

99.co identical except prompt says "fetch `/api/v10/web/search/listings`" instead of "extract `__NEXT_DATA__`".

---

## 4. Task Prompts & Browser-Use Config

### PropertyGuru task prompt template

```
Navigate to {searchUrl}.
Wait for the page to fully load (Cloudflare challenge may take a few seconds).
Extract the JSON from: window.__NEXT_DATA__.props.pageProps.pageData.data.listingsData
For each item, read the .listingData object.
Return all listings matching the output schema.
```

### 99.co task prompt template

```
Navigate to https://www.99.co/singapore/sale (or the provided URL).
Once the page loads, execute this JavaScript in the page context:
fetch('https://www.99.co/api/v10/web/search/listings?{queryParams}')
  .then(r => r.json())
Read data.sections[0].listings from the response.
Return all listings matching the output schema.
```

### Browser-Use Task config (both tools)

```typescript
{
  model: "bu-mini",
  maxCostUsd: 0.05,
  maxSteps: 20,
  keepAlive: false,
}
```

**Prompting strategy:** JSON extraction (approach A). The agent uses its built-in `evaluate` action to run JS on the page. This is LLM-mediated (not a deterministic API call), but structured output (Zod schema) guarantees the response shape regardless of how the agent extracts the data.

**Step budget:** ~5–7 steps expected (navigate + Cloudflare wait + evaluate + return). 20-step cap gives 3x headroom. At bu-mini pricing ($0.01 init + $0.002/step), $0.05 cap = 20 steps after init.

---

## 5. Output Schemas

### PropertyGuru listing

```typescript
z.object({
  id: z.number(),
  title: z.string(),               // localizedTitle
  url: z.string(),                 // absolute URL
  address: z.string(),             // fullAddress
  price: z.number(),               // SGD
  priceFormatted: z.string(),      // "S$ 2,580,000"
  psfFormatted: z.string(),        // "S$ 2,521 psf"
  bedrooms: z.number(),
  bathrooms: z.number(),
  floorAreaSqft: z.number(),
  propertyType: z.string(),        // "Apartment", "HDB", etc.
  tenure: z.string(),              // "99-year Leasehold"
  districtCode: z.string(),        // "D15"
  districtText: z.string(),        // "East Coast / Marine Parade"
  mrtProximity: z.string(),        // "5 min (410 m) from Siglap MRT"
  postedOn: z.string(),            // "30 Mar 2026"
  agentName: z.string(),
  agentLicense: z.string(),        // CEA number
  agencyName: z.string(),
  agentProfileUrl: z.string(),     // absolute URL (prefixed)
  thumbnail: z.string(),
  images: z.array(z.string()),
})
```

All fields optional except `id`, `url`, `price`.

### 99.co listing

```typescript
z.object({
  id: z.string(),
  title: z.string(),               // sub_category_formatted + " in " + project_name
  url: z.string(),                 // absolute URL (prefixed)
  address: z.string(),             // address_line_1 + ", " + address_line_2
  postalCode: z.string(),
  district: z.number(),
  price: z.number(),
  priceFormatted: z.string(),
  psf: z.number(),
  psfFormatted: z.string(),
  bedrooms: z.number(),
  bathrooms: z.number(),
  floorAreaSqft: z.number(),
  floorAreaSqm: z.number(),
  tenure: z.string(),              // "99 yrs"
  builtYear: z.number(),
  category: z.string(),            // "HDB 5 Rooms"
  postedAt: z.string(),            // "14 mins ago"
  highlights: z.string(),          // AI summary
  xvalue: z.number(),              // 99.co AI valuation
  mrtName: z.string(),
  mrtDistanceM: z.number(),
  mrtWalkingMins: z.number(),
  agentName: z.string(),
  agentPhone: z.string(),
  agentWhatsapp: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }),
  photos: z.array(z.string()),
})
```

All fields optional except `id`, `url`, `price`.

---

## 6. Error Handling

No retries, fail fast.

| Scenario | Behaviour | Return |
|----------|-----------|--------|
| `BROWSER_USE_API_KEY` not set | Fail immediately | `{ success: false, error: "BROWSER_USE_API_KEY is not configured" }` |
| Cloudflare blocks / timeout | Task fails after cost cap hit | `{ success: false, error: "Browser task failed: {reason}" }` |
| Cost cap exceeded ($0.05) | Browser-Use auto-stops the task | `{ success: false, error: "Search cost cap exceeded" }` |
| Structured output parse fails | Zod parse error | `{ success: false, error: "Failed to parse listing data" }` |
| Zero listings returned | Not an error | `{ success: true, count: 0, results: [] }` |

Cost observability: both tools return `cost.total` in the response (same as `browse_website` today).

---

## 7. Testing Strategy

### Unit tests (mocked Browser-Use)

- PropertyGuru: mock `client.run()` → return fixture matching `__NEXT_DATA__` structure → assert output schema fields normalized correctly (relative URLs prefixed, bonus fields mapped)
- 99.co: mock `client.run()` → return fixture matching v10 API structure → assert same
- Error cases: mock timeout, cost cap exceeded, empty results, malformed response
- Zod parse: feed partial data (missing optional fields) → assert graceful handling

### No integration tests in CI

Browser-Use Cloud calls cost real money and hit real sites. Integration validation is manual:
- One live call per portal during dev to confirm end-to-end
- Results compared against parity test doc

### Test fixtures

Snapshot the real `__NEXT_DATA__` listing object and 99.co API response captured during the parity test. Use as test fixtures.

---

## 8. API Endpoint Reference

### PropertyGuru

```
Page URL: https://www.propertyguru.com.sg/property-for-sale
Data:     window.__NEXT_DATA__.props.pageProps.pageData.data.listingsData[n].listingData
Listings per page: 20

Filter params (URL query):
  ?freetext={query}
  &listing_type=sale|rent
  &property_type=N|H|A|T  (all / HDB / condo / landed)
  &minprice=&maxprice=
  &bedr=3
  &page=2
```

### 99.co

```
Listings: GET https://www.99.co/api/v10/web/search/listings
Count:    GET https://www.99.co/api/v10/web/search/filtered-listings-count

Params:
  listing_type=sale|rent
  main_category=all|hdb|condo|landed
  name={location}
  page_num=1
  page_size=36
  property_segments=residential
  query_name={location}
  show_nearby=true
  show_description=true
```

---

## 9. Unresolved Questions

1. **Browser-Use structured output + Zod in TypeScript SDK v3** — Need to confirm the exact `client.run()` parameter name for passing a Zod schema. The Python SDK uses `output_schema`; the TS SDK may differ. Check docs or source during implementation.
2. **Proxy country** — Default is US residential. PropertyGuru/99.co are Singapore sites. May want to test with `proxyCountryCode: "sg"` if US proxy gets blocked. This is a session-level setting, not task-level.
3. **Rate limiting** — If a user runs 20 searches in a row, Browser-Use may rate-limit. No evidence of this yet, but worth monitoring. No preemptive handling needed.
