from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.common import (
    DEFAULT_AGENTS_CSV,
    chunked,
    create_supabase_service_client,
    normalize_text,
    utc_today_iso,
)

BATCH_SIZE = 500


def normalize_agency(value: object) -> str | None:
    text = normalize_text(value)
    return text.title() if text else None


def fetch_existing_agents() -> dict[str, str | None]:
    client = create_supabase_service_client()
    offset = 0
    page_size = 1000
    existing: dict[str, str | None] = {}

    while True:
        data = (
            client.table("cea_agents")
            .select("registration_no, estate_agent_name")
            .order("registration_no")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not data:
            break

        for row in data:
            reg_no = normalize_text(row.get("registration_no"))
            if reg_no:
                existing[reg_no] = normalize_agency(row.get("estate_agent_name"))

        if len(data) < page_size:
            break
        offset += page_size

    return existing


def read_current_agents(csv_path: Path | str) -> dict[str, str | None]:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Agents CSV not found: {path}")
    df = pd.read_csv(path, dtype=str)
    current: dict[str, str | None] = {}
    for row in df.to_dict(orient="records"):
        reg_no = normalize_text(row.get("registration_no"))
        if not reg_no:
            continue
        current[reg_no] = normalize_agency(row.get("estate_agent_name"))
    return current


def detect_movements(
    *,
    csv_path: Path | str = DEFAULT_AGENTS_CSV,
    movement_date: str | None = None,
) -> list[dict]:
    prev_map = fetch_existing_agents()
    curr_map = read_current_agents(csv_path)
    date_value = movement_date or utc_today_iso()

    prev_keys = set(prev_map.keys())
    curr_keys = set(curr_map.keys())
    movements: list[dict] = []

    for reg_no in sorted(curr_keys - prev_keys):
        movements.append(
            {
                "registration_no": reg_no,
                "movement_date": date_value,
                "movement_type": "NEW_REGISTRATION",
                "from_agency": None,
                "to_agency": curr_map.get(reg_no),
            }
        )

    for reg_no in sorted(prev_keys - curr_keys):
        movements.append(
            {
                "registration_no": reg_no,
                "movement_date": date_value,
                "movement_type": "REGISTRY_REMOVED",
                "from_agency": prev_map.get(reg_no),
                "to_agency": None,
            }
        )

    for reg_no in sorted(prev_keys & curr_keys):
        prev_agency = prev_map.get(reg_no)
        curr_agency = curr_map.get(reg_no)
        if prev_agency != curr_agency:
            movements.append(
                {
                    "registration_no": reg_no,
                    "movement_date": date_value,
                    "movement_type": "AGENCY_TRANSFER",
                    "from_agency": prev_agency,
                    "to_agency": curr_agency,
                }
            )

    return movements


def run_movement_detection(
    *,
    csv_path: Path | str = DEFAULT_AGENTS_CSV,
    movement_date: str | None = None,
    dry_run: bool = False,
) -> dict:
    movements = detect_movements(csv_path=csv_path, movement_date=movement_date)
    print(f"[movements] detected={len(movements)}")
    for row in movements[:10]:
        print(
            f"  {row['movement_type']} | {row['registration_no']} | "
            f"{row['from_agency']} -> {row['to_agency']}"
        )

    if dry_run or not movements:
        return {"dataset": "movements", "fetched": len(movements), "written": 0}

    client = create_supabase_service_client()
    written = 0
    for batch in chunked(movements, BATCH_SIZE):
        client.table("cea_agent_movements").upsert(
            list(batch),
            on_conflict="registration_no,movement_date,movement_type,from_agency,to_agency",
        ).execute()
        written += len(batch)

    print(f"[movements] upserted={written}")
    return {"dataset": "movements", "fetched": len(movements), "written": written}


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect agent movements")
    parser.add_argument(
        "--csv-path",
        default=str(DEFAULT_AGENTS_CSV),
        help="Path to CEASalespersonInformation.csv",
    )
    parser.add_argument(
        "--movement-date",
        default=None,
        help="Override movement date (YYYY-MM-DD). Defaults to UTC today.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_movement_detection(
        csv_path=args.csv_path,
        movement_date=args.movement_date,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()

