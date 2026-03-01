# Real Estate Directory — What's Done

> Last updated: 2026-03-01

The real estate directory is a free, public market data hub at `/market/*`. It serves as a lead-magnet for agent signups — all data is SEO-indexed and publicly accessible.

---

## Routes (11 pages)

All pages are SSR (server components querying Supabase directly — no client-side API layer).

| Route | Purpose |
|-------|---------|
| `/market` | Hub landing with 5 category cards |
| `/market/agents` | Searchable table of 42,000+ CEA agents |
| `/market/agents/[regNo]` | Agent profile: stats, charts, transactions, movement history |
| `/market/properties` | Searchable URA private projects (3,000+) |
| `/market/properties/[slug]` | Property profile: price trends, floor premium, type breakdown |
| `/market/hdb` | Searchable HDB streets (900+) across 26 towns |
| `/market/hdb/[town]/[slug]` | HDB street profile: resale trends, flat types, floor premium |
| `/market/agencies` | Searchable agencies (1,500+) |
| `/market/agencies/[slug]` | Agency profile: top agents, volume |
| `/market/areas` | Towns & districts by transaction volume |
| `/market/areas/[slug]` | Area profile: aggregate transaction data |

Old routes (`/agents`, `/properties`, `/hdb`, `/agencies`, `/areas`) have permanent 301 redirects configured in `next.config.ts`.

---

## Components

### Layout & Navigation (`src/components/property/`)

| File | Purpose |
|------|---------|
| `market-sub-nav.tsx` | Sticky horizontal nav for all `/market/*` pages |
| `market-category-card.tsx` | Clickable tile for hub landing |
| `market-cta.tsx` | Soft upsell banner on profile pages |
| `stat-bar.tsx` | Horizontal metrics bar for profile headers |
| `stat-card.tsx` | Individual stat tile for listing pages |
| `movement-history.tsx` | Agent registration timeline & agency changes |
| `data-table.tsx` | Shared table wrapper with scroll + empty state |
| `paginated-table.tsx` | Client-side paginated table |
| `config-notice.tsx` | Fallback when property DB is not configured |

### Charts (`src/components/property/charts/`)

| File | Purpose |
|------|---------|
| `price-trend-chart.tsx` | Line chart: monthly min/median/max price bands (recharts) |
| `transaction-volume-chart.tsx` | Bar chart: volume by year/quarter/month (recharts) |
| `type-breakdown-chart.tsx` | Donut chart: categorical breakdown (recharts) |
| `activity-heatmap.tsx` | GitHub-style month x year heatmap |
| `floor-premium-chart.tsx` | Scatter: floor level vs PSF (recharts) |
| `top-neighbourhoods.tsx` | Choropleth map + ranked list with HDB/Private toggle |
| `sg-region-map.tsx` | 55-polygon SVG planning area map with hover tooltips |
| `sg-planning-area-paths.ts` | Auto-generated SVG path data (55 planning areas) |

---

## Data Utilities (`src/lib/property/`)

| File | Key exports |
|------|-------------|
| `utils.ts` | `slugify`, `formatCurrencySgd`, `formatPriceRange`, `parseFloorMidpoint`, `formatAreaName`, `median`, 20+ helpers |
| `agent-breakdowns.ts` | `computeTransactionTypeBreakdown`, `computeSalesRepBreakdown`, `computeRentalRepBreakdown` |
| `sg-regions.ts` | `getRegionForTown`, `TOWN_TO_PLANNING_AREA`, `DISTRICT_TO_PLANNING_AREAS`, `DISTRICT_LABELS` |
| `chart-colors.ts` | `CHART_COLORS` (5-blue scale), `CHART_PRIMARY`, `CHART_PRIMARY_LIGHT` |

---

## Data Pipeline (`scripts/property-pipeline/`)

Python-based ingestion pipeline. Manual CLI execution — no automated cron yet.

### Scripts

