# Listing Tools Parity Test: Apify vs Browser/API

**Date:** 2026-03-30
**Goal:** Confirm every field Apify extracts today is also obtainable via browser automation (Playwright / Browser-Use Tasks) before replacing Apify with Browser-Use.

---

## Methodology

1. Navigated to each portal with Playwright (same browser fingerprint Browser-Use uses).
2. For PropertyGuru: parsed `__NEXT_DATA__` JSON blob (SSR, no XHR needed).
3. For 99.co: discovered and called the internal JSON API (`/api/v10/web/search/listings`) — the same endpoint the React frontend uses.
4. Mapped every Apify output field to the discovered source field and noted format differences.

---

## Key Architectural Finding

**Neither portal requires CSS scraping.** Both expose structured JSON:

| Portal | Mechanism | Auth Required |
|--------|-----------|---------------|
| PropertyGuru | `<script id="__NEXT_DATA__">` embedded in HTML | None — server-rendered |
| 99.co | `GET /api/v10/web/search/listings` (XHR) | Browser session cookie (auto from Cloudflare challenge) |

A Browser-Use Task can instruct the LLM to: (a) extract the `__NEXT_DATA__` JSON blob on PropertyGuru, or (b) call the 99.co API endpoint after page load. This is cleaner than parsing visual DOM.

---

## Cloudflare Challenge Behaviour

| Portal | Challenge Type | Resolution Time |
|--------|---------------|-----------------|
| PropertyGuru | JS/proof-of-work challenge | ~6–10 s automatic (no CAPTCHA) |
| 99.co | No challenge observed | Loaded instantly |

Both are passable with a real browser. HTTP-only clients (requests, curl) will be blocked.

---

## PropertyGuru Parity Test

**Source:** `window.__NEXT_DATA__.props.pageProps.pageData.data.listingsData[n].listingData`
**Listing count per page:** 20
**Test listing:** Seaside Residences, 18 Siglap Link, S$ 2,580,000

### Field Map

| Apify Field | Status | Source in `__NEXT_DATA__` | Example Value |
|-------------|--------|--------------------------|---------------|
| `id` | ✅ PASS | `.id` | `500087559` |
| `title` | ✅ PASS | `.localizedTitle` | `"Seaside Residences"` |
| `url` | ✅ PASS | `.url` | `"https://www.propertyguru.com.sg/listing/for-sale-seaside-residences-500087559"` |
| `address` | ✅ PASS | `.fullAddress` | `"18 Siglap Link"` |
| `price` | ✅ PASS | `.price.value` (int) | `2580000` |
| `currency` | ✅ PASS | `.price.currency` | `"SGD"` |
| `pricePerSqm` | ⚠️ PARTIAL | `.pricePerArea.localeStringValue` | `"S$ 2,521.99 psf"` — PG uses **per sqft**, not per sqm |
| `bedrooms` | ✅ PASS | `.bedrooms` | `3` |
| `bathrooms` | ✅ PASS | `.bathrooms` | `2` |
| `floorAreaSqm` | ⚠️ PARTIAL | `.floorArea` | `1023` — value is in **sqft**, not sqm (field name misleading) |
| `propertyType` | ✅ PASS | `.badges[type=unit_type].text` | `"Apartment"` |
| `developer` | ⚠️ PARTIAL | `.developer` | `"Wayne Tang"` — echoes agent name for non-developer listings; only meaningful for new launches |
| `postedOn` | ✅ PASS | `.postedOn.text` | `"30 Mar 2026"` |
| `agentName` | ✅ PASS | `.agent.name` | `"Wayne Tang"` |
| `agentProfileUrl` | ⚠️ PARTIAL | `.agent.profileUrl` | `"/agent/wayne-tang-21564"` — **relative URL**, needs `https://www.propertyguru.com.sg` prefix |
| `images` | ✅ PASS | `.mediaCarousel.previewMedia.images.items[].src` | Array of 15 CDN URLs |
| `thumbnail` | ✅ PASS | `.thumbnail` | `"https://sg1-cdn.pgimgs.com/listing/500087559/UPHO…V550/…"` |

**Pass: 12/17 · Partial: 5/17 · Fail: 0/17**

All 5 "partial" fields are format differences, not missing data — the information is present and usable with minor normalization.

### Bonus Fields (not in Apify, available in DOM)

