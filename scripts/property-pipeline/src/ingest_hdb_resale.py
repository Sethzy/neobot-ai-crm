from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.common import (
    DEFAULT_HDB_DIR,
    chunked,
    create_supabase_service_client,
    list_hdb_csv_files,
    log_pipeline_run,
    normalize_text,
    safe_rpc_truncate,
    utc_now_iso,
)

DATASET = "hdb_resale"
CHUNK_SIZE = 50_000
BATCH_SIZE = 1_000


def normalize_remaining_lease(value: object) -> str | None:
    text = normalize_text(value)
    if text is None:
        return None
    if text.replace(".", "", 1).isdigit():
        return f"{int(float(text))} years"
    return text


def transform_chunk(df: pd.DataFrame) -> list[dict]:
    frame = df.copy()
    if "remaining_lease" not in frame.columns:
        frame["remaining_lease"] = None

    frame["month"] = pd.to_datetime(
        frame["month"], format="%Y-%m", errors="coerce"
    ).dt.strftime("%Y-%m-%d")
    frame["remaining_lease"] = frame["remaining_lease"].map(normalize_remaining_lease)
    frame["town"] = frame["town"].map(normalize_text)
    frame["flat_type"] = frame["flat_type"].map(normalize_text)
    frame["block"] = frame["block"].map(normalize_text)
    frame["street_name"] = frame["street_name"].map(normalize_text)
    frame["storey_range"] = frame["storey_range"].map(normalize_text)
    frame["flat_model"] = frame["flat_model"].map(normalize_text)

    frame["floor_area_sqm"] = pd.to_numeric(
        frame["floor_area_sqm"], errors="coerce"
    ).round(2)
    frame["resale_price"] = pd.to_numeric(frame["resale_price"], errors="coerce")
    frame["lease_commence_date"] = pd.to_numeric(
        frame["lease_commence_date"], errors="coerce"
    ).astype("Int64")

    # Respect NOT NULL constraints in schema.
    frame = frame.dropna(subset=["month", "town", "flat_type", "resale_price"])
    frame = frame.where(pd.notna(frame), None)
    return frame.to_dict(orient="records")


def run_hdb_resale_ingestion(
    hdb_dir: Path | str = DEFAULT_HDB_DIR,
    *,
    dry_run: bool = False,
) -> dict:
    started_at = utc_now_iso()
    files = list_hdb_csv_files(Path(hdb_dir))

    client = None if dry_run else create_supabase_service_client()
    fetched = 0
    written = 0
    sample: list[dict] = []

    print(f"[hdb] CSV files={len(files)} from {hdb_dir}")
    if not dry_run:
        print("[hdb] Truncating target table...")
        safe_rpc_truncate(client, "hdb_resale_transactions")

    for csv_file in files:
        print(f"[hdb] Processing {csv_file.name}")
        for chunk_df in pd.read_csv(csv_file, dtype=str, chunksize=CHUNK_SIZE):
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
                    client.table("hdb_resale_transactions").insert(list(batch)).execute()
                    written += len(batch)
                except Exception as exc:  # noqa: BLE001
                    raise RuntimeError(
                        f"HDB import failed at inserted_offset={batch_start_offset} "
                        f"(file={csv_file.name})"
                    ) from exc

        if not dry_run:
            print(f"[hdb] Inserted {written} rows so far")

    if dry_run:
        print(f"[hdb] DRY RUN fetched={fetched}")
        for row in sample:
            print(
                f"  {row.get('month')} | {row.get('town')} | {row.get('flat_type')} | "
                f"{row.get('resale_price')}"
            )
        return {"dataset": DATASET, "fetched": fetched, "written": 0}

    log_pipeline_run(
        client,
        dataset=DATASET,
        records_fetched=fetched,
        records_written=written,
        started_at=started_at,
    )
    print(f"[hdb] Done fetched={fetched}, inserted={written}")
    return {"dataset": DATASET, "fetched": fetched, "written": written}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest HDB resale CSV files")
    parser.add_argument(
        "--hdb-dir",
        default=str(DEFAULT_HDB_DIR),
        help="Path to data/hdb directory",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_hdb_resale_ingestion(args.hdb_dir, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

