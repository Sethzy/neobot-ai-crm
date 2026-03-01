# Singapore Property Data Pipeline

Data pipeline for ingesting:
- CEA agent registry CSV (`data/cea/CEASalespersonInformation.csv`)
- CEA residential transactions CSV (`data/cea/CEASalespersonsPropertyTransactionRecordsresidential.csv`)
- HDB resale CSVs (`data/hdb/*.csv`)
- URA private residential transactions API (4 batches)

## Setup

```bash
cd scripts/property-pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Required env vars:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `URA_ACCESS_KEY`

Optional:
- `SUPABASE_DB_URL` (not required by current scripts)

## Usage

```bash
# Full run (agents -> CEA txn -> HDB -> URA)
python run_pipeline.py

# Full run + movement detection before agent refresh
python run_pipeline.py --with-movements

# Dry run (no DB writes)
python run_pipeline.py --dry-run

# Individual datasets
python run_pipeline.py --agents-only
python run_pipeline.py --cea-txn-only
python run_pipeline.py --hdb-only
python run_pipeline.py --ura-only
python run_pipeline.py --movements-only
```

## Notes

- CEA transactions and HDB resale imports use a true full refresh pattern:
  `truncate_property_table(...)` RPC + batched inserts.
- URA transactions use `upsert` on the unique key:
  `(project, street, contract_date, price, area_sqm, floor_range)`.
  Raw API rows are de-duplicated on this key before each upsert batch.
- `pipeline_runs` is updated after each successful ingestion step.
