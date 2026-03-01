# Singapore Property Data Pipeline - Implementation Plan (v3)

**Goal:** Build a data pipeline that ingests Singapore's property agent registry, agent transaction records, HDB resale prices, and private residential transaction data into Supabase — replicating the core data behind OpenAgent.sg for both per-agent and per-property views.

**Architecture:** Four data sources (2 CEA CSVs already downloaded, 5 HDB CSVs already downloaded, URA free API confirmed working) are loaded into Supabase Postgres via Python scripts. Movement detection diffs agent registry snapshots daily.

**Tech Stack:** Python 3.11+, `requests`, `pandas`, Supabase (Postgres + Python client), `python-dotenv`

---

## Prerequisites

- **Supabase project (property data):** Separate project from main Sunder app for separation of concerns
  - Create via Supabase dashboard or MCP: `mcp__supabase__create_project`
  - Service role key in `scripts/property-pipeline/.env`
  - Supabase MCP is enabled — use `mcp__supabase__apply_migration` for DDL and `mcp__supabase__execute_sql` for queries
  - **Note:** Main Sunder app and property data must stay in separate projects.
  - The Next.js frontend will need a second Supabase client pointing to this project (read-only anon key for public data)
- Python 3.11+ installed, venv at `scripts/property-pipeline/venv/`
- **URA API Access Key:** stored in `.env` as `URA_ACCESS_KEY` — CONFIRMED WORKING
  - Token endpoint: `GET https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1`
  - API docs: `https://eservice.ura.gov.sg/maps/api/#introduction`
- **Vercel Pro plan** ($20/mo) — required for Part 3 cron jobs (3 crons, sub-daily schedules)

## Data Source Reference

| # | Dataset | Rows | Source | Status |
|---|---|---|---|---|
| 1 | CEA Salesperson Info | 37,594 | CSV (downloaded) | Ready |
| 2 | CEA Agent Transactions | 1,295,357 | CSV (downloaded) | Ready |
| 3 | HDB Resale Flat Prices | 972,287 | 5 CSVs (downloaded) | Ready |
| 4 | URA Private Residential Transactions | ~140,100 | Free API (4 batches) | Key confirmed |

### CSV File Locations (in Next.js project root)

```
data/cea/CEASalespersonInformation.csv
data/cea/CEASalespersonsPropertyTransactionRecordsresidential.csv
data/hdb/
  ├── Resale Flat Prices (Based on Approval Date), 1990 - 1999.csv          (287K rows)
  ├── Resale Flat Prices (Based on Approval Date), 2000 - Feb 2012.csv      (370K rows)
  ├── Resale Flat Prices (Based on Registration Date), From Mar 2012 to Dec 2014.csv (52K rows)
  ├── Resale Flat Prices (Based on Registration Date), From Jan 2015 to Dec 2016.csv (37K rows)
  └── Resale flat prices based on registration date from Jan-2017 onwards.csv (226K rows)
```

**Source-of-truth locations for this repo:**
- `data/cea/CEASalespersonInformation.csv`
- `data/cea/CEASalespersonsPropertyTransactionRecordsresidential.csv`
- `data/hdb/*.csv` (5 CSVs)

### CSV Column Schemas

**CEA Agents CSV:**
`salesperson_name, registration_no, registration_start_date, registration_end_date, estate_agent_name, estate_agent_license_no`
- Dates are YYYY-MM-DD format
- Names are UPPERCASE

**CEA Transactions CSV:**
`salesperson_name, transaction_date, salesperson_reg_num, property_type, transaction_type, represented, town, district, general_location`
- transaction_date is `MMM-YYYY` format (e.g. `OCT-2017`)
- HDB rows: town is populated, district is `-`
- Private rows: town is `-`, district is a number
- Some rows have `-` for salesperson fields (anonymous agents)
- **No natural primary key** — 189K rows (14.6%) share the same composite key but differ in town/district. Another 109K rows are legitimate repeats (same agent, same month, same everything). See review note C1.

**HDB Resale CSV (2017+):**
`month, town, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, remaining_lease, resale_price`
- month is `YYYY-MM`
- Column differences across CSVs:
  - 1990-2014: `remaining_lease` column missing entirely
  - 2015-2016: `remaining_lease` is an **integer** (e.g. `70`)
  - 2017+: `remaining_lease` is a **string** (e.g. `61 years 04 months`)
  - Normalize at ingestion: convert integer format to `"{N} years"` string
- **2,008 rows across all 5 CSVs** are legitimate duplicates (same block, storey, flat type, area, price in same month). No cross-CSV duplicates exist.

**URA API Response (per project):**
```json
{
  "project": "DOUBLE BAY RESIDENCES",
  "street": "SIMEI STREET 4",
  "marketSegment": "OCR",
  "x": "...", "y": "...",
  "transaction": [{
    "contractDate": "0321",     // mmyy format
    "price": "1430000",
    "area": "127",              // sqm
    "floorRange": "01-05",
    "propertyType": "Condominium",
    "district": "18",
    "tenure": "99 yrs lease commencing from 2008",
    "typeOfSale": "3",          // 1=New, 2=Sub, 3=Resale
    "typeOfArea": "Strata",
    "noOfUnits": "1"
  }]
}
```

---

## What Already Exists (from prior session)

Prior session scaffold currently in repo:
- `scripts/property-pipeline/` — project scaffold, `.env`, `.env.example`, `requirements.txt`, `README.md`
- `scripts/property-pipeline/src/data_gov_client.py` — API client (legacy; no longer needed for CSV approach)
- `scripts/property-pipeline/src/ingest_agents.py` — agent ingestion via API (needs rewrite for CSV)

**We'll rewrite the ingestion scripts for CSV import and add the new data sources.**

---

## Task 1: Update Supabase Schema

**Goal:** Create/update all tables for the 4 data sources.

**Import strategy:** Use `TRUNCATE + INSERT` (not upsert) for CEA transactions and HDB resale tables.
These datasets have no natural primary key — composite UNIQUE constraints would silently destroy
14.6% of CEA transactions (189K rows) and 2K HDB rows. Full refresh on each import is the correct approach.

**Migration SQL:**

