"""
Ingests CEA Salesperson Information from data.gov.sg into Supabase.
~37,600 agents. Takes ~2 minutes.
"""
import os
import time
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

from src.data_gov_client import DataGovClient

load_dotenv()

AGENT_RESOURCE_ID = os.getenv(
    "DATA_GOV_AGENT_RESOURCE_ID", "d_07c63be0f37e6e59c07a4ddc2fd87fcb"
)


def parse_date(date_str: str | None, fmt: str = "%d/%m/%Y") -> str | None:
    """Parse DD/MM/YYYY to YYYY-MM-DD. Returns None if empty/invalid."""
    if not date_str or not date_str.strip():
        return None
    try:
        return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
    except ValueError:
        return None


def title_case_name(name: str) -> str:
    """Convert 'NG YEOW TONG, WALTER' to 'Ng Yeow Tong, Walter'."""
    if not name:
        return name
    return name.strip().title()


def transform_agent_record(raw: dict) -> dict:
    """Transform raw API record into DB-ready dict."""
    return {
        "registration_no": raw["registration_no"].strip(),
        "salesperson_name": title_case_name(raw.get("salesperson_name", "")),
        "registration_start_date": parse_date(raw.get("registration_start_date")),
        "registration_end_date": parse_date(raw.get("registration_end_date")),
        "estate_agent_name": title_case_name(raw.get("estate_agent_name", "")),
        "estate_agent_license_no": (raw.get("estate_agent_licence_no") or "").strip(),
    }


def run_agent_ingestion(dry_run: bool = False):
    """Fetch all agents from data.gov.sg and upsert into Supabase."""
    started_at = datetime.utcnow().isoformat()

    # 1. Fetch all agent records
    client = DataGovClient()
    print(f"Fetching agents from resource: {AGENT_RESOURCE_ID}")
    raw_records = client.fetch_all(AGENT_RESOURCE_ID, page_size=1000, delay=10.0)
    print(f"Fetched {len(raw_records)} agent records")

    # 2. Transform
    transformed = [transform_agent_record(r) for r in raw_records]
    print(f"Transformed {len(transformed)} records")

    if dry_run:
        print("DRY RUN — not writing to database")
        for r in transformed[:5]:
            print(f"  {r['registration_no']}: {r['salesperson_name']} @ {r['estate_agent_name']}")
        return transformed

    # 3. Upsert to Supabase in batches of 500
    sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    batch_size = 500
    upserted = 0

    for i in range(0, len(transformed), batch_size):
        batch = transformed[i : i + batch_size]
        sb.table("cea_agents").upsert(
            batch, on_conflict="registration_no"
        ).execute()
        upserted += len(batch)
        print(f"  Upserted {upserted}/{len(transformed)}")

    # 4. Log pipeline run
    sb.table("pipeline_runs").insert(
        {
            "dataset": "agents",
            "records_fetched": len(raw_records),
            "records_upserted": upserted,
            "started_at": started_at,
        }
    ).execute()

    print(f"Done. Upserted {upserted} agents.")
    return transformed


if __name__ == "__main__":
    import sys

    dry = "--dry-run" in sys.argv
    run_agent_ingestion(dry_run=dry)
