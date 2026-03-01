from __future__ import annotations

import argparse
import traceback
from typing import Callable

from src.detect_movements import run_movement_detection
from src.ingest_agents import run_agent_ingestion
from src.ingest_cea_transactions import run_cea_transaction_ingestion
from src.ingest_hdb_resale import run_hdb_resale_ingestion
from src.ingest_ura_transactions import run_ura_ingestion


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Singapore property data pipeline")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--agents-only", action="store_true")
    mode.add_argument("--cea-txn-only", action="store_true")
    mode.add_argument("--hdb-only", action="store_true")
    mode.add_argument("--ura-only", action="store_true")
    mode.add_argument("--movements-only", action="store_true")

    parser.add_argument(
        "--with-movements",
        action="store_true",
        help="Run movement detection before agent refresh during full pipeline runs.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    steps: list[tuple[str, Callable[[], dict]]] = []
    if args.agents_only:
        steps = [("agents", lambda: run_agent_ingestion(dry_run=args.dry_run))]
    elif args.cea_txn_only:
        steps = [
            ("cea_txn", lambda: run_cea_transaction_ingestion(dry_run=args.dry_run))
        ]
    elif args.hdb_only:
        steps = [("hdb", lambda: run_hdb_resale_ingestion(dry_run=args.dry_run))]
    elif args.ura_only:
        steps = [("ura", lambda: run_ura_ingestion(dry_run=args.dry_run))]
    elif args.movements_only:
        steps = [
            ("movements", lambda: run_movement_detection(dry_run=args.dry_run)),
        ]
    else:
        if args.with_movements:
            steps.append(
                ("movements", lambda: run_movement_detection(dry_run=args.dry_run))
            )
        steps.extend(
            [
                ("agents", lambda: run_agent_ingestion(dry_run=args.dry_run)),
                ("cea_txn", lambda: run_cea_transaction_ingestion(dry_run=args.dry_run)),
                ("hdb", lambda: run_hdb_resale_ingestion(dry_run=args.dry_run)),
                ("ura", lambda: run_ura_ingestion(dry_run=args.dry_run)),
            ]
        )

    print("[pipeline] Starting...")
    summaries: list[dict] = []
    for name, step in steps:
        print(f"[pipeline] Step={name}")
        try:
            summaries.append(step())
        except Exception as exc:  # noqa: BLE001
            print(f"[pipeline] FAILED step={name}: {exc}")
            traceback.print_exc()
            raise

    print("[pipeline] Complete")
    for summary in summaries:
        print(
            f"  {summary.get('dataset')}: fetched={summary.get('fetched')} "
            f"written={summary.get('written')}"
        )


if __name__ == "__main__":
    main()
