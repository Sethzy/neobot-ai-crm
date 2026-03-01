from __future__ import annotations

import argparse
import math
from pathlib import Path

import pandas as pd

from src.common import (
    DEFAULT_CEA_TXN_CSV,
    chunked,
    create_supabase_service_client,
    log_pipeline_run,
    normalize_dash,
    utc_now_iso,
    safe_rpc_truncate,
)

DATASET = "cea_transactions"
CHUNK_SIZE = 50_000
BATCH_SIZE = 2_000


def transform_chunk(df: pd.DataFrame) -> list[dict]:
    frame = df.copy()
    frame["transaction_date"] = pd.to_datetime(
        frame["transaction_date"], format="%b-%Y", errors="coerce"
    ).dt.strftime("%Y-%m-%d")

    for column in [
        "salesperson_name",
        "salesperson_reg_num",
        "property_type",
        "transaction_type",
        "represented",
        "town",
        "district",
        "general_location",
    ]:
        frame[column] = frame[column].map(normalize_dash)

    frame = frame.astype(object).where(pd.notna(frame), None)
    records = frame.to_dict(orient="records")
    for row in records:
        for key, value in row.items():
            if isinstance(value, float) and math.isnan(value):
                row[key] = None
    return records


def run_cea_transaction_ingestion(
    csv_path: Path | str = DEFAULT_CEA_TXN_CSV,
    *,
    dry_run: bool = False,
) -> dict:
    started_at = utc_now_iso()
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CEA transactions CSV not found: {path}")

    client = None if dry_run else create_supabase_service_client()
    fetched = 0
    written = 0
    sample: list[dict] = []

    print(f"[cea_txn] Reading CSV: {path}")
    if not dry_run:
        print("[cea_txn] Truncating target table...")
        safe_rpc_truncate(client, "cea_transactions")

    for chunk_df in pd.read_csv(path, dtype=str, chunksize=CHUNK_SIZE):
        fetched += len(chunk_df)
        records = transform_chunk(chunk_df)

        if dry_run:
            needed = 5 - len(sample)
            if needed > 0:
                sample.extend(records[:needed])
            continue

        for batch in chunked(records, BATCH_SIZE):
            batch_start_offset = written
            try:
                client.table("cea_transactions").insert(list(batch)).execute()
                written += len(batch)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError(
                    f"CEA txn import failed at inserted_offset={batch_start_offset}"
                ) from exc

        print(f"[cea_txn] Inserted {written}/{fetched} transformed rows")

    if dry_run:
        print(f"[cea_txn] DRY RUN fetched={fetched}")
        for row in sample:
            print(
                "  "
                f"{row.get('transaction_date')} | {row.get('salesperson_reg_num')} | "
                f"{row.get('property_type')} | {row.get('transaction_type')}"
            )
        return {"dataset": DATASET, "fetched": fetched, "written": 0}

    log_pipeline_run(
        client,
        dataset=DATASET,
        records_fetched=fetched,
        records_written=written,
        started_at=started_at,
    )
    print(f"[cea_txn] Done fetched={fetched}, inserted={written}")
    return {"dataset": DATASET, "fetched": fetched, "written": written}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest CEA transactions CSV")
    parser.add_argument(
        "--csv-path",
        default=str(DEFAULT_CEA_TXN_CSV),
        help="Path to CEASalespersonsPropertyTransactionRecordsresidential.csv",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_cea_transaction_ingestion(args.csv_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
