"""Enrich cea_agents with contact info scraped from OpenAgent.sg.

For each registration number in our database, fetches the public agent
profile at openagent.sg/agent/{regNo} and extracts phone, WhatsApp,
email, and photo URL from the server-rendered HTML.

Usage:
    python -m src.enrich_agents_openagent                  # full run
    python -m src.enrich_agents_openagent --dry-run        # preview only
    python -m src.enrich_agents_openagent --limit 100      # first 100 agents
    python -m src.enrich_agents_openagent --resume R050000A  # resume from reg no
"""

from __future__ import annotations

import argparse
import random
import re
import time
from dataclasses import dataclass

import requests

from src.common import (
    chunked,
    create_supabase_service_client,
    log_pipeline_run,
    utc_now_iso,
)

DATASET = "agent_contact_enrichment"
OPENAGENT_BASE = "https://openagent.sg/agent"
BATCH_SIZE = 50

# Polite scraping: randomized delay between requests
MIN_DELAY = 1.0
MAX_DELAY = 3.0

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# Regex patterns to extract contact info from server-rendered HTML
RE_PHONE = re.compile(r'href="tel:([^"]+)"')
RE_WHATSAPP = re.compile(r'href="https://wa\.me/([^?"]+)')
RE_EMAIL = re.compile(r'href="mailto:([^?"]+)')
# Agent photo: <img src="...supabase.co/storage/.../R043039D.webp" alt="KUAH KAI PIN...">
RE_PHOTO = re.compile(
    r'<img\s+src="(https://[^"]+/agent-photos/[^"]+)"[^>]+alt="[A-Z]',
    re.IGNORECASE,
)


@dataclass
class AgentContact:
    """Extracted contact info for one agent."""

    registration_no: str
    mobile_phone: str | None = None
    email: str | None = None
    whatsapp_number: str | None = None
    photo_url: str | None = None

    @property
    def has_any(self) -> bool:
        return any([self.mobile_phone, self.email, self.whatsapp_number, self.photo_url])


def extract_contact(registration_no: str, html: str) -> AgentContact:
    """Parse contact info from OpenAgent HTML."""
    phone_match = RE_PHONE.search(html)
    wa_match = RE_WHATSAPP.search(html)
    email_match = RE_EMAIL.search(html)

    photo_match = RE_PHOTO.search(html)
    photo_url = photo_match.group(1) if photo_match else None

    return AgentContact(
        registration_no=registration_no,
        mobile_phone=phone_match.group(1) if phone_match else None,
        email=email_match.group(1) if email_match else None,
        whatsapp_number=wa_match.group(1) if wa_match else None,
        photo_url=photo_url,
    )


def fetch_agent_page(registration_no: str, session: requests.Session) -> str | None:
    """Fetch agent profile HTML. Returns None on 404 or error."""
    url = f"{OPENAGENT_BASE}/{registration_no}"
    try:
        resp = session.get(url, timeout=15)
        if resp.status_code == 200:
            return resp.text
        if resp.status_code == 404:
            return None
        print(f"  [{resp.status_code}] {registration_no}")
        return None
    except requests.RequestException as exc:
        print(f"  [ERROR] {registration_no}: {exc}")
        return None


def fetch_all_registration_numbers(
    client, *, resume_from: str | None = None, limit: int | None = None
) -> list[str]:
    """Get all registration numbers from cea_agents, optionally resuming."""
    query = (
        client.table("cea_agents")
        .select("registration_no")
        .order("registration_no", desc=False)
    )
    if resume_from:
        query = query.gte("registration_no", resume_from)
    if limit:
        query = query.limit(limit)
    else:
        # Supabase default limit is 1000 — paginate to get all
        all_rows: list[dict] = []
        page_size = 1000
        offset = 0
        while True:
            page_query = (
                client.table("cea_agents")
                .select("registration_no")
                .order("registration_no", desc=False)
            )
            if resume_from:
                page_query = page_query.gte("registration_no", resume_from)
            result = page_query.range(offset, offset + page_size - 1).execute()
            rows = result.data or []
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return [r["registration_no"] for r in all_rows]

    result = query.execute()
    return [r["registration_no"] for r in (result.data or [])]


def run_enrichment(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    resume_from: str | None = None,
) -> dict:
    """Main enrichment loop."""
    started_at = utc_now_iso()
    client = create_supabase_service_client()

    print("Fetching registration numbers from database...")
    reg_numbers = fetch_all_registration_numbers(
        client, resume_from=resume_from, limit=limit
    )
    total = len(reg_numbers)
    print(f"Found {total} agents to process.")

    if dry_run:
        print("[DRY RUN] Would scrape these agents:")
        for rn in reg_numbers[:10]:
            print(f"  {rn}")
        if total > 10:
            print(f"  ... and {total - 10} more")
        return {"total": total, "enriched": 0, "skipped": 0, "failed": 0}

    # Shuffle to avoid sequential pattern detection
    random.shuffle(reg_numbers)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    enriched = 0
    skipped = 0
    failed = 0
    updates: list[dict] = []

    for i, reg_no in enumerate(reg_numbers):
        if (i + 1) % 100 == 0 or i == 0:
            print(
                f"Progress: {i + 1}/{total} "
                f"(enriched={enriched}, skipped={skipped}, failed={failed})"
            )

        html = fetch_agent_page(reg_no, session)
        if html is None:
            failed += 1
        else:
            contact = extract_contact(reg_no, html)
            if contact.has_any:
                updates.append(
                    {
                        "registration_no": contact.registration_no,
                        "mobile_phone": contact.mobile_phone,
                        "email": contact.email,
                        "whatsapp_number": contact.whatsapp_number,
                        "photo_url": contact.photo_url,
                        "contact_source": "openagent",
                        "contact_updated_at": utc_now_iso(),
                    }
                )
                enriched += 1
            else:
                skipped += 1

        # Flush batch to database
        if len(updates) >= BATCH_SIZE:
            _flush_updates(client, updates)
            updates = []

        # Polite delay
        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    # Flush remaining
    if updates:
        _flush_updates(client, updates)

    print(
        f"\nDone. Total={total}, Enriched={enriched}, "
        f"Skipped={skipped}, Failed={failed}"
    )

    log_pipeline_run(
        client,
        dataset=DATASET,
        records_fetched=total,
        records_written=enriched,
        started_at=started_at,
    )

    return {
        "total": total,
        "enriched": enriched,
        "skipped": skipped,
        "failed": failed,
    }


def _flush_updates(client, updates: list[dict]) -> None:
    """Upsert a batch of contact updates into cea_agents."""
    for batch in chunked(updates, 100):
        client.table("cea_agents").upsert(
            list(batch), on_conflict="registration_no"
        ).execute()
    print(f"  Flushed {len(updates)} updates to database.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich agent contact info from OpenAgent.sg"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview only, no scraping or database writes.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N agents.",
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        metavar="REG_NO",
        help="Resume from this registration number (alphabetical).",
    )
    args = parser.parse_args()
    run_enrichment(dry_run=args.dry_run, limit=args.limit, resume_from=args.resume)


if __name__ == "__main__":
    main()
