# Landed Properties Fix — Implementation Tasklist

**Date:** 2026-03-02
**Goal:** Make landed houses (Detached, Semi-Detached, Terrace) discoverable and correctly profiled in the private properties section.

---

## Problem Summary

URA returns `project = "N.A."` for all landed houses, with the actual street address in `street`. The current codebase stores this verbatim, which causes three bugs:

1. **Search is broken** — `fetchPropertySuggestions` searches `project ILIKE '%q%'`. No landed property matches any real address query. They are effectively hidden from the search UI.
2. **Profile page shows wrong title** — If a user landed on a "N.A." profile, the heading would say "N.A." and the page would aggregate ALL landed transactions in that district into one blob.
3. **URL slugs are meaningless** — All landed properties in a district would resolve to the same slug (e.g., `n-a-d14`), with no way to link to an individual address.

---

## Chosen Fix: Normalise at ingest

In `flatten_batch_items` in the pipeline, substitute `street` as the `project` value when `project` is "N.A." (case-insensitive). This makes each landed address a distinct "project" — it gets its own slug, its own profile page, and surfaces correctly in search with no changes to the frontend.

This is a **data fix** — the frontend code already handles any value in `project` correctly.

---

## Files

### Modify
- `scripts/property-pipeline/src/ingest_ura_transactions.py` — normalise "N.A." project values
- `scripts/property-pipeline/src/__tests__/test_ingest_ura_transactions.py` (create if absent) — unit tests

### No frontend changes required
All frontend code (`fetchPropertySuggestions`, `resolvePropertyContext`, profile page, transactions table) works correctly once the data is fixed.

---

## Context You Need

### How the pipeline works

`ingest_ura_transactions.py` → `flatten_batch_items(items)` → each `item` is a URA project record with:
- `item["project"]` — project name (e.g. `"MARINA BAY RESIDENCES"`) or `"N.A."` for landed
- `item["street"]` — street address (e.g. `"112 ARTHUR ROAD"`)
- `item["transaction"]` — list of individual transaction records nested inside

The function already calls `normalize_text()` on both fields. `normalize_text("N.A.")` returns `"N.A."` unchanged.

The check `if not project: continue` skips items where project is null/empty — but `"N.A."` is truthy so it passes through.

### What the frontend expects

The `project` column is the primary identity key for all queries:
- `fetchPropertySuggestions`: `.ilike("project", '%q%')`
- `fetchPropertyProfile`: `.eq("project", context.project)`
- `resolvePropertyContext`: deduplicates on `project::district`

If `project = "112 ARTHUR ROAD"`, searching "arthur" finds it, and the profile page title reads "112 ARTHUR ROAD". This is exactly what we want.

### Landed property types

The URA `property_type` values for landed are: `"Detached House"`, `"Semi-Detached House"`, `"Terrace House"`. These differ from strata types (`"Condominium"`, `"Apartment"`, etc.).

### The "N.A." sentinel

The URA API uses `"N.A."` (with period, capital letters) consistently for landed houses. The fix should be case-insensitive to guard against any upstream variation (`"N.a."`, `"n.a."`, `"NA"`, `"N/A"`).

---

## Task 1 — Normalise "N.A." project values at ingest

**File:** `scripts/property-pipeline/src/ingest_ura_transactions.py`

### Step 1: Write a failing test

Create `scripts/property-pipeline/src/__tests__/test_ingest_ura_transactions.py` (create `__tests__` dir if absent, or add to existing test file if one exists).

Write a test for the new behavior:

```python
def test_flatten_batch_items_landed_uses_street_as_project():
    """When URA returns project='N.A.' for a landed house, the street address
    should be used as the project identifier instead."""
    items = [
        {
            "project": "N.A.",
            "street": "112 ARTHUR ROAD",
            "marketSegment": "Landed",
            "x": None,
            "y": None,
            "transaction": [
                {
                    "contractDate": "0124",   # Jan 2024
                    "price": "6500000",
                    "area": "450",
                    "floorRange": None,
                    "propertyType": "Detached House",
                    "tenure": "Freehold",
                    "typeOfSale": "3",         # Resale
                    "typeOfArea": "Land",
                    "noOfUnits": "1",
                    "nettPrice": None,
                    "district": "14",
                }
            ],
        }
    ]

    rows = flatten_batch_items(items)

    assert len(rows) == 1
    assert rows[0]["project"] == "112 ARTHUR ROAD"
    assert rows[0]["street"] == "112 ARTHUR ROAD"
```

Run the test and confirm it fails (project will be `"N.A."` before the fix).

### Step 2: Also test existing condo behaviour is unchanged

Add a second test to confirm normal condo projects are not affected:

```python
def test_flatten_batch_items_condo_project_unchanged():
    """Named condo projects must not be modified by the landed normalisation."""
    items = [
        {
            "project": "MARINA BAY RESIDENCES",
            "street": "BAYFRONT AVENUE",
            "marketSegment": "Core Central Region",
            "x": None,
            "y": None,
            "transaction": [
                {
                    "contractDate": "0124",
                    "price": "3000000",
                    "area": "100",
                    "floorRange": "06 TO 10",
                    "propertyType": "Condominium",
                    "tenure": "99-year Leasehold",
                    "typeOfSale": "3",
                    "typeOfArea": "Strata",
                    "noOfUnits": "1",
                    "nettPrice": None,
                    "district": "01",
                }
            ],
        }
    ]

    rows = flatten_batch_items(items)

    assert len(rows) == 1
    assert rows[0]["project"] == "MARINA BAY RESIDENCES"
```

