---
title: "feat: OpenAgent Data Enrichment Pipeline"
type: feat
status: active
date: 2026-03-24
origin: docs/product/plans/agent-contact-enrichment-plan.md
---

# OpenAgent Data Enrichment Pipeline

## Overview

Scrape OpenAgent.sg to enrich our property database with two datasets:

1. **Agent contact info** (37K agents) — phone, WhatsApp, email, photo
2. **Property REALIS data** (20.5K properties) — unit-level transactions with profitability, ownership, buyer profiles

Both datasets are server-rendered and publicly accessible. Agent scraper is already built and tested. Property scraper needs to be built.

## Problem Statement

Our property database has basic public data (CEA registry, free URA API, HDB data.gov.sg). OpenAgent has enriched data from URA REALIS (paid) that we don't have — unit-level transactions, profitability analysis, ownership history, buyer profiles. We want all of it.

## Technical Discovery

### Agent pages (DONE)
- URL: `openagent.sg/agent/{regNo}` — plain HTML, regex extraction
- Fields: phone (`tel:`), WhatsApp (`wa.me/`), email (`mailto:`), photo (`img src`)
- Script: `scripts/property-pipeline/src/enrich_agents_openagent.py` — built and tested ✓

### Property pages (TO BUILD)
- URL: `openagent.sg/property/{slug}` — Next.js RSC streaming format
- Data is NOT in HTML tables — it's in `<script>` tags as `self.__next_f.push([...])` RSC payload
- Contains JSON with 22 fields per transaction + aggregate stats
- 20,522 property slugs available from sitemap

### Transaction record fields (22 fields per row)
```
id, sale_date, address, unit_number, owner_sequence, beds,
transacted_price_sgd, area_sqft, area_sqm, unit_price_psf, unit_price_psm,
nett_price_sgd, property_type, type_of_sale, type_of_area, tenure,
completion_date, number_of_units, postal_code, postal_district, postal_sector,
planning_region, planning_area, purchaser_address_indicator,
hold, profit, annualized_return
```

### Aggregate stats per property
- `initialTransactionTotal` — total transaction count
- `medianSalesByYear` — median prices by year
- `medianSalesByBedroom` — median prices by bedroom count

## Proposed Solution

### Schema

```sql
-- Migration 004: OpenAgent property enrichment tables

CREATE TABLE oa_property_transactions (
    id BIGSERIAL PRIMARY KEY,
    property_slug TEXT NOT NULL,           -- OpenAgent slug (e.g., "ferraria-park-condominium")
    sale_date DATE,
    address TEXT,
    unit_number TEXT,                      -- e.g., "#08-16" (REALIS unit-level data)
    owner_sequence INTEGER,                -- 1st, 2nd, 3rd owner
    beds INTEGER,
    transacted_price NUMERIC,
    area_sqft NUMERIC,
    area_sqm NUMERIC,
    price_psf NUMERIC,
    price_psm NUMERIC,
    nett_price NUMERIC,
    property_type TEXT,
    type_of_sale TEXT,                     -- New Sale, Resale, Sub Sale
    type_of_area TEXT,                     -- Strata, Land
    tenure TEXT,
    completion_date TEXT,
    num_units INTEGER,
    postal_code TEXT,
    postal_district TEXT,
    postal_sector TEXT,
    planning_region TEXT,
    planning_area TEXT,
    purchaser_address_indicator TEXT,       -- "Private", "HDB" — buyer origin
    hold_years NUMERIC,                    -- holding period in years
    profit NUMERIC,                        -- profit/loss in SGD
    annualized_return NUMERIC,             -- annualized % return
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oa_prop_txn_slug ON oa_property_transactions (property_slug);
CREATE INDEX idx_oa_prop_txn_date ON oa_property_transactions (sale_date);
CREATE INDEX idx_oa_prop_txn_district ON oa_property_transactions (postal_district);

-- Aggregate stats per property (one row per property)
CREATE TABLE oa_property_stats (
    property_slug TEXT PRIMARY KEY,
    project_name TEXT,                     -- display name from page
    total_transactions INTEGER,
    avg_psf NUMERIC,
    median_price NUMERIC,
    price_range_min NUMERIC,
    price_range_max NUMERIC,
    avg_holding_period NUMERIC,
    profitability_pct NUMERIC,             -- % of transactions that were profitable
    last_sale_date DATE,
    total_units INTEGER,
    district TEXT,
    tenure TEXT,
    completion_date TEXT,
    median_by_year JSONB,                  -- {"2024": 1200, "2025": 1350}
    median_by_bedroom JSONB,               -- {"1": 800000, "2": 1200000}
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: public read
ALTER TABLE oa_property_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_oa_prop_txn" ON oa_property_transactions
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE oa_property_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_oa_prop_stats" ON oa_property_stats
  FOR SELECT TO anon, authenticated USING (true);
```

