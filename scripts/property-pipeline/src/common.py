from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Sequence, TypeVar

from dotenv import load_dotenv
from supabase import Client, create_client

T = TypeVar("T")

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = REPO_ROOT / "data"

DEFAULT_AGENTS_CSV = DATA_ROOT / "cea" / "CEASalespersonInformation.csv"
DEFAULT_CEA_TXN_CSV = (
    DATA_ROOT / "cea" / "CEASalespersonsPropertyTransactionRecordsresidential.csv"
)
DEFAULT_HDB_DIR = DATA_ROOT / "hdb"

_ENV_LOADED = False


def load_pipeline_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    load_dotenv(PIPELINE_ROOT / ".env")
    _ENV_LOADED = True


def require_env(var_name: str) -> str:
    value = os.getenv(var_name)
    if not value:
        raise RuntimeError(f"Missing required env var: {var_name}")
    return value


def create_supabase_service_client() -> Client:
    load_pipeline_env()
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(supabase_url, service_role_key)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def chunked(seq: Sequence[T], size: int) -> Iterator[Sequence[T]]:
    if size <= 0:
        raise ValueError("size must be > 0")
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    return text


def normalize_dash(value: Any) -> str | None:
    text = normalize_text(value)
    if text == "-":
        return None
    return text


def to_float(value: Any) -> float | None:
    text = normalize_text(value)
    if text is None:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def to_int(value: Any) -> int | None:
    text = normalize_text(value)
    if text is None:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def safe_rpc_truncate(client: Client, table_name: str) -> None:
    client.rpc("truncate_property_table", {"table_name": table_name}).execute()


def log_pipeline_run(
    client: Client,
    *,
    dataset: str,
    records_fetched: int,
    records_written: int,
    started_at: str,
) -> None:
    client.table("pipeline_runs").insert(
        {
            "dataset": dataset,
            "records_fetched": records_fetched,
            "records_upserted": records_written,
            "started_at": started_at,
        }
    ).execute()


def list_hdb_csv_files(hdb_dir: Path = DEFAULT_HDB_DIR) -> list[Path]:
    if not hdb_dir.exists():
        raise FileNotFoundError(f"HDB directory not found: {hdb_dir}")
    files = sorted(hdb_dir.glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"No CSV files found under: {hdb_dir}")
    return files
