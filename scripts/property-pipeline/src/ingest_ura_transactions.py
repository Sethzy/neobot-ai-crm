from __future__ import annotations

import argparse
import re
from datetime import datetime

import requests

from src.common import (
    chunked,
    create_supabase_service_client,
    load_pipeline_env,
    log_pipeline_run,
    normalize_text,
    require_env,
    safe_rpc_truncate,
    to_float,
    to_int,
    utc_now_iso,
)

DATASET = "ura_transactions"
BATCH_SIZE = 500
REQUEST_TIMEOUT_SECONDS = 45
DEFAULT_HEADERS = {
    "User-Agent": "PostmanRuntime/7.43.4",
    "Accept": "application/json",
    "Connection": "keep-alive",
}

TOKEN_URL = "https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1"
TRANSACTION_URL = (
    "https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1"
    "?service=PMI_Resi_Transaction&batch={batch}"
)

SALE_TYPE_MAP = {"1": "New Sale", "2": "Sub Sale", "3": "Resale"}
PROJECT_PLACEHOLDER_SENTINELS = {
    "na",
    "landed housing development",
}
LANDED_PROPERTY_TYPE_KEYWORDS = (
    "detached",
    "terrace",
    "bungalow",
)


def parse_contract_date(mmyy: object) -> str | None:
    text = normalize_text(mmyy)
    if not text or len(text) != 4:
        return None
    try:
        month = int(text[:2])
        year_suffix = int(text[2:])
    except ValueError:
        return None
    if month < 1 or month > 12:
        return None
    year = 2000 + year_suffix if year_suffix < 50 else 1900 + year_suffix
    try:
        return datetime(year, month, 1).strftime("%Y-%m-%d")
    except ValueError:
        return None


def map_sale_type(value: object) -> str | None:
    text = normalize_text(value)
    if text is None:
        return None
    return SALE_TYPE_MAP.get(text, text)


def is_project_placeholder_sentinel(value: str) -> bool:
    normalized = " ".join(value.lower().replace(".", "").replace("/", "").split())
    return normalized in PROJECT_PLACEHOLDER_SENTINELS


def is_landed_property_type(value: object) -> bool:
    text = normalize_text(value)
    if not text:
        return False
    normalized = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return any(keyword in normalized for keyword in LANDED_PROPERTY_TYPE_KEYWORDS)


def fetch_token(access_key: str) -> str:
    response = requests.get(
        TOKEN_URL,
        headers={**DEFAULT_HEADERS, "AccessKey": access_key},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("Status") != "Success" or not payload.get("Result"):
        raise RuntimeError(f"URA token request failed: {payload}")
    return payload["Result"]


def fetch_batch(access_key: str, token: str, batch: int) -> list[dict]:
    response = requests.get(
        TRANSACTION_URL.format(batch=batch),
        headers={**DEFAULT_HEADERS, "AccessKey": access_key, "Token": token},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("Status") != "Success":
        raise RuntimeError(f"URA batch {batch} failed: {payload}")
    return payload.get("Result", []) or []


def flatten_batch_items(items: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for item in items:
        project = normalize_text(item.get("project"))
        street = normalize_text(item.get("street"))
        transactions = item.get("transaction") or []
        has_landed_transactions = any(
            is_landed_property_type(txn.get("propertyType")) for txn in transactions
        )

        # URA uses placeholder project names for landed transactions. Use the
        # street address as the real identifier so each landed property stays
        # distinct.
        if (
            project
            and has_landed_transactions
            and is_project_placeholder_sentinel(project)
        ):
            project = street

        if not project:
            continue
        market_segment = normalize_text(item.get("marketSegment"))
        x_coord = normalize_text(item.get("x"))
        y_coord = normalize_text(item.get("y"))

        for txn in transactions:
            contract_date = parse_contract_date(txn.get("contractDate"))
            if not contract_date:
                continue

            area_sqm = to_float(txn.get("area"))
            price = to_float(txn.get("price"))
            nett_price = to_float(txn.get("nettPrice"))
            no_of_units = to_int(txn.get("noOfUnits")) or 1
            rows.append(
                {
                    "project": project,
                    "street": street,
                    "market_segment": market_segment,
                    "district": normalize_text(txn.get("district")),
                    "contract_date": contract_date,
                    "price": price,
                    "area_sqm": area_sqm,
                    "floor_range": normalize_text(txn.get("floorRange")),
                    "property_type": normalize_text(txn.get("propertyType")),
                    "tenure": normalize_text(txn.get("tenure")),
                    "type_of_sale": map_sale_type(txn.get("typeOfSale")),
                    "type_of_area": normalize_text(txn.get("typeOfArea")),
                    "nett_price": nett_price,
                    "no_of_units": no_of_units,
                    "x_coord": x_coord,
                    "y_coord": y_coord,
                }
            )
    return rows


def run_ura_ingestion(*, dry_run: bool = False) -> dict:
    started_at = utc_now_iso()
    load_pipeline_env()
    access_key = require_env("URA_ACCESS_KEY")

    print("[ura] Requesting token...")
    token = fetch_token(access_key)

    all_rows: list[dict] = []
    for batch in [1, 2, 3, 4]:
        print(f"[ura] Fetching batch={batch}")
        items = fetch_batch(access_key, token, batch)
        rows = flatten_batch_items(items)
        all_rows.extend(rows)
        print(f"[ura] batch={batch} flattened_rows={len(rows)}")

    fetched = len(all_rows)

    if dry_run:
        print(f"[ura] DRY RUN fetched={fetched}")
        for row in all_rows[:5]:
            print(
                f"  {row.get('contract_date')} | {row.get('project')} | "
                f"{row.get('district')} | {row.get('price')}"
            )
        return {"dataset": DATASET, "fetched": fetched, "written": 0}

    client = create_supabase_service_client()

    print("[ura] Truncating target table...")
    safe_rpc_truncate(client, "ura_transactions")

    written = 0
    for batch in chunked(all_rows, BATCH_SIZE):
        batch_start_offset = written
        try:
            client.table("ura_transactions").insert(list(batch)).execute()
            written += len(batch)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"URA txn import failed at inserted_offset={batch_start_offset}"
            ) from exc
        if written % 5_000 == 0:
            print(f"[ura] Inserted {written}")

    log_pipeline_run(
        client,
        dataset=DATASET,
        records_fetched=fetched,
        records_written=written,
        started_at=started_at,
    )
    print(f"[ura] Done fetched={fetched}, inserted={written}")
    return {"dataset": DATASET, "fetched": fetched, "written": written}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest URA private transactions")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_ura_ingestion(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
