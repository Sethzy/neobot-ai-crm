from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.common import (
    DEFAULT_AGENTS_CSV,
    chunked,
    create_supabase_service_client,
    log_pipeline_run,
    normalize_text,
    utc_now_iso,
)

DATASET = "agents"
CHUNK_SIZE = 5_000
BATCH_SIZE = 500


def title_case_name(value: object) -> str | None:
    text = normalize_text(value)
    return text.title() if text else None


def transform_chunk(df: pd.DataFrame) -> list[dict]:
    frame = df.copy()
    frame["registration_no"] = frame["registration_no"].map(normalize_text)
    frame = frame[frame["registration_no"].notna()]
    frame["salesperson_name"] = frame["salesperson_name"].map(title_case_name)
    frame["estate_agent_name"] = frame["estate_agent_name"].map(title_case_name)
    frame["estate_agent_license_no"] = frame["estate_agent_license_no"].map(
        normalize_text
    )
    frame["registration_start_date"] = frame["registration_start_date"].map(
        normalize_text
    )
    frame["registration_end_date"] = frame["registration_end_date"].map(normalize_text)
    frame = frame.where(pd.notna(frame), None)
    return frame.to_dict(orient="records")


def run_agent_ingestion(
    csv_path: Path | str = DEFAULT_AGENTS_CSV,
    *,
    dry_run: bool = False,
) -> dict:
    started_at = utc_now_iso()
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Agents CSV not found: {path}")

    client = None if dry_run else create_supabase_service_client()
    fetched = 0
    written = 0
    sample: list[dict] = []

    print(f"[agents] Reading CSV: {path}")
    for chunk_df in pd.read_csv(path, dtype=str, chunksize=CHUNK_SIZE):
        fetched += len(chunk_df)
        records = transform_chunk(chunk_df)
        if dry_run:
            needed = 5 - len(sample)
            if needed > 0:
                sample.extend(records[:needed])
            continue

        for batch in chunked(records, BATCH_SIZE):
            client.table("cea_agents").upsert(
                list(batch), on_conflict="registration_no"
            ).execute()
            written += len(batch)
            if written % 5_000 == 0:
                print(f"[agents] Upserted {written}")

    if dry_run:
        print(f"[agents] DRY RUN fetched={fetched}")
        for row in sample:
            print(
                f"  {row.get('registration_no')}: {row.get('salesperson_name')} @ "
                f"{row.get('estate_agent_name')}"
            )
        return {"dataset": DATASET, "fetched": fetched, "written": 0}

    log_pipeline_run(
        client,
        dataset=DATASET,
        records_fetched=fetched,
        records_written=written,
        started_at=started_at,
    )
    print(f"[agents] Done fetched={fetched}, upserted={written}")
    return {"dataset": DATASET, "fetched": fetched, "written": written}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest CEA agents CSV")
    parser.add_argument(
        "--csv-path",
        default=str(DEFAULT_AGENTS_CSV),
        help="Path to CEASalespersonInformation.csv",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_agent_ingestion(args.csv_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

