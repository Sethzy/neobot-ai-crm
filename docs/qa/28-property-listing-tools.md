# QA Surface 28: Property Listing Tools

> **PRs covered:** 55 (search_market_data), 57 (search_99co + search_propertyguru), 58 (OpenAgent REALIS enrichment)
> **Dogfoodable:** Partial (via chat UI)
> **Time estimate:** 30-40 min manual
> **v2 tools:** `search_99co`, `search_propertyguru`, `search_market_data`, `web_scrape`

---

## Prerequisites

- Logged in with a working chat
- `APIFY_TOKEN` set in env so listing tools register
- Apify account has enough credit/quota for a few live runs
- Tool call pills visible in chat
- Property market data Supabase configured (`PROPERTY_SUPABASE_URL` + `PROPERTY_SUPABASE_ANON_KEY`) so `search_market_data` is available

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

### PR 55: Property market data tool (`search_market_data`)

### 28.6 HDB resale search (PR 55)

1. In a new thread: **"Show me recent HDB resale transactions in Tampines for 4-room flats."**
2. **Expected tool calls:** `search_market_data`
3. **Expected:** Tool args include `dataset: "hdb"`, `town: "TAMPINES"`, `flat_type: "4 ROOM"` (or similar)
4. **Expected:** Agent returns a list of individual transaction records with prices and dates
5. **Verify:** Tool pill shows `mode: "search"` (default)

**Notes / failures:**

---

### 28.7 URA transaction stats (PR 55)

1. In a new thread: **"What's the median PSF for District 9 condos sold in the last 6 months?"**
2. **Expected tool calls:** `search_market_data`
3. **Expected:** Tool args include `dataset: "ura"`, `district: "09"`, `mode: "stats"`, date range filters
4. **Expected:** Agent returns aggregate statistics (median, min, max, count) not individual records
5. **Verify:** Tool pill shows `mode: "stats"` and response includes `median_price_psf`

**Notes / failures:**

---

### 28.8 CEA agent registry lookup (PR 55)

1. In a new thread: **"Look up the CEA agent with registration number R012345A."**
2. **Expected tool calls:** `search_market_data`
3. **Expected:** Tool args include `dataset: "agents"`, `agent_reg_no: "R012345A"`
4. **Expected:** Agent returns agent details (name, agency, registration info) or "not found"

**Notes / failures:**

---

### 28.9 CEA transaction history (PR 55)

1. In a new thread: **"Show me recent property transactions in District 15 this year."**
2. **Expected tool calls:** `search_market_data`
3. **Expected:** Tool args include `dataset: "transactions"`, `district: "15"`, `date_from` set to start of year
4. **Expected:** Agent returns transaction records with prices, addresses, dates

**Notes / failures:**

---

### 28.10 Market data env gating (PR 55)

1. (Requires property Supabase env vars to be unset — verify via code or staging)
2. **Expected:** `search_market_data` tool is not registered when env is missing
3. **Expected:** Agent responds conversationally that market data isn't available

**Notes / failures:**

---

### PR 58: OpenAgent REALIS enrichment (search_market_data → web_scrape chain)

### 28.11 REALIS property lookup — known project name

1. In a new thread: **"Tell me about the profitability of Normanton Park condo."**
2. **Expected tool calls:** `search_market_data` (URA dataset, project partial match), then `web_scrape` on `https://openagent.sg/property/normanton-park`
3. **Expected:** Agent resolves project name via search_market_data first, then scrapes OpenAgent for enriched data.
4. **Expected:** Response includes REALIS-only fields: profitability % (e.g., "97% profitable"), unit numbers (#XX-XX), owner sequence (1st/2nd/3rd), buyer profile (HDB/Private).
5. **Verify:** Two tool pills — search_market_data then web_scrape. web_scrape URL contains `openagent.sg/property/`.

**Notes / failures:**

---

### 28.12 REALIS property lookup — fuzzy/misspelled name

1. In a new thread: **"What's the average holding period for D'Leedon?"**
2. **Expected tool calls:** `search_market_data` (URA dataset, project: "D'LEEDON" or similar), then `web_scrape` on `https://openagent.sg/property/d-leedon`
3. **Expected:** Agent correctly slugifies apostrophe (D'LEEDON → d-leedon).
4. **Expected:** Response includes holding period data from OpenAgent.
5. **Verify:** web_scrape URL is `openagent.sg/property/d-leedon` (not `dleedon`).

**Notes / failures:**

---

### 28.13 REALIS data feeds into analysis

1. In a new thread: **"Compare buyer profiles for Treasure at Tampines vs Caribbean at Keppel Bay — what % are HDB upgraders?"**
2. **Expected tool calls:** Two `search_market_data` calls (or one per project), then two `web_scrape` calls on OpenAgent.
3. **Expected:** Agent extracts purchaser profile data (HDB % vs Private %) from both OpenAgent pages and compares them.
4. **Expected:** Response presents a clear comparison, not just raw dumps.

**Notes / failures:**

---

### 28.14 HDB query does NOT route to OpenAgent

1. In a new thread: **"What's the profitability of HDB flats in Tampines?"**
2. **Expected tool calls:** `search_market_data` (HDB dataset) only.
3. **Expected:** Agent does NOT call web_scrape on OpenAgent (OpenAgent has no HDB data).
4. **Expected:** Agent responds with HDB resale stats from our data, possibly noting that profitability analysis isn't available for HDB.

**Notes / failures:**

---

### 28.15 OpenAgent slug 404 graceful fallback

1. In a new thread: **"Tell me about a condo called Sunshine Happy Gardens."** (fictitious project)
2. **Expected tool calls:** `search_market_data` (URA dataset) returns no results or agent tries web_scrape which returns no content.
3. **Expected:** Agent handles the miss gracefully — does not hallucinate data, explains the project wasn't found.

**Notes / failures:**

---

## Edge Cases

- [ ] Listing tools are absent when `APIFY_TOKEN` is missing
- [ ] `search_market_data` is absent when property Supabase env is missing
- [ ] Timeout failures surface as a user-visible scraping timeout message
- [ ] Listing tools stay unavailable in autopilot and subagent runs
- [ ] HDB stats with very broad query (no filters) — caps at 10,000 rows, totalMatching is exact
- [ ] search_market_data with invalid dataset — agent handles validation error
- [ ] search_market_data date range with no results — returns empty array, not error
- [ ] web_scrape on non-existent OpenAgent slug — agent handles gracefully, no hallucination
- [ ] Agent does not route HDB queries to OpenAgent
- [ ] Agent correctly slugifies special characters (apostrophes, @, ampersands)

---

## Pass / Fail Criteria

- **Pass:** Chat routes live portal requests to the correct listing tool, rejects invalid portal URLs early, preserves the success/error envelope, combines listing data with market data correctly when both are requested, `search_market_data` correctly routes across all 4 datasets (agents, transactions, hdb, ura) in both search and stats modes, and agent chains search_market_data → web_scrape on OpenAgent for REALIS-enriched property queries.
- **Fail:** Agent falls back to `browse_website` for normal listing searches, uses the wrong tool family, accepts invalid portal hosts, returns malformed/non-live listing results, `search_market_data` returns wrong dataset or mode, agent routes HDB queries to OpenAgent, or agent fails to slugify project names correctly for OpenAgent URLs.