```sql
-- Drop old tables if they exist from prior attempts
DROP TABLE IF EXISTS cea_agent_movements CASCADE;
DROP TABLE IF EXISTS cea_transactions CASCADE;
DROP TABLE IF EXISTS cea_agents CASCADE;
DROP TABLE IF EXISTS hdb_resale_transactions CASCADE;
DROP TABLE IF EXISTS ura_transactions CASCADE;
DROP TABLE IF EXISTS pipeline_runs CASCADE;

-- 1. Agent registry (37.6K rows from CEA CSV)
CREATE TABLE cea_agents (
    registration_no TEXT PRIMARY KEY,
    salesperson_name TEXT NOT NULL,
    registration_start_date DATE,
    registration_end_date DATE,
    estate_agent_name TEXT,
    estate_agent_license_no TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agent transaction records (1.3M rows from CEA CSV)
--    No FK to cea_agents: 2,770 reg numbers (23,823 txns) reference expired agents not in registry
--    No UNIQUE constraint: data has no natural PK. Use TRUNCATE + INSERT for full refresh.
CREATE TABLE cea_transactions (
    id BIGSERIAL PRIMARY KEY,
    salesperson_name TEXT,
    salesperson_reg_num TEXT,
    transaction_date DATE,
    property_type TEXT,
    transaction_type TEXT,
    represented TEXT,
    town TEXT,
    district TEXT,
    general_location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HDB resale flat prices (972K rows from 5 CSVs)
--    No UNIQUE constraint: 2,008 legitimate duplicate rows exist. TRUNCATE + INSERT.
CREATE TABLE hdb_resale_transactions (
    id BIGSERIAL PRIMARY KEY,
    month DATE NOT NULL,
    town TEXT NOT NULL,
    flat_type TEXT NOT NULL,
    block TEXT,
    street_name TEXT,
    storey_range TEXT,
    floor_area_sqm NUMERIC,
    flat_model TEXT,
    lease_commence_date INTEGER,
    remaining_lease TEXT,          -- normalized to string: "61 years 04 months" or "70 years"
    resale_price NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. URA private residential transactions (140K rows from API)
--    Keep UNIQUE(project, street, contract_date, price, area_sqm, floor_range)
--    for idempotency. URA payload can still contain duplicate rows on this key,
--    so ingestion must de-duplicate before each upsert batch to avoid PG 21000.
CREATE TABLE ura_transactions (
    id BIGSERIAL PRIMARY KEY,
    project TEXT NOT NULL,
    street TEXT,
    market_segment TEXT,          -- CCR, RCR, OCR
    district TEXT,
    contract_date DATE,
    price NUMERIC,
    area_sqm NUMERIC,
    price_psf NUMERIC GENERATED ALWAYS AS (
        CASE WHEN area_sqm > 0 THEN ROUND(price / (area_sqm * 10.764), 2) ELSE NULL END
    ) STORED,
    floor_range TEXT,
    property_type TEXT,            -- Condominium, Apartment, Terrace, etc.
    tenure TEXT,
    type_of_sale TEXT,             -- New Sale, Sub Sale, Resale
    type_of_area TEXT,             -- Strata, Land
    no_of_units INTEGER DEFAULT 1,
    x_coord TEXT,
    y_coord TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project, street, contract_date, price, area_sqm, floor_range)
);

-- 5. Movement history (detected by diffing agent registry snapshots)
CREATE TABLE cea_agent_movements (
    id BIGSERIAL PRIMARY KEY,
    registration_no TEXT NOT NULL,
    movement_date DATE NOT NULL,
    movement_type TEXT NOT NULL,
    from_agency TEXT,
    to_agency TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(registration_no, movement_date, movement_type, from_agency, to_agency)
);

-- 6. Pipeline run tracking
CREATE TABLE pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    dataset TEXT NOT NULL,
    records_fetched INTEGER NOT NULL,
    records_upserted INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cea_agents_agency ON cea_agents(estate_agent_name);
CREATE INDEX idx_cea_txn_reg_num ON cea_transactions(salesperson_reg_num);
CREATE INDEX idx_cea_txn_date ON cea_transactions(transaction_date);
CREATE INDEX idx_cea_txn_property_type ON cea_transactions(property_type);
CREATE INDEX idx_cea_txn_town ON cea_transactions(town);
CREATE INDEX idx_cea_txn_district ON cea_transactions(district);
CREATE INDEX idx_hdb_month ON hdb_resale_transactions(month);
CREATE INDEX idx_hdb_town ON hdb_resale_transactions(town);
CREATE INDEX idx_hdb_street ON hdb_resale_transactions(street_name);
CREATE INDEX idx_hdb_flat_type ON hdb_resale_transactions(flat_type);
CREATE INDEX idx_ura_project ON ura_transactions(project);
CREATE INDEX idx_ura_street ON ura_transactions(street);
CREATE INDEX idx_ura_contract_date ON ura_transactions(contract_date);
CREATE INDEX idx_ura_district ON ura_transactions(district);
CREATE INDEX idx_ura_property_type ON ura_transactions(property_type);
CREATE INDEX idx_movements_reg_no ON cea_agent_movements(registration_no);

-- Service-role helper for true TRUNCATE + INSERT imports
CREATE OR REPLACE FUNCTION truncate_property_table(table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF table_name NOT IN ('cea_transactions', 'hdb_resale_transactions') THEN
        RAISE EXCEPTION 'Table % not allowed for truncate', table_name;
    END IF;
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY', table_name);
END;
$$;
REVOKE ALL ON FUNCTION truncate_property_table(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION truncate_property_table(TEXT) TO service_role;

-- Security: public dataset is read-only from anon key
ALTER TABLE cea_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cea_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hdb_resale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ura_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cea_agent_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_cea_agents" ON cea_agents
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "public_read_cea_transactions" ON cea_transactions
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "public_read_hdb_resale" ON hdb_resale_transactions
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "public_read_ura_transactions" ON ura_transactions
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "public_read_agent_movements" ON cea_agent_movements
FOR SELECT TO anon, authenticated
USING (true);
```

**Apply via Supabase MCP:**
```
mcp__supabase__apply_migration(project_id="<PROPERTY_PROJECT_REF>", name="create_property_tables_v3", query=<SQL above>)
```

**Verify:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```
Expected: `cea_agent_movements`, `cea_agents`, `cea_transactions`, `hdb_resale_transactions`, `pipeline_runs`, `ura_transactions`

---

## Task 2: Rewrite Ingestion Scripts for CSV Import

### 2a. Agent Registry Import (`scripts/property-pipeline/src/ingest_agents.py`)

**Source:** `data/cea/CEASalespersonInformation.csv` (37,594 rows)

Rewrite to read CSV with pandas instead of API client. Transform:
- Names: UPPERCASE → Title Case
- Dates: already YYYY-MM-DD in CSV (no conversion needed)
- Upsert to `cea_agents` in batches of 500

```python
# src/ingest_agents.py
import os
import pandas as pd
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

