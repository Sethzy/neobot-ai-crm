"""Tests for URA transaction flattening and landed-project normalization behavior."""

import pytest

from src.ingest_ura_transactions import flatten_batch_items


def test_flatten_batch_items_landed_uses_street_as_project() -> None:
    """When URA returns project='N.A.' for a landed house, use the street."""
    items = [
        {
            "project": "N.A.",
            "street": "112 ARTHUR ROAD",
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

    assert len(rows) == 1
    assert rows[0]["project"] == "112 ARTHUR ROAD"
    assert rows[0]["street"] == "112 ARTHUR ROAD"


def test_flatten_batch_items_condo_project_unchanged() -> None:
    """Named condo projects must not be modified by landed normalization."""
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


@pytest.mark.parametrize(
    "sentinel",
    ["N.A.", "n.a.", "N.a.", "NA", "N/A", "LANDED HOUSING DEVELOPMENT"],
)
def test_flatten_batch_items_landed_na_variants(sentinel: str) -> None:
    """Common URA placeholder variants should trigger street substitution."""
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


@pytest.mark.parametrize(
    "property_type",
    [
        "Detached",
        "Semi-detached",
        "Terrace",
        "Strata Terrace",
        "Detached House",
        "Semi-Detached House",
        "Terrace House",
        "Bungalow",
    ],
)
def test_flatten_batch_items_landed_property_type_variants(property_type: str) -> None:
    """Common landed property type variants should trigger substitution."""
    items = [
        {
            "project": "LANDED HOUSING DEVELOPMENT",
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
                    "propertyType": property_type,
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


def test_flatten_batch_items_landed_no_street_is_skipped() -> None:
    """If project is N.A. and street is empty, skip the row entirely."""
    items = [
        {
            "project": "N.A.",
            "street": None,
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


def test_flatten_batch_items_non_landed_placeholder_project_unchanged() -> None:
    """Do not rewrite placeholder-like project names for non-landed records."""
    items = [
        {
            "project": "LANDED HOUSING DEVELOPMENT",
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
    assert rows[0]["project"] == "LANDED HOUSING DEVELOPMENT"