Run and confirm this test is already green (no fix needed to pass it).

### Step 3: Test case-insensitive sentinel matching

Add a third test covering variant casings:

```python
import pytest

@pytest.mark.parametrize("sentinel", ["N.A.", "n.a.", "N.a.", "NA", "N/A"])
def test_flatten_batch_items_landed_na_variants(sentinel):
    """All common 'N.A.' variants from URA should trigger street-as-project substitution."""
    items = [
        {
            "project": sentinel,
            "street": "10 NASSIM ROAD",
            "marketSegment": "Landed",
            "x": None,
            "y": None,
            "transaction": [
                {
                    "contractDate": "0124",
                    "price": "15000000",
                    "area": "900",
                    "floorRange": None,
                    "propertyType": "Detached House",
                    "tenure": "Freehold",
                    "typeOfSale": "3",
                    "typeOfArea": "Land",
                    "noOfUnits": "1",
                    "nettPrice": None,
                    "district": "10",
                }
            ],
        }
    ]

    rows = flatten_batch_items(items)
    assert rows[0]["project"] == "10 NASSIM ROAD"
```

Run and confirm all three parametrized cases fail.

### Step 4: Test that missing street falls back gracefully

Add a test for the edge case where `project = "N.A."` AND `street` is also null/empty. The row should be skipped (not inserted with a null project):

```python
def test_flatten_batch_items_landed_no_street_is_skipped():
    """If project is 'N.A.' and street is also empty, skip the row entirely
    (same as skipping a row with no project)."""
    items = [
        {
            "project": "N.A.",
            "street": None,     # No street address — can't identify the property
            "marketSegment": "Landed",
            "x": None,
            "y": None,
            "transaction": [
                {
                    "contractDate": "0124",
                    "price": "6500000",
                    "area": "450",
                    "floorRange": None,
                    "propertyType": "Detached House",
                    "tenure": "Freehold",
                    "typeOfSale": "3",
                    "typeOfArea": "Land",
                    "noOfUnits": "1",
                    "nettPrice": None,
                    "district": "14",
                }
            ],
        }
    ]

    rows = flatten_batch_items(items)
    assert len(rows) == 0
```

Run and confirm this fails (currently "N.A." rows are not skipped, they're just inserted with `project = "N.A."`).

### Step 5: Implement the fix

In `flatten_batch_items` in `ingest_ura_transactions.py`, after the existing `project = normalize_text(item.get("project"))` line, add the landed normalisation:

```python
# URA uses "N.A." as the project name for all landed properties (detached,
# semi-detached, terrace). Substitute the street address so each property
# gets a unique, meaningful identity. Fall back to skipping if street is
# also absent.
NA_SENTINELS = {"n.a.", "na", "n/a"}
if project and project.lower().replace(".", "").replace("/", "").strip() in NA_SENTINELS:
    project = street  # may be None — the `if not project: continue` below handles that
```

The existing guard `if not project: continue` already handles the case where `street` is also None — the row will be skipped.

### Step 6: Re-run all four tests and confirm green

```bash
cd scripts/property-pipeline
python -m pytest src/__tests__/test_ingest_ura_transactions.py -v
```

All four tests must pass.

---

## Task 2 — Re-ingest the data

After the pipeline fix is verified, re-run the URA ingestion against the property Supabase project to reload the data with corrected project values.

### Step 1: Dry-run first

```bash
cd scripts/property-pipeline
python -m src.ingest_ura_transactions --dry-run
```

Inspect the first 5 rows printed. Confirm that landed rows show street addresses (e.g. `"112 ARTHUR ROAD"`) in the `project` column, not `"N.A."`.

### Step 2: Full ingest

Once dry-run looks correct:

```bash
python -m src.ingest_ura_transactions
```

This truncates and reloads `ura_transactions`. Expected: tens of thousands of rows. Wait for the "Done fetched=..., inserted=..." log line.

> **Note:** This is a full table truncate-and-reload. The URA pipeline is designed to be idempotent — safe to re-run at any time. There is no partial update path.

---

## Task 3 — Manual verification

After re-ingest, verify via the app UI:

1. Go to `/market/properties`.
2. Search **"arthur road"** — confirm landed results appear (e.g. "112 ARTHUR ROAD", "106C ARTHUR ROAD") alongside condos.
3. Click a landed result — confirm the profile page title reads the street address (e.g. "112 ARTHUR ROAD"), not "N.A.".
4. Confirm the district badge, property type badge, and transactions table render correctly.
5. Search **"N.A."** — confirm no results appear (or only legitimate projects named "N.A." if any).
6. Search a known condo (e.g. "marina bay") — confirm no regression.

---

## Definition of Done

- [ ] All four new Python unit tests pass.
- [ ] Full `pytest` suite in `scripts/property-pipeline` passes (no regressions).
- [ ] URA data re-ingested.
- [ ] Landed houses discoverable by street address in the properties search UI.
- [ ] Profile page for a landed house shows street address as title, not "N.A.".
- [ ] Condo search unaffected.