CSV_PATH = os.path.join(os.path.dirname(__file__), "../../data/cea/CEASalespersonInformation.csv")

def title_case_name(name):
    if not name or pd.isna(name):
        return None
    return str(name).strip().title()

def run_agent_ingestion(csv_path=CSV_PATH, dry_run=False):
    started_at = datetime.now(timezone.utc).isoformat()

    df = pd.read_csv(csv_path)
    print(f"Read {len(df)} agents from CSV")

    # Transform columns in-place (vectorized, not iterrows which is 100x slower)
    df["salesperson_name"] = df["salesperson_name"].apply(title_case_name)
    df["estate_agent_name"] = df["estate_agent_name"].apply(title_case_name)
    df["registration_no"] = df["registration_no"].astype(str).str.strip()
    df["estate_agent_license_no"] = df["estate_agent_license_no"].astype(str).str.strip()
    # Convert NaN to None for Supabase
    df = df.where(pd.notna(df), None)
    records = df.to_dict(orient="records")

    if dry_run:
        print("DRY RUN — sample:")
        for r in records[:5]:
            print(f"  {r['registration_no']}: {r['salesperson_name']} @ {r['estate_agent_name']}")
        return records

    sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    batch_size = 500
    upserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        sb.table("cea_agents").upsert(batch, on_conflict="registration_no").execute()
        upserted += len(batch)
        if upserted % 5000 == 0:
            print(f"  Upserted {upserted}/{len(records)}")

    sb.table("pipeline_runs").insert({
        "dataset": "agents",
        "records_fetched": len(records),
        "records_upserted": upserted,
        "started_at": started_at,
    }).execute()

    print(f"Done. Upserted {upserted} agents.")
    return records

if __name__ == "__main__":
    import sys
    run_agent_ingestion(dry_run="--dry-run" in sys.argv)
```

### 2b. CEA Transactions Import (`scripts/property-pipeline/src/ingest_cea_transactions.py`)

**Source:** `data/cea/CEASalespersonsPropertyTransactionRecordsresidential.csv` (1,295,357 rows)

Transform:
- transaction_date: `MMM-YYYY` → `YYYY-MM-01` (e.g. `OCT-2017` → `2017-10-01`)
- Replace `-` with None for town/district
- Keep rows where salesperson_reg_num is `-` (23,823 orphan transactions from expired agents — still valid data)
- **TRUNCATE** table before insert (no UNIQUE key — full refresh each time)
- INSERT in batches of 2000 (PostgREST handles up to ~6MB per request)
- Use `df.to_dict(orient='records')` not `iterrows()` (100x faster for 1.3M rows)
- Add try/except per batch with last-successful-offset logging for resume on failure

```python
# src/ingest_cea_transactions.py
from datetime import datetime