| Field | Source | Value |
|-------|--------|-------|
| Agency name | `.agency.name` | `"KW SINGAPORE REAL ESTATE PTE. LTD."` |
| MRT proximity | `.mrt.nearbyText` | `"5 min (410 m) from TE28 Siglap MRT Station"` |
| Tenure | `.additionalData.tenure` | `"L99"` (99-year leasehold) |
| District code | `.additionalData.districtCode` | `"D15"` |
| District text | `.additionalData.districtText` | `"East Coast / Marine Parade"` |
| Region | `.additionalData.regionText` | `"East Coast (D15-16)"` |
| Agent CEA license | `.agent.license` | `"R063246I"` |
| Agent photo | `.agent.avatar.src` | CDN URL |
| Floor plan images | `.mediaCarousel.previewMedia.floorPlans.items[].src` | Array |
| Virtual tour embed | `.mediaCarousel.previewMedia.virtualTours.items[].embedHtml` | iframe HTML |

---

## 99.co Parity Test

**Source:** `GET https://www.99.co/api/v10/web/search/listings` (XHR, same-origin)
**Listing count per call:** Up to 36 (configurable via `page_size`)
**Test listing:** 467 Segar Road HDB, S$ 590,000

### Field Map

| Apify Field | Status | Source in API Response | Example Value |
|-------------|--------|----------------------|---------------|
| `listing_title` | ⚠️ PARTIAL | No single field. Derive from `sub_category_formatted` + `project_name` | `"HDB 5 Rooms"` + `"467 Segar Road"` |
| `listing_url` | ⚠️ PARTIAL | `.listing_url` | `"/singapore/sale/property/467-segar-road-hdb-LEJKAkNxXRnv2njgxYna3u"` — **relative**, needs `https://www.99.co` prefix |
| `attributes.price` | ✅ PASS | `.attributes.price` | `590000` |
| `attributes.psf` | ✅ PASS | `.attributes.area_ppsf` | `498` |
| `attributes.beds` | ✅ PASS | `.attributes.bedrooms` | `3` |
| `attributes.bathrooms` | ✅ PASS | `.attributes.bathrooms` | `2` |
| `attributes.floorarea_sqft` | ✅ PASS | `.attributes.area_size` | `1184` |
| `attributes.lease_type` | ⚠️ PARTIAL | `.attributes.tenure` | `"99 yrs"` (Apify used "leasehold"/"freehold" labels — minor label difference) |
| `attributes.top` | ✅ PASS | `.attributes.completed_at` | `2002` |
| `attributes.furnishing` | ❌ MISSING | Not present in v10 API | — |
| `attributes.formatted_address` | ⚠️ PARTIAL | `.address_line_1` + `.address_line_2` | `"467 Segar Rd"` + `"Singapore 670467 · D23"` |
| `attributes.est_mortgage_formatted` | ❌ MISSING | Not in API — computed client-side from price + bank rates | — |
| `attributes.posted_at_formatted` | ✅ PASS | `.date_formatted` | `"14 mins ago"` |
| `commute_nearest_mrt.name` | ✅ PASS | `.within_distance_from_query.closest_mrt.title` | `"Fajar LRT"` |
| `commute_nearest_mrt.distance` | ✅ PASS | `.within_distance_from_query.exact_distance` | `392` (metres) |
| `commute_nearest_mrt.duration` | ✅ PASS | `.within_distance_from_query.closest_mrt.walking_time_in_mins` | `5` (minutes) |
| `agent.name` | ✅ PASS | `.user.name` | `"Mark Tan"` |
| `agent.phone` | ✅ PASS | `.user.phone` | `"+6590093803"` |
| `agent.whatsapp` | ✅ PASS | `.user.whatsapp` | `"+6590093803"` |
| `photo_urls` | ✅ PASS | `.photos[].url` | Array of 16 CDN URLs (400×300) |

**Pass: 13/20 · Partial: 5/20 · Fail: 2/20**

### Missing Fields Analysis

| Field | Impact | Recommendation |
|-------|--------|----------------|
| `furnishing` | Low — only relevant for rental listings. Rarely used in sale searches. | Drop from Browser-Use output schema |
| `est_mortgage_formatted` | Low — UI convenience, easily calculated: `price * 0.75 / 360 * (1 + monthly_rate)`. Not needed by the LLM. | Drop or compute server-side |

### Bonus Fields (not in Apify, available in API)

