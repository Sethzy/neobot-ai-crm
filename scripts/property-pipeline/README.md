# Singapore Property Agent Scraper

Data pipeline that ingests Singapore's CEA property agent registry and transaction records from data.gov.sg into Supabase.

## Setup

```bash
cd scripts/sg-agent-scraper
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Already has creds pre-filled
```

## Usage

```bash
# Run full pipeline
python run_pipeline.py

# Dry run (no DB writes)
python run_pipeline.py --dry-run

# Individual steps
python run_pipeline.py --agents-only
python run_pipeline.py --txn-only
python run_pipeline.py --movements-only
```

## Data Sources

- **Agent Registry**: ~37,600 agents from CEA
- **Transaction Records**: ~1.3M transactions from data.gov.sg

## License

Public data - open licence from data.gov.sg