| Script | Data Source | Strategy |
|--------|------------|----------|
| `run_pipeline.py` | Orchestrator | CLI flags: `--agents-only`, `--cea-txn-only`, `--hdb-only`, `--ura-only`, `--movements-only` |
| `src/ingest_agents.py` | CEA agent CSV (`data/cea/CEASalespersonInformation.csv`) | Upsert by `registration_no` |
| `src/ingest_cea_transactions.py` | CEA transaction CSV | Truncate + insert |
| `src/ingest_hdb_resale.py` | HDB resale CSVs (`data/hdb/*.csv`) | Truncate + insert |
| `src/ingest_ura_transactions.py` | URA eService API (OAuth) | Truncate + insert |
| `src/detect_movements.py` | CEA CSV + DB diff | Insert with UNIQUE constraint |
| `src/common.py` | Shared: Supabase client, normalization, chunking | Library |
| `src/data_gov_client.py` | data.gov.sg HTTP client with retry/rate-limit | Library |

### Database Tables (Supabase Postgres, public RLS read-only)

| Table | Key Columns | Rows |
|-------|-------------|------|
| `cea_agents` | `registration_no` (PK), `salesperson_name`, `estate_agent_name`, dates | ~37,500 |
| `cea_transactions` | `salesperson_reg_num`, `transaction_date`, `property_type`, `town`, `district` | ~1.3M |
| `hdb_resale_transactions` | `month`, `town`, `street_name`, `flat_type`, `resale_price` | ~970K |
| `ura_transactions` | `project`, `district`, `contract_date`, `price`, `area_sqm`, `price_psf` (generated) | ~500K |
| `cea_agent_movements` | `registration_no`, `movement_date`, `from_agency`, `to_agency` | Derived |
| `pipeline_runs` | `dataset`, `records_fetched`, `started_at`, `completed_at` | Audit log |

Migrations: `scripts/property-pipeline/migrations/001_create_property_tables.sql`, `002_ura_drop_unique_add_nett_price.sql`

### Env Vars Required

| Var | Used By |
|-----|---------|
| `SUPABASE_URL` | Frontend (SSR) + Pipeline |
| `SUPABASE_ANON_KEY` | Frontend (SSR) |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline only (write access) |
| `URA_ACCESS_KEY` | Pipeline only (URA eService API) |

---

## Map Generation (`scripts/generate-sg-map.ts`)

One-time build script. Fetches URA Master Plan 2019 GeoJSON from data.gov.sg, simplifies polygons with `@turf/simplify`, projects to Mercator SVG, outputs `sg-planning-area-paths.ts`.

```bash
npx tsx scripts/generate-sg-map.ts
```

- Source: `https://api-open.data.gov.sg/v1/public/api/datasets/d_4765db0e87b9c86336792efe8a1f7a66/poll-download`
- Output: 55 planning area SVG paths
- Dev dependencies: `d3-geo`, `@types/d3-geo`, `@turf/simplify` (not in runtime bundle)
- Refresh frequency: Rarely needed — URA Master Plan updates every ~5 years

---

## SEO

| Asset | Status |
|-------|--------|
| `app/sitemap.ts` | Dynamic sitemap covering all market routes (agents chunked at 4,000/file) |
| `app/robots.ts` | Allows `/market/*`, blocks `/cases/`, `/auth/`, `/api/` |
| Per-page `<title>` + `<meta>` | `generateMetadata()` on all detail pages |
| 301 redirects | Old routes → `/market/*` in `next.config.ts` |

---

## Tests (14 files, 917 total suite passing)

All property-related tests in `src/components/property/__tests__/` and `src/components/property/charts/__tests__/`. Run with:

```bash
npx vitest run
```

---

## Color Palette

Charts use a unified blue palette (differentiated from brand green `#024F46`):

| Token | Hex | Usage |
|-------|-----|-------|
| `CHART_PRIMARY` | `#1e3a5f` | Primary: bars, lines, dominant donut segment |
| `CHART_PRIMARY_LIGHT` | `#60a5fa` | Accents: dots, area fills |
| `CHART_COLORS[0-4]` | `#1e3a5f` → `#93c5fd` | 5-step scale for donut segments |
| Map fill | `rgb(37, 99, 235)` | Choropleth intensity |
| Heatmap | `rgba(30, 58, 95, 0.2-1.0)` | Activity heatmap cells |