### Scraper Design

```
scripts/property-pipeline/src/enrich_properties_openagent.py
```

**Parsing approach:** The RSC payload is in `<script>` tags as `self.__next_f.push([1,"..."])`. Extract all chunks, concatenate, and parse JSON to find the transactions array.

**Scraper flow:**
1. Fetch property slug list from sitemap (or from file)
2. For each slug: GET the page, extract RSC payload, parse transactions + stats
3. TRUNCATE + INSERT strategy per property (full refresh each run)
4. Batch insert transactions (500 per batch)
5. Upsert property stats (on `property_slug` conflict)

**Rate limiting:**
- 20.5K pages × 2s delay = ~11.4 hours
- Random 1-3s jitter, shuffled order
- Resume capability via `--resume` flag

### Pipeline Integration

Add to `run_pipeline.py`:
- `--enrich-agents` — run agent contact enrichment only
- `--enrich-properties` — run property REALIS enrichment only
- `--enrich-all` — run both enrichments

### Mapping to Existing Data

OpenAgent slugs (e.g., `ferraria-park-condominium`) need to map to our URA project names (e.g., `FERRARIA PARK CONDOMINIUM`). Strategy:

- Slugify our URA project names using the same `slugify()` logic
- Build a lookup table: `oa_property_stats.project_name` ↔ `ura_transactions.project`
- For the property profile pages, query both tables and merge

## Implementation Phases

### Phase 1: Agent Contact Enrichment (DONE)
- [x] Schema migration (`003_add_agent_contact_columns.sql`)
- [x] Scraper script (`enrich_agents_openagent.py`)
- [x] Unit tests (3 passing)
- [x] Live test (3/3 agents, phone + WhatsApp + photo confirmed)
- [x] Pipeline integration (`--enrich-only` flag)
- [ ] **Run migration on Supabase** (manual — paste SQL in editor)
- [ ] **Execute full scrape** (`./venv/bin/python -m src.enrich_agents_openagent`)

### Phase 2: Property REALIS Enrichment (TO BUILD)
- [ ] Schema migration (`004_add_openagent_property_tables.sql`)
- [ ] Sitemap slug fetcher — download all 20.5K slugs from `openagent.sg/sitemaps/properties.xml`
- [ ] RSC payload parser — extract transaction JSON from `self.__next_f.push()` script tags
- [ ] Property scraper script (`enrich_properties_openagent.py`)
- [ ] Unit tests for RSC extraction logic
- [ ] Live test (3-5 properties)
- [ ] Pipeline integration (`--enrich-properties` flag)
- [ ] **Run migration on Supabase**
- [ ] **Execute full scrape** (~11 hours overnight)

### Phase 3: Wire Up to UI (LATER)
- [ ] Update property profile pages to show REALIS-enriched data when available
- [ ] Add unit-level transaction table (specific unit numbers instead of floor ranges)
- [ ] Add profitability/ownership charts
- [ ] Add buyer profile (HDB vs Private) breakdown

## Acceptance Criteria

- [ ] Agent enrichment: ≥90% of active agents have phone + WhatsApp populated
- [ ] Property enrichment: all 20.5K OpenAgent properties have transaction data loaded
- [ ] Both scrapers are resumable (can restart mid-run without data loss)
- [ ] Both scrapers respect rate limits (1-3s random delay between requests)
- [ ] Pipeline runs log to `pipeline_runs` table with counts
- [ ] Data is queryable via existing Supabase anon key (RLS public read)

## Risks

| Risk | Mitigation |
|---|---|
| OpenAgent rate limits or blocks us | Polite delays (1-3s), shuffled order, realistic User-Agent. Their robots.txt allows all crawlers. |
| RSC payload format changes | Parse defensively, log extraction failures, unit tests for format |
| 20.5K properties × ~11 hours is long | Resume flag, run overnight, can split across multiple nights |
| OpenAgent goes down or restructures | Scraper is a snapshot enrichment — our core data (free URA/CEA/HDB) is independent |

## Sources

- **Origin:** [agent-contact-enrichment-plan.md](agent-contact-enrichment-plan.md)
- **OpenAgent sitemap:** `https://openagent.sg/sitemap.xml` (20.5K properties, 1K agents indexed)
- **OpenAgent robots.txt:** Allows ClaudeBot, anthropic-ai, all crawlers
- **Existing scraper pattern:** `scripts/property-pipeline/src/enrich_agents_openagent.py`
- **RSC payload format:** `self.__next_f.push([1,"..."])` in `<script>` tags — JSON with 22 transaction fields
