#!/usr/bin/env python3
"""Standalone agent contact enrichment script — runs on any machine with Python 3.9+.

Scrapes OpenAgent.sg for phone, WhatsApp, email, and photo for all CEA agents.
Writes results directly to the property Supabase database.

Usage:
    # Set env vars first
    export SUPABASE_URL="https://xxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="eyJ..."

    python3 enrich_standalone.py                  # full run
    python3 enrich_standalone.py --limit 50       # test with 50 agents
    python3 enrich_standalone.py --dry-run        # preview only

Requirements (install with pip):
    pip3 install requests supabase
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests
from supabase import create_client

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OPENAGENT_BASE = "https://openagent.sg/agent"
BATCH_SIZE = 50
WORKERS = 5          # concurrent request threads
MIN_DELAY = 0.3      # seconds between requests per thread
MAX_DELAY = 0.8

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# Regex patterns
RE_PHONE = re.compile(r'href="tel:([^"]+)"')
RE_WHATSAPP = re.compile(r'href="https://wa\.me/([^?"]+)')
RE_EMAIL = re.compile(r'href="mailto:([^?"]+)')
RE_PHOTO = re.compile(
    r'<img\s+src="(https://[^"]+/agent-photos/[^"]+)"[^>]+alt="[A-Z]',
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def extract_contact(reg_no: str, html: str) -> dict | None:
    """Parse contact info from OpenAgent HTML. Returns None if no data found."""
    phone = RE_PHONE.search(html)
    wa = RE_WHATSAPP.search(html)
    email = RE_EMAIL.search(html)
    photo = RE_PHOTO.search(html)

    result = {
        "registration_no": reg_no,
        "mobile_phone": phone.group(1) if phone else None,
        "whatsapp_number": wa.group(1) if wa else None,
        "email": email.group(1) if email else None,
        "photo_url": photo.group(1) if photo else None,
        "contact_source": "openagent",
        "contact_updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if not any([result["mobile_phone"], result["email"], result["whatsapp_number"], result["photo_url"]]):
        return None

    return result


def fetch_one(reg_no: str, session: requests.Session) -> dict | None:
    """Fetch and extract contact for one agent."""
    try:
        resp = session.get(f"{OPENAGENT_BASE}/{reg_no}", timeout=15)
        if resp.status_code == 200:
            return extract_contact(reg_no, resp.text)
        return None
    except requests.RequestException:
        return None
    finally:
        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def get_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
        sys.exit(1)
    return create_client(url, key)


def fetch_unenriched_reg_numbers(client) -> list[str]:
    """Get only agents that haven't been enriched yet."""
    all_numbers = []
    page_size = 1000
    offset = 0
    while True:
        result = (
            client.table("cea_agents")
            .select("registration_no")
            .or_("contact_source.is.null,contact_source.eq.none")
            .order("registration_no", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        all_numbers.extend(r["registration_no"] for r in rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_numbers


def flush_updates(client, updates: list[dict]) -> None:
    """Update contact columns for existing agents only."""
    for record in updates:
        reg_no = record["registration_no"]
        contact_fields = {
            k: v for k, v in record.items() if k != "registration_no"
        }
        client.table("cea_agents").update(contact_fields).eq(
            "registration_no", reg_no
        ).execute()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Enrich agent contacts from OpenAgent.sg")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=WORKERS)
    args = parser.parse_args()

    client = get_supabase()

    print("Fetching unenriched registration numbers...")
    reg_numbers = fetch_unenriched_reg_numbers(client)
    if args.limit:
        reg_numbers = reg_numbers[: args.limit]
    total = len(reg_numbers)
    print(f"Found {total} agents.")

    if args.dry_run:
        print(f"[DRY RUN] Would scrape {total} agents with {args.workers} workers.")
        print(f"Estimated time: ~{total * 0.55 / args.workers / 60:.0f} minutes")
        return

    # Shuffle to avoid sequential patterns
    random.shuffle(reg_numbers)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    enriched = 0
    failed = 0
    skipped = 0
    updates: list[dict] = []
    start_time = time.time()

    print(f"Starting with {args.workers} workers...")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(fetch_one, rn, session): rn for rn in reg_numbers
        }

        for i, future in enumerate(as_completed(futures)):
            reg_no = futures[future]
            try:
                result = future.result()
                if result:
                    updates.append(result)
                    enriched += 1
                else:
                    skipped += 1
            except Exception:
                failed += 1

            # Progress every 200
            done = i + 1
            if done % 200 == 0 or done == total:
                elapsed = time.time() - start_time
                rate = done / elapsed if elapsed > 0 else 0
                eta = (total - done) / rate / 60 if rate > 0 else 0
                print(
                    f"  [{done}/{total}] enriched={enriched} skipped={skipped} "
                    f"failed={failed} | {rate:.1f} req/s | ETA: {eta:.0f}min"
                )

            # Flush every BATCH_SIZE
            if len(updates) >= BATCH_SIZE:
                flush_updates(client, updates)
                updates = []

    # Final flush
    if updates:
        flush_updates(client, updates)

    elapsed = time.time() - start_time
    print(
        f"\nDone in {elapsed / 60:.1f} minutes. "
        f"Enriched={enriched}, Skipped={skipped}, Failed={failed}"
    )

    # Log the run
    client.table("pipeline_runs").insert({
        "dataset": "agent_contact_enrichment",
        "records_fetched": total,
        "records_upserted": enriched,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


if __name__ == "__main__":
    main()
