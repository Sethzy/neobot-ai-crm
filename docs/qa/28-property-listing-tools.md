# QA Surface 28: Property Listing Tools

> **PRs covered:** 57 (search_99co + search_propertyguru)
> **Dogfoodable:** Partial (via chat UI)
> **Time estimate:** 15-20 min manual
> **v2 tools:** `search_99co`, `search_propertyguru`, `search_market_data` (combined-routing checks only)

---

## Prerequisites

- Logged in with a working chat
- `APIFY_TOKEN` set in env so listing tools register
- Apify account has enough credit/quota for a few live runs
- Tool call pills visible in chat
- Optional for combined-routing checks: property market data env configured so `search_market_data` is also available

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat loads and responds to live property-search prompts
- [ ] Agent routes live listing requests to `search_99co` or `search_propertyguru`, not `browse_website`
- [ ] Tool call pills expand to show a `{ success, portal, count, results }` envelope
- [ ] 99.co result links are absolute `https://www.99.co/...` URLs
- [ ] No console errors during listing-tool execution

---

## Manual QA Scenarios

### PR 57: Property portal listing tools

### 28.1 99.co live listing search

1. In a new thread, type: **"Search 99.co for 3-bedroom condos in District 10 under $2M."**
2. **Expected tool calls:** `search_99co`
3. **Expected:** Agent returns current listing results, not historical transaction stats.
4. **Expected:** Tool output reports `portal: "99co"` and listing URLs are absolute `https://www.99.co/...` links.
5. **Verify:** Tool pill args contain one or more 99.co Singapore search URLs and the result envelope has `success: true`.

**Notes / failures:**

---

### 28.2 PropertyGuru structured query routing

1. In a new thread, type: **"Find landed properties for rent on PropertyGuru under S$20k/month."**
2. **Expected tool calls:** `search_propertyguru`
3. **Expected:** Tool args use structured fields such as `listingType: "rent"` and `propertyType: "sg_landed"` rather than a browsing fallback.
4. **Expected:** Agent returns live listings with `portal: "propertyguru"` and a non-empty `results` array when inventory exists.
5. **Verify:** Tool pill shows a successful structured query, not `browse_website`.

**Notes / failures:**

---

### 28.3 Combined live listings + market-data routing

1. In a new thread, type: **"What's available in District 10 under $2M, and what did similar condos recently sell for?"**
2. **Expected tool calls:** `search_propertyguru` or `search_99co`, plus `search_market_data`
3. **Expected:** Agent distinguishes current listings from historical market data and clearly labels both.
4. **Expected:** Agent does not answer the full question from only one source.
5. **Verify:** Tool pills show both listing-search and market-data calls in the same run when both tool families are configured.

**Notes / failures:**

---

### 28.4 Reject invalid pasted portal URLs before execution

1. In a new thread, type: **"Search this URL for me: https://evil99.co/singapore/condo-sale"**
2. **Expected:** Agent refuses or corrects the request instead of calling `search_99co`.
3. **Expected:** Response explains that the URL is not a valid 99.co Singapore search URL.
4. **Verify:** No listing-tool pill appears.

**Notes / failures:**

---

### 28.5 PropertyGuru start URL mode

1. In a new thread, paste a valid PropertyGuru Singapore results URL and ask: **"Use this PropertyGuru URL and summarize the best matches for me."**
2. **Expected tool calls:** `search_propertyguru`
3. **Expected:** Tool args use `startUrls` and do not depend on the query-builder-only fields.
4. **Expected:** Agent summarizes the returned listings and preserves portal-native fields rather than flattening them into a made-up schema.
5. **Verify:** Tool pill args contain `startUrls` and the result envelope has `success: true`.

**Notes / failures:**

---

## Edge Cases

- [ ] Listing tools are absent when `APIFY_TOKEN` is missing
- [ ] Timeout failures surface as a user-visible scraping timeout message
- [ ] Listing tools stay unavailable in autopilot and subagent runs

---

## Pass / Fail Criteria

- **Pass:** Chat routes live portal requests to the correct listing tool, rejects invalid portal URLs early, preserves the success/error envelope, and combines listing data with market data correctly when both are requested.
- **Fail:** Agent falls back to `browse_website` for normal listing searches, uses the wrong tool family, accepts invalid portal hosts, or returns malformed/non-live listing results.