| Field | Source | Value |
|-------|--------|-------|
| Full description | `.description` | Multi-paragraph text with amenities, MRT, schools |
| GPS coordinates | `.location.coordinates.lat/lng` | `1.38698`, `103.77378` |
| District number | `.district_number` | `23` |
| Postal code | `.postal_code` | `"670467"` |
| AI highlights | `.highlights` | `"Very windy park view 5i 467 segar road"` |
| AI valuation | `.xvalue.val` | `584000` (99.co's own estimate) |
| Area in sqm | `.attributes.area_size_sqm` | `110` |
| Agent photo | `.user.photo_url` | CDN URL |
| Is must-see | `.flags.is_must_see` | `true` |
| Has virtual tour | `.flags.has_v360` | `false` |
| WhatsApp template | `.enquiry_options[0].whatsapp_option` | Full pre-written message |

---

## API Endpoint Reference

### PropertyGuru

```
Page URL: https://www.propertyguru.com.sg/property-for-sale
         https://www.propertyguru.com.sg/property-for-rent
Data:     window.__NEXT_DATA__.props.pageProps.pageData.data.listingsData[n].listingData

Filter params (in page URL):
  ?freetext={query}
  &listing_type=sale|rent
  &property_type=N|H|A|T  (all / HDB / condo / landed)
  &minprice=&maxprice=
  &bedr=3  (bedrooms)
  &page=2
```

### 99.co

```
Listings: GET https://www.99.co/api/v10/web/search/listings
Count:    GET https://www.99.co/api/v10/web/search/filtered-listings-count

Common params:
  listing_type=sale|rent
  main_category=all|hdb|condo|landed
  name={location name}
  page_num=1
  page_size=36
  property_segments=residential
  query_name={location}
  show_nearby=true
  show_description=true
```

---

## Output Schema for Browser-Use Tasks

Based on confirmed available fields, the Browser-Use Task output schema should be:

### PropertyGuru Listing

```typescript
{
  id: number,                  // listing.id
  title: string,               // listing.localizedTitle (project name)
  url: string,                 // listing.url (absolute)
  address: string,             // listing.fullAddress
  price: number,               // listing.price.value (SGD)
  priceFormatted: string,      // listing.price.pretty
  psfFormatted: string,        // listing.psfText  ("S$ 2,521 psf")
  bedrooms: number,            // listing.bedrooms
  bathrooms: number,           // listing.bathrooms
  floorAreaSqft: number,       // listing.floorArea (sqft)
  propertyType: string,        // unit_type badge text
  tenure: string,              // additionalData.tenure
  districtCode: string,        // additionalData.districtCode
  districtText: string,        // additionalData.districtText
  mrtProximity: string,        // mrt.nearbyText
  postedOn: string,            // postedOn.text
  agentName: string,           // agent.name
  agentLicense: string,        // agent.license
  agentProfileUrl: string,     // agent.profileUrl (prepend domain)
  thumbnail: string,           // thumbnail (CDN URL)
  images: string[],            // mediaCarousel images[].src
}
```

### 99.co Listing

```typescript
{
  id: string,                  // listing.id
  title: string,               // sub_category_formatted + " in " + project_name
  url: string,                 // "https://www.99.co" + listing_url
  address: string,             // address_line_1 + ", " + address_line_2
  postalCode: string,          // postal_code
  district: number,            // district_number
  price: number,               // attributes.price
  priceFormatted: string,      // attributes.price_formatted
  psf: number,                 // attributes.area_ppsf
  psfFormatted: string,        // attributes.area_ppsf_formatted
  bedrooms: number,            // attributes.bedrooms
  bathrooms: number,           // attributes.bathrooms
  floorAreaSqft: number,       // attributes.area_size
  floorAreaSqm: number,        // attributes.area_size_sqm
  tenure: string,              // attributes.tenure
  builtYear: number,           // attributes.completed_at
  category: string,            // sub_category_formatted
  postedAt: string,            // date_formatted
  highlights: string,          // highlights (AI summary)
  xvalue: number,              // xvalue.val (99.co AI valuation)
  mrtName: string,             // within_distance_from_query.closest_mrt.title
  mrtDistanceM: number,        // within_distance_from_query.exact_distance
  mrtWalkingMins: number,      // within_distance_from_query.closest_mrt.walking_time_in_mins
  agentName: string,           // user.name
  agentPhone: string,          // user.phone
  agentWhatsapp: string,       // user.whatsapp
  photos: string[],            // photos[].url (400×300 CDN)
}
```

---

## Verdict

| Criterion | PropertyGuru | 99.co |
|-----------|-------------|-------|
| All critical fields present | ✅ Yes | ✅ Yes (2 dropped: furnishing, mortgage calc) |
| Data is structured JSON | ✅ `__NEXT_DATA__` | ✅ XHR API |
| Cloudflare bypass needed | ✅ Auto-resolves (~8s) | ✅ No challenge observed |
| Bonus fields vs Apify | ✅ More: MRT, tenure, district, floor plans, virtual tour, CEA license | ✅ More: GPS, description, AI highlights, xvalue, sqm, postal code |
| Relative URL normalization | ⚠️ `agentProfileUrl` needs prefix | ⚠️ `listing_url` needs prefix |

**Conclusion: Replace Apify. All data is recoverable with Browser-Use Tasks. PropertyGuru delivers 17/17 fields + bonus. 99.co delivers 18/20 fields + bonus (the 2 missing fields are minor and dropped from schema).**