def parse_mmm_yyyy(date_str):
    """Parse 'OCT-2017' to '2017-10-01'. Returns None on failure."""
    if not date_str or date_str.strip() == "-":
        return None
    try:
        return datetime.strptime(date_str.strip(), "%b-%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None

def clean_dash(val):
    """Replace '-' with None."""
    if val and str(val).strip() == "-":
        return None
    return str(val).strip() if val and pd.notna(val) else None
```

### 2c. HDB Resale Import (`scripts/property-pipeline/src/ingest_hdb_resale.py`)

**Source:** 5 CSV files in `data/hdb/` (972,287 rows total)

Transform:
- month: `YYYY-MM` → `YYYY-MM-01`
- Concat all 5 CSVs (older ones lack `remaining_lease` — fill with None)
- **TRUNCATE** table before insert (no UNIQUE key — full refresh each run)
- INSERT in batches of 1000

### 2d. URA Transactions Import (`scripts/property-pipeline/src/ingest_ura_transactions.py`)

**Source:** URA Free API, 4 batches

Transform:
- contractDate: `mmyy` → `YYYY-MM-01` (e.g. `0321` → `2021-03-01`)
- typeOfSale: `1` → `New Sale`, `2` → `Sub Sale`, `3` → `Resale`
- PSF is auto-calculated by Postgres (`GENERATED ALWAYS` column) — do NOT include in INSERT
- Guard against area_sqm = 0 (land-only transactions) — handled by `CASE WHEN` in column definition
- Flatten project+transaction[] into individual rows
- De-duplicate rows by `(project, street, contract_date, price, area_sqm, floor_range)` before upsert
- Upsert in batches of 500 (on_conflict on UNIQUE key)

```python
# Authentication flow:
# 1. GET https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1
#    Header: AccessKey: <from .env URA_ACCESS_KEY>
#    Returns: {"Status":"Success","Result":"<token>"}
#
# 2. GET https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch={1-4}
#    Headers: AccessKey + Token
#    Returns: {"Status":"Success","Result":[{project, street, transaction:[...]}, ...]}

SALE_TYPE_MAP = {"1": "New Sale", "2": "Sub Sale", "3": "Resale"}

def parse_contract_date(mmyy):
    """Parse '0321' to '2021-03-01'. Validates month 1-12."""
    if not mmyy or len(mmyy) != 4:
        return None
    try:
        mm, yy = int(mmyy[:2]), int(mmyy[2:])
    except ValueError:
        return None
    if mm < 1 or mm > 12:
        return None
    year = 2000 + yy if yy < 50 else 1900 + yy
    return f"{year}-{mm:02d}-01"
```

---

## Task 3: Master Pipeline Script

Rewrite `run_pipeline.py` to orchestrate all 4 imports:

```
python run_pipeline.py                     # Full run (all 4 sources)
python run_pipeline.py --agents-only       # Just CEA agents CSV
python run_pipeline.py --cea-txn-only      # Just CEA transactions CSV
python run_pipeline.py --hdb-only          # Just HDB resale CSVs
python run_pipeline.py --ura-only          # Just URA API pull
python run_pipeline.py --dry-run           # All steps, no DB writes
```

Execution order:
1. CEA agents (must be first — other tables may reference)
2. CEA transactions
3. HDB resale transactions
4. URA private transactions

---

## Task 4: Movement Detection (Unchanged)

Same as before — diff current vs previous agent registry snapshots.
But now reads from CSV (current) vs Supabase (previous) instead of API vs Supabase.

---

## Task 5: Verification Queries

```sql
-- Row counts
SELECT 'cea_agents' as t, COUNT(*) FROM cea_agents
UNION ALL SELECT 'cea_transactions', COUNT(*) FROM cea_transactions
UNION ALL SELECT 'hdb_resale', COUNT(*) FROM hdb_resale_transactions
UNION ALL SELECT 'ura_transactions', COUNT(*) FROM ura_transactions;

-- Verify Walter Ng (R004301C) — OpenAgent shows 115 transactions
SELECT COUNT(*) FROM cea_transactions WHERE salesperson_reg_num = 'R004301C';

-- Verify Double Bay Residences — OpenAgent shows 1,180 transactions
-- (API only has ~137 recent ones; historical would need REALIS)
SELECT project, COUNT(*) as txn_count, MIN(contract_date) as earliest, MAX(contract_date) as latest
FROM ura_transactions WHERE project = 'DOUBLE BAY RESIDENCES' GROUP BY project;

-- Top agencies by agent count
SELECT estate_agent_name, COUNT(*) as agents FROM cea_agents
GROUP BY estate_agent_name ORDER BY agents DESC LIMIT 10;

-- HDB resale price stats
SELECT town, COUNT(*) as txns, ROUND(AVG(resale_price)) as avg_price
FROM hdb_resale_transactions WHERE month >= '2024-01-01'
GROUP BY town ORDER BY avg_price DESC LIMIT 10;

-- URA: Top condos by transaction volume
SELECT project, street, COUNT(*) as txns,
  ROUND(AVG(price_psf)) as avg_psf,
  ROUND(AVG(price)) as avg_price
FROM ura_transactions
GROUP BY project, street ORDER BY txns DESC LIMIT 20;
```

---

## Execution Order & Estimates

```
Task 1: Schema migration          (~2 min — just run SQL)
Task 2a: Import CEA agents CSV    (~1 min — 37K rows)
Task 2b: Import CEA transactions  (~5 min — 1.3M rows, truncate + batch insert)
Task 2c: Import HDB resale CSVs   (~3 min — 972K rows, truncate + batch insert)
Task 2d: Fetch + import URA API   (~3 min — 4 API calls, 140K rows)
Task 3: Pipeline orchestrator      (~2 min to write)
Task 4: Movement detection         (deferred — needs 2nd snapshot)
Task 5: Verification queries       (~2 min)
```

**Total: ~20 min coding + ~12 min pipeline execution**

---

## Relevant Files

All development happens in `/Users/sethlim/Documents/sunder-next-migration-20260225`.

### Pipeline Scripts (Python)
| File | Purpose |
|---|---|
| `scripts/property-pipeline/src/ingest_agents.py` | CSV → cea_agents (37K rows) |
| `scripts/property-pipeline/src/ingest_cea_transactions.py` | CSV → cea_transactions (1.3M rows) |
| `scripts/property-pipeline/src/ingest_hdb_resale.py` | 5 CSVs → hdb_resale_transactions (972K rows) |
| `scripts/property-pipeline/src/ingest_ura_transactions.py` | URA API → ura_transactions (140K rows) |
| `scripts/property-pipeline/src/detect_movements.py` | Agent movement detection |
| `scripts/property-pipeline/run_pipeline.py` | Master orchestrator |
| `scripts/property-pipeline/requirements.txt` | Python dependencies |
| `scripts/property-pipeline/.env` | Credentials (gitignored) |

### Raw Data (gitignored)
| File | Purpose |
|---|---|
| `data/cea/CEASalespersonInformation.csv` | Agent registry (37.6K rows) |
| `data/cea/CEASalespersonsPropertyTransactionRecordsresidential.csv` | Agent transactions (1.3M rows) |
| `data/hdb/*.csv` | HDB resale prices (5 CSVs, 972K rows) |

### Frontend (Next.js — public routes)
| File | Purpose |
|---|---|
| `app/agents/layout.tsx` | Shared layout (Header + Footer) |
| `app/agents/page.tsx` | Agent search/list |
| `app/agents/[regNo]/page.tsx` | Agent profile |
| `app/properties/layout.tsx` | Shared layout |
| `app/properties/page.tsx` | Property search/list |
| `app/properties/[slug]/page.tsx` | Property profile |
| `app/hdb/[town]/[slug]/page.tsx` | HDB block profile |
| `app/agencies/[slug]/page.tsx` | Agency directory |
| `app/areas/[slug]/page.tsx` | Area overview |
| `src/components/property/*.tsx` | Shared chart/UI components |
| `src/lib/supabase/property-client.ts` | Second Supabase client (property data) |

---

## What This Gets You

After running the pipeline once, Supabase contains:

| Table | Rows | Powers |
|---|---|---|
| `cea_agents` | 37,594 | Agent profiles, agency lookup, registration dates |
| `cea_transactions` | 1,295,357 | Per-agent: transaction history, property type mix, representation split, top neighborhoods, activity heatmap |
| `hdb_resale_transactions` | 972,287 | Per-property (HDB): price trends, block-level pricing, storey premium, flat type distribution |
| `ura_transactions` | ~140,100 | Per-property (private): price trends, PSF, floor level premium, type of sale, tenure |
| `cea_agent_movements` | builds over time | Agent transfer tracking between agencies |

**Coverage vs OpenAgent.sg:**
- Per-agent view: 100% covered (all charts/tables in screenshots)
- Per-property view (private): ~90% covered (missing: purchaser address indicator from REALIS)
- Per-property view (HDB): 100% covered
- Historical private data (pre-API): Not covered (would need REALIS annual plan)

---

## Data Gap: What REALIS Would Add

The URA free API covers recent transactions. REALIS ($1,960/year) would add:
- **Purchaser Address Indicator** (HDB/Private buyer) — powers the "Purchaser Profile" pie chart
- **Historical data back to 1995** — the API only has recent years
- **Postal code/sector** for precise property grouping
- **CSV bulk export** (daily plan at $87/day CANNOT export — annual only)

**Verdict:** Not needed for v1. The free API + CSVs cover the core use case.

---
---

# Part 2: Frontend — OpenAgent-Style UI (Public Landing Pages)

**Codebase:** `/Users/sethlim/Documents/sunder-next-migration-20260225`
**Stack:** Next.js 15 (App Router) + React 19 + Tailwind 4 + ShadCN + TanStack Query/Table
**Theme:** Light mode, matching existing landing pages (`app/industries/`, `app/use-cases/`) — Sunder Green on white

## Architecture: Public Landing Pages (NOT Dashboard)

Property data pages are **free public resources** — they live outside the `(dashboard)` route group.
They follow the same pattern as `app/industries/` and `app/use-cases/`: Header + Footer from
`@/components/landing/`, no auth required, no sidebar.

**Route pattern:** `app/agents/`, `app/properties/`, `app/hdb/`, `app/agencies/`, `app/areas/`
— all at the app root, NOT under `app/(dashboard)/`.

**Middleware:** Add to `isPublicRoute()` in `middleware.ts`:
```typescript
pathname.startsWith("/agents") ||
pathname.startsWith("/properties") ||
pathname.startsWith("/hdb") ||
pathname.startsWith("/agencies") ||
pathname.startsWith("/areas")
```

**Layout:** Each section gets a shared layout (`app/agents/layout.tsx`) that wraps with Header + Footer:
```typescript
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-page min-h-screen bg-white">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
```

## Existing Setup (Reuse)

- Supabase client (browser + server) at `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts` — **but points to main Sunder project**. Need a second client for the property data project.
- TanStack Query provider already wrapped in `app/providers.tsx` (staleTime: 60s, refetchOnWindowFocus: false)
- ShadCN UI components (29 prebuilt: card, table, badge, tabs, skeleton, sidebar, tooltip, etc.)
- Lucide icons installed
- TanStack Table already used in `cases-table.tsx` and `documents-table.tsx` with dnd-kit column reorder — can follow same patterns
- Landing page components: `Header`, `Footer`, `Container` from `@/components/landing/` — reuse for property pages

## What Needs Setup

```bash
cd /Users/sethlim/Documents/sunder-next-migration-20260225
npm install recharts
```

Recharts is already in `next.config.ts` `optimizePackageImports` — just needs installing to `package.json`.

**Second Supabase client for property data:**
```typescript
// src/lib/supabase/property-client.ts
// Read-only client for the separate property data Supabase project
// Uses NEXT_PUBLIC_PROPERTY_SUPABASE_URL + NEXT_PUBLIC_PROPERTY_SUPABASE_ANON_KEY
```

**Theme note:** These are public landing pages using the existing light theme (Sunder Green #024F46 on white/parchment), consistent with `app/industries/` and `app/use-cases/`. The OpenAgent dark theme (#0a0a0f) in screenshots is for design reference only — we'll use the existing landing page styling with ShadCN components. Chart accent colors can match the brand (sunder-green, sunder-green-dark).

**`"use client"` boundaries:** All Recharts components (`BarChart`, `PieChart`, `AreaChart`, `ScatterChart`) require browser APIs. Every file in `src/components/property/` that imports recharts must have `"use client"` directive. Parent pages stay as Server Components.

**TanStack Table pagination:** Use `{ count: 'exact' }` in Supabase queries to get total count for pagination controls:
```typescript
const { data, count } = await supabase
  .from('cea_transactions')
  .select('*', { count: 'exact' })
  .eq('salesperson_reg_num', regNo)
  .range(offset, offset + limit - 1)
```

**Orphaned agent links:** 2,770 registration numbers in transaction data reference expired agents not in `cea_agents`. Agent profile pages should handle this gracefully — show "Agent registration expired" instead of 404.

---

## Task 6: Agent Profile Page (`/agents/[regNo]`) — PUBLIC

**Route:** `app/agents/[regNo]/page.tsx` (public landing page, uses Header + Footer)

**Data source:** `cea_agents` + `cea_transactions` (joined on `registration_no = salesperson_reg_num`)

### 6a. Agent Search/List Page (`/agents`)

Simple search page:
- Search input (by name, reg number, agency)
- Results table: name, reg no, agency, transaction count, last transaction
- Links to `/agents/[regNo]`

**Query:**
```sql
SELECT a.*, COUNT(t.id) as txn_count, MAX(t.transaction_date) as last_txn
FROM cea_agents a
LEFT JOIN cea_transactions t ON a.registration_no = t.salesperson_reg_num
WHERE a.salesperson_name ILIKE '%search%' OR a.registration_no ILIKE '%search%'
GROUP BY a.registration_no
ORDER BY txn_count DESC
LIMIT 20;
```

### 6b. Agent Profile Header

**Components:** Profile card with agent info + stats row

Stats to compute from cea_transactions:
1. **Total transactions** — `COUNT(*)`
2. **Last 12 months** — `COUNT(*) WHERE transaction_date >= NOW() - 12 months`
3. **Last transaction** — `MAX(transaction_date)` formatted as "YYYY MMM"
4. **Avg transactions per quarter** — total / (active quarters count)
5. **Active years** — `EXTRACT(YEAR FROM MAX(date)) - EXTRACT(YEAR FROM MIN(date)) + 1`

### 6c. Transaction Volume Chart

**Component:** Recharts `BarChart` with monthly/quarterly/yearly toggle (ShadCN Tabs)

**Data query (quarterly):**
```sql
SELECT DATE_TRUNC('quarter', transaction_date) as period, COUNT(*) as count
FROM cea_transactions
WHERE salesperson_reg_num = $1
GROUP BY period ORDER BY period;
```

### 6d. Activity Heatmap

**Component:** Custom grid — 12 columns (Jan-Dec) × N rows (years), GitHub-contribution style

**Data:**
```sql
SELECT EXTRACT(YEAR FROM transaction_date) as year,
       EXTRACT(MONTH FROM transaction_date) as month,
       COUNT(*) as count
FROM cea_transactions
WHERE salesperson_reg_num = $1
GROUP BY year, month ORDER BY year, month;
```

Color scale: 0 → transparent, 1-2 → light teal, 3-5 → medium, 6+ → dark teal

### 6e. Property Type Distribution (Donut Chart)

**Component:** Recharts `PieChart` with inner radius (donut)

```sql
SELECT property_type, COUNT(*) as count
FROM cea_transactions WHERE salesperson_reg_num = $1
GROUP BY property_type ORDER BY count DESC;
```

Map values: `CONDOMINIUM_APARTMENTS` → "Private condo", `HDB` → "HDB", `EXECUTIVE_CONDOMINIUM` → "Executive condo", `LANDED` → "Landed"

### 6f. Transaction Type / Sales Rep / Rental Rep (3 Donut Charts)

Same Recharts PieChart, 3 side-by-side in a grid:

1. **Transaction Type:** GROUP BY transaction_type
2. **Sales Representation:** WHERE transaction_type IN ('RESALE','NEW SALE','SUB SALE') GROUP BY represented
3. **Rental Representation:** WHERE transaction_type LIKE '%RENTAL%' GROUP BY represented

### 6g. Top Neighbourhoods

**Component:** List with colored dots + count + percentage (no map for v1)

```sql
SELECT COALESCE(town, 'District ' || district, 'Unknown') as area, COUNT(*) as count
FROM cea_transactions WHERE salesperson_reg_num = $1
GROUP BY area ORDER BY count DESC LIMIT 10;
```
Note: Three-argument COALESCE needed because `'District ' || NULL` evaluates to NULL.

HDB Towns toggle vs Private Districts toggle (ShadCN Tabs).

### 6h. Transaction Records Table

**Component:** TanStack Table with pagination (20 per page)

Columns: Date, Property Type, Transaction Type, Represented, Location, District
Server-side pagination via Supabase `.range()`.

### 6i. Movement History

**Component:** Simple timeline/list from `cea_agent_movements`

```sql
SELECT * FROM cea_agent_movements
WHERE registration_no = $1 ORDER BY movement_date DESC;
```

Empty state: "No movement history recorded for this agent" (as shown in screenshots).

---

## Task 7: Property Profile Page (`/properties/[slug]`) — PUBLIC

**Route:** `app/properties/[slug]/page.tsx` (public landing page, uses Header + Footer)
**Slug format:** kebab-case project name + district (e.g. `double-bay-residences-d18`)
Includes district to avoid collision if two developments share the same project name on different streets.

**Data source:** `ura_transactions` (private) or `hdb_resale_transactions` (HDB)

### 7a. Property Search/List Page (`/properties`)

Search by project name or street:
```sql
SELECT project, street, district, market_segment, COUNT(*) as txn_count,
  ROUND(AVG(price_psf)) as avg_psf, MAX(contract_date) as last_sale
FROM ura_transactions
WHERE project ILIKE '%search%' OR street ILIKE '%search%'
GROUP BY project, street, district, market_segment
ORDER BY txn_count DESC LIMIT 20;
```

### 7b. Property Header + Stats Row

Parse slug into `{project_name, district}`; all property-level queries should filter by both:
`WHERE project = $1 AND district = $2`

Stats from ura_transactions WHERE project = $1 AND district = $2:
1. **Total transactions** — COUNT(*)
2. **Avg PSF** — ROUND(AVG(price_psf))
3. **Median price** — PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
4. **Price range** — MIN(price) || ' – ' || MAX(price)
5. **Last sale** — MAX(contract_date)

Plus metadata: district, property type, tenure, market segment.

### 7c. Transaction Volume Chart (Bar)

Same pattern as agent, but for a property:
```sql
SELECT DATE_TRUNC('year', contract_date) as period, COUNT(*) as count
FROM ura_transactions WHERE project = $1 AND district = $2
GROUP BY period ORDER BY period;
```

### 7d. Price Trend (Line Chart)

**Component:** Recharts `AreaChart` with gradient fill (dark teal → transparent)

```sql
SELECT contract_date, price_psf, price, area_sqm
FROM ura_transactions WHERE project = $1 AND district = $2
ORDER BY contract_date;
```

Plot: X = date, Y = price_psf. Show min/median/max bands.

### 7e. Floor Level Premium (Scatter Plot)

**Component:** Recharts `ScatterChart`

```sql
SELECT floor_range, price_psf, price
FROM ura_transactions WHERE project = $1 AND district = $2;
```

Parse floor_range ("01-05" → midpoint 3). X = PSF, Y = floor level.

### 7f. Type of Sale (Donut)

```sql
SELECT type_of_sale, COUNT(*) FROM ura_transactions
WHERE project = $1 AND district = $2 GROUP BY type_of_sale;
```

### 7g. All Transactions Table

TanStack Table, paginated, sortable:
Columns: Sale Date, Address (street), Unit (from floor_range), Price, Area (sqft), PSF, Type, Tenure

---

## Task 8: Shared Components

Reusable chart wrappers built once, used in both agent + property pages:

| Component | Used In | Recharts Type |
|---|---|---|
| `StatCard` | Both | Custom (number + label) |
| `DonutChart` | Both | PieChart (inner radius) |
| `VolumeBarChart` | Both | BarChart + period toggle |
| `PriceAreaChart` | Property | AreaChart with gradient |
| `FloorScatter` | Property | ScatterChart |
| `ActivityHeatmap` | Agent | Custom div grid |
| `DataTable` | Both | TanStack Table wrapper |
| `NeighborhoodList` | Agent | Custom list |

**File structure:**
```
src/components/property/
  ├── stat-card.tsx
  ├── donut-chart.tsx
  ├── volume-bar-chart.tsx
  ├── price-area-chart.tsx
  ├── floor-scatter.tsx
  ├── activity-heatmap.tsx
  ├── neighborhood-list.tsx
  └── data-table.tsx
```

---

## Task 9: API Routes (Server-Side Data Fetching)

Supabase queries behind Next.js server components or API routes:

```
app/api/agents/route.ts           — search agents
app/api/agents/[regNo]/route.ts   — agent profile + stats
app/api/agents/[regNo]/transactions/route.ts — paginated txn list
app/api/properties/route.ts       — search properties
app/api/properties/[slug]/route.ts — property profile + stats
app/api/properties/[slug]/transactions/route.ts — paginated txn list
```

Alternatively, use Next.js Server Components with direct Supabase queries (no API routes needed). TanStack Query on client for pagination/filtering.

**Navigation:** Add "Property Data" links to the landing `Header` component (dropdown or nav items):
- Agents (`/agents`)
- Properties (`/properties`)
- HDB Resale (`/hdb`)

These are public pages — no dashboard sidebar integration needed.

---

## UI Execution Order & Estimates

```
Task 6a: Agent search page        (~15 min)
Task 6b-i: Agent profile page     (~45 min — mostly chart components)
Task 7a: Property search page     (~15 min)
Task 7b-g: Property profile page  (~45 min — reuses chart components)
Task 8: Shared components         (built during 6+7, extracted after)
Task 9: API/data layer            (~20 min)
```

**Total UI: ~2.5 hours**

---

## UI Design Notes (Public Landing Page Style)

**Color palette (light theme — matching existing landing pages):**
- Background: `white` (consistent with `app/industries/`)
- Card background: `white` with `border-zinc-200` (ShadCN card style)
- Primary accent: `sunder-green` (#024F46 — bar charts, primary donut)
- Secondary accent: `sunder-green/60` (secondary donut segments)
- Tertiary accent: `#f97316` (orange — third donut segment)
- Text primary: `zinc-900`
- Text secondary: `zinc-600`

**Chart styling:**
- Bar charts: sunder-green fill, no grid lines, minimal axes
- Donut charts: thick ring (~40px), center label with total + percentage
- Line/area charts: gradient fill from sunder-green to transparent
- Heatmap: 5-step green scale (GitHub contribution style, using sunder-green shades)

**Layout pattern:**
- Full-width header card with stats row (inside `Container` from `@/components/landing/Container`)
- 2-column grid for side-by-side charts (heatmap + donut, scatter + donut)
- 3-column grid for the triple donut row (txn type, sales rep, rental rep)
- Full-width sections for tables and volume charts
- Consistent card wrapper: `rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm` (matching industries page cards)

---
---

# Part 3: Programmatic SEO — Fintool-Style Growth Engine

**Reference:** Fintool scaled to **10M+ monthly impressions** on Google Search with zero content team by using the same agent architecture that powers their product to auto-generate SEO pages. AI referral traffic (ChatGPT, Perplexity citations) converts **4x better** than traditional search. Full case study in `02_Areas/Product/Sunder - Source of Truth/references/Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md` (line 579).

**Core insight:** _"The same AI agent that customizes the product for users also generates the content that brings users in. The content is structured for both humans and models."_

## Strategy: Data-Driven Programmatic Pages

Unlike Fintool (which generates content via agent triggers on financial events), our version is **purely data-driven** — every page is a deterministic render of Supabase data. No LLM needed for page generation. The SEO value comes from **volume + uniqueness + structure**.

### Page Inventory

| Page Type | Count | URL Pattern | Data Source | Google Query Target |
|---|---|---|---|---|
| Agent profiles | **37,594** | `/agents/R004301C` | `cea_agents` + `cea_transactions` | "Walter Ng property agent" |
| Condo/property pages | **~3,970** | `/properties/double-bay-residences-d18` | `ura_transactions` | "Double Bay Residences price" |
| HDB block pages | **~8,000** | `/hdb/ang-mo-kio/blk-406-ang-mo-kio-ave-10` | `hdb_resale_transactions` | "blk 406 ang mo kio resale price" |
| Agency directory | **~1,200** | `/agencies/propnex-realty` | `cea_agents` grouped | "Propnex agents list" |
| Town/district pages | **~50** | `/areas/tampines` | All txn tables aggregated | "Tampines property market" |
| **Total** | **~50,800** | | | |

**50K+ unique, data-rich pages** — each with structured data, unique stats, and charts that no other site computes dynamically.

## Task 10: Programmatic SEO Implementation

### 10a. Static Generation with ISR

Use Next.js `generateStaticParams()` + Incremental Static Regeneration to pre-build high-traffic pages and lazily generate the rest.

**Strategy by page type:**

```
Agent profiles (37.6K pages):
  - generateStaticParams(): top 1,000 agents by transaction count
  - Rest: on-demand ISR with revalidate: 86400 (daily)
  - Each page is a Server Component that queries Supabase directly

Property pages (3,970 pages):
  - generateStaticParams(): ALL (small enough to pre-build)
  - revalidate: 86400

HDB block pages (~8,000 pages):
  - generateStaticParams(): top 2,000 by transaction volume
  - Rest: on-demand ISR
  - revalidate: 86400

Agency pages (~1,200 pages):
  - generateStaticParams(): ALL
  - revalidate: 86400

Area pages (~50 pages):
  - generateStaticParams(): ALL
  - revalidate: 3600 (hourly — these are aggregate landing pages)
```

### 10b. SEO Metadata per Page

Each page needs dynamic `generateMetadata()`:

**IMPORTANT:** Next.js 15 made `params` async. All dynamic routes must `await params`:

```typescript
// app/agents/[regNo]/page.tsx
// CORRECT Next.js 15 pattern — params is a Promise
export async function generateMetadata(props: { params: Promise<{ regNo: string }> }): Promise<Metadata> {
  const { regNo } = await props.params
  const agent = await getAgent(regNo)
  const stats = await getAgentStats(regNo)
  return {
    title: `${agent.salesperson_name} — Property Agent | ${agent.estate_agent_name}`,
    description: `${agent.salesperson_name} (${agent.registration_no}) at ${agent.estate_agent_name}. ${stats.total_txns} transactions, specializing in ${stats.top_property_type} in ${stats.top_area}. Active since ${stats.first_year}.`,
    alternates: { canonical: `/agents/${agent.registration_no}` },
  }
}

// app/properties/[slug]/page.tsx
export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params
  const property = await getProperty(slug)
  return {
    title: `${property.project} — Transactions & Price History | District ${property.district}`,
    description: `${property.project} at ${property.street}. ${property.txn_count} transactions. Average PSF $${property.avg_psf}. Price range $${property.min_price} – $${property.max_price}. ${property.tenure}.`,
    alternates: { canonical: `/properties/${slug}` },
  }
}

// Same pattern for page components:
export default async function AgentPage(props: { params: Promise<{ regNo: string }> }) {
  const { regNo } = await props.params
  // ...
}
```

### 10c. JSON-LD Structured Data

Add schema.org markup for Google rich results:

```typescript
// Agent pages → schema.org/Person (RealEstateAgent)
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "name": agent.salesperson_name,
  "worksFor": { "@type": "Organization", "name": agent.estate_agent_name },
  "areaServed": { "@type": "City", "name": "Singapore" },
  "identifier": agent.registration_no,
}

// Property pages → schema.org/Residence
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Residence",
  "name": property.project,
  "address": { "@type": "PostalAddress", "streetAddress": property.street, "addressCountry": "SG" },
}
```

### 10d. Sitemap Generation

Auto-generate `sitemap.xml` from Supabase. For 50K+ URLs, **must** use split sitemaps
(Google limit: 50K URLs per sitemap file). Each sitemap segment queries only its slice:

```typescript
// app/sitemap.ts
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.trysunder.com"
export async function generateSitemaps() {
  // Split agents into 10K chunks; other entity types fit in one sitemap each
  return [
    { id: 'agents-0' },   // agents 0-9999
    { id: 'agents-1' },   // agents 10000-19999
    { id: 'agents-2' },   // agents 20000-29999
    { id: 'agents-3' },   // agents 30000-37594
    { id: 'properties' }, // all ~4K properties
    { id: 'hdb' },        // all ~8K HDB blocks
    { id: 'agencies' },   // all ~1.2K agencies
    { id: 'areas' },      // all ~50 areas
  ]
}

export default async function sitemap({ id }: { id: string }): Promise<MetadataRoute.Sitemap> {
  const supabase = createPropertyClient()  // second Supabase client

  if (id.startsWith('agents-')) {
    const batch = parseInt(id.split('-')[1])
    const { data } = await supabase
      .from('cea_agents')
      .select('registration_no, updated_at')
      .order('registration_no')
      .range(batch * 10000, (batch + 1) * 10000 - 1)
    return data.map(a => ({
      url: `${SITE_URL}/agents/${a.registration_no}`,
      lastModified: a.updated_at,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  }

  if (id === 'properties') {
    const { data } = await supabase
      .from('ura_transactions')
      .select('project, district')
      .order('project')
    const unique = [...new Map(data.map(p => [`${p.project}::${p.district}`, p])).values()]
    return unique.map(p => ({
      url: `${SITE_URL}/properties/${slugify(p.project)}-d${p.district}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  }

  // ... similar for hdb, agencies, areas
  return []
}
```

### 10e. Internal Linking Mesh

Cross-link pages to build PageRank flow:

- **Agent page** → links to agency page, area pages they operate in, property pages they transacted
- **Property page** → links to area page, agents who transacted there
- **Agency page** → links to all agent profiles under that agency
- **Area page** → links to top agents, top properties, recent HDB transactions

This creates a dense internal link graph that Google crawls deeply.

### 10f. robots.txt + Crawl Budget

```
# public/robots.txt
User-agent: *
Allow: /
Sitemap: https://www.trysunder.com/sitemap.xml

# Block search/filter pages (duplicate content)
Disallow: /agents?*
Disallow: /properties?*

# Allow AI crawlers explicitly
User-agent: GPTBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
```

### 10g. Data Freshness Pipeline (The Fintool Trigger Equivalent)

Fintool triggers content generation when earnings/filings drop. Our equivalent:

| Trigger | Frequency | Action |
|---|---|---|
| URA API update | Tue/Fri | Re-fetch batches 1-4, upsert new transactions, ISR revalidates affected property pages |
| CEA agent CSV refresh | Daily | Download fresh CSV from data.gov.sg, diff against DB, detect movements, revalidate agent pages |
| HDB resale data update | Monthly | Download new CSV, TRUNCATE + INSERT full refresh, revalidate HDB block pages |

Implemented as **Vercel Cron Jobs** (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/ura-refresh", "schedule": "0 8 * * 2,5" },
    { "path": "/api/cron/agent-refresh", "schedule": "0 6 * * *" },
    { "path": "/api/cron/hdb-refresh", "schedule": "0 6 17 * *" }
  ]
}
```

Each cron endpoint (must be protected with a shared secret, e.g. `Authorization: Bearer ${CRON_SECRET}`):
1. Pulls fresh data
2. Writes to Supabase (`upsert` for URA, `TRUNCATE + INSERT` for CEA/HDB CSV datasets)
3. Calls `revalidatePath()` or `revalidateTag()` on affected pages

---

## SEO Execution Order

```
Task 10a: ISR + generateStaticParams   (~30 min — added to existing page routes)
Task 10b: generateMetadata per page     (~20 min — one per page type)
Task 10c: JSON-LD structured data       (~15 min — 2 schemas)
Task 10d: Sitemap generation            (~20 min — split sitemaps)
Task 10e: Internal linking              (~30 min — link components in each page)
Task 10f: robots.txt                    (~5 min)
Task 10g: Cron refresh endpoints        (~45 min — 3 API routes)
```

**Total SEO layer: ~2.5 hours**

---

## Full Project Timeline

| Part | Tasks | Estimate |
|---|---|---|
| **Part 1:** Data Pipeline | Tasks 1-5 | ~30 min total |
| **Part 2:** Frontend UI | Tasks 6-9 | ~2.5 hours |
| **Part 3:** Programmatic SEO | Task 10a-g | ~2.5 hours |
| **Total** | | **~5.5 hours** |

After completion: **50K+ indexed pages**, auto-refreshing data, structured for both Google and AI search engines.

---
---

# Appendix: Review Findings (Applied)

All findings from the code review have been incorporated into the plan above. Summary of changes made:

| ID | Severity | Issue | Fix Applied |
|---|---|---|---|
| C1 | CRITICAL | CEA transactions UNIQUE constraint destroys 189K rows (14.6%) | Removed UNIQUE, switched to TRUNCATE + INSERT |
| C2 | CRITICAL | HDB resale UNIQUE constraint loses 2,008 rows | Removed UNIQUE, switched to TRUNCATE + INSERT |
| C3 | CRITICAL | URA contract date parser produces invalid dates (month 13, no validation) | Added try/except, month 1-12 validation |
| C4 | CRITICAL | Next.js 15 async params — all dynamic routes crash | Fixed to `await props.params` pattern |
| I1 | IMPORTANT | Agent names Title Case vs transaction names UPPERCASE | Noted — normalize both or leave both UPPERCASE |
| I2 | IMPORTANT | 23,823 orphaned transactions reference expired agents | Added graceful "Agent registration expired" handling note |
| I3 | IMPORTANT | PSF division by zero when area_sqm = 0 | Used `GENERATED ALWAYS` with `CASE WHEN area_sqm > 0` |
| I4 | IMPORTANT | Vercel crons need Pro plan | Added to prerequisites |
| I5 | IMPORTANT | remaining_lease format varies (int vs string) across CSVs | Added normalization note |
| I6 | IMPORTANT | Property slug collision risk | Changed slug to include district: `name-d18` |
| I7 | IMPORTANT | Neighbourhood query NULL when both town and district NULL | Added 3-arg COALESCE with 'Unknown' fallback |
| S1 | SUGGESTION | Batch size 1000 suboptimal for 1.3M rows | Increased to 2000 |
| S2 | SUGGESTION | `iterrows()` is slow | Switched to `df.to_dict(orient='records')` |
| S3 | SUGGESTION | No error handling in pipeline | Added try/except with resume-offset logging |
| S4 | SUGGESTION | Sitemap loads all 37K agents into memory | Split queries to match split sitemaps |
| S5 | SUGGESTION | `"use client"` not specified for Recharts | Added note to frontend setup section |
| S6 | SUGGESTION | TanStack Table needs total count for pagination | Added `{ count: 'exact' }` pattern |
| S7 | SUGGESTION | URA API key in plaintext in doc | Replaced with `.env` reference |
| I8 | IMPORTANT | URA payload contains duplicate conflict keys causing PG 21000 upsert failure | Added pre-upsert de-duplication on URA unique key |

Additional repo-alignment fixes in v3: stale file paths updated to `scripts/property-pipeline` + `data/`, HDB import wording corrected to `TRUNCATE + INSERT`, slug/dedupe rules aligned to `project + district`, sitemap/robots domain made configurable via `NEXT_PUBLIC_SITE_URL`, RLS/policies added for public read-only access, and cron endpoint auth requirement documented.

**Infrastructure note:** Property data uses a **separate Supabase project** from the main Sunder app. The Next.js frontend needs a second Supabase client (`src/lib/supabase/property-client.ts`) pointing to the property data project with a read-only anon key.
