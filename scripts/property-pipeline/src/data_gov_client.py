import time
import requests

BASE_URL = "https://data.gov.sg/api/action/datastore_search"
MAX_RETRIES = 10
RETRY_DELAY = 30  # seconds - exponential backoff starts here


class DataGovClient:
    """Client for Singapore data.gov.sg Datastore API."""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url

    def fetch_page(
        self, resource_id: str, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        """Fetch a single page of results. Retries on 429."""
        for attempt in range(MAX_RETRIES):
            resp = requests.get(
                self.base_url,
                params={"resource_id": resource_id, "limit": limit, "offset": offset},
                headers={"User-Agent": "SunderBot/1.0 (property-data-pipeline)"},
                timeout=30,
            )
            if resp.status_code == 429:
                wait = RETRY_DELAY * (attempt + 1)
                print(f"Rate limited (429). Waiting {wait}s before retry...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()["result"]["records"]
        raise Exception(f"Failed after {MAX_RETRIES} retries (429 rate limit)")

    def fetch_all(
        self, resource_id: str, page_size: int = 1000, delay: float = 10.0
    ) -> list[dict]:
        """Fetch all records with pagination. Returns full list."""
        all_records = []
        offset = 0

        # First call to get total (with retry for 429)
        data = None
        for attempt in range(MAX_RETRIES):
            resp = requests.get(
                self.base_url,
                params={"resource_id": resource_id, "limit": page_size, "offset": 0},
                headers={"User-Agent": "SunderBot/1.0 (property-data-pipeline)"},
                timeout=30,
            )
            if resp.status_code == 429:
                wait = RETRY_DELAY * (attempt + 1)
                print(f"Rate limited (429). Waiting {wait}s before retry...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()["result"]
            break
        
        if data is None:
            raise Exception(f"Failed after {MAX_RETRIES} retries (429 rate limit)")
        
        total = data["total"]
        all_records.extend(data["records"])
        offset += page_size

        print(f"Total records: {total}. Fetching in pages of {page_size}...")

        while offset < total:
            time.sleep(delay)
            page = self.fetch_page(resource_id, limit=page_size, offset=offset)
            all_records.extend(page)
            offset += page_size
            print(f"  Fetched {len(all_records)}/{total}")

        return all_records
