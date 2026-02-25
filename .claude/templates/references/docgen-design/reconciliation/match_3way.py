"""
3-Way Document Matching - Groups POs, invoices, and delivery orders by PO reference.

This script is the first phase of 3-way reconciliation. It takes extracted document
splits and groups them into sets for downstream line-item matching.

Usage:
    python match_3way.py --input splits.json --output grouped.json
"""

import argparse
import json
import re
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class DocumentGroup:
    """A group of related documents linked by PO reference."""
    po: Optional[dict] = None
    invoices: list = field(default_factory=list)
    deliveries: list = field(default_factory=list)
    match_status: str = "pending"  # complete, partial, unmatched, unauthorized
    flags: list = field(default_factory=list)  # e.g., ['consolidated_invoice']

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_po_number(po_ref: str) -> str:
    """
    Normalize PO reference for consistent matching.

    Handles variations like:
    - "PO-2024-001" vs "PO2024001" vs "2024-001"
    - Leading zeros: "PO-001" vs "PO-1"
    - Case insensitivity: "po-001" vs "PO-001"

    Args:
        po_ref: Raw PO reference string from document

    Returns:
        Normalized PO reference for comparison
    """
    if not po_ref:
        return ""

    # Convert to uppercase
    normalized = po_ref.upper().strip()

    # Remove common prefixes
    normalized = re.sub(r'^(PO|P\.O\.|PURCHASE\s*ORDER)[-\s:#]*', '', normalized)

    # Remove all non-alphanumeric except hyphens
    normalized = re.sub(r'[^A-Z0-9-]', '', normalized)

    # Remove leading zeros from numeric segments
    parts = normalized.split('-')
    normalized_parts = []
    for part in parts:
        if part.isdigit():
            normalized_parts.append(str(int(part)))  # Removes leading zeros
        else:
            normalized_parts.append(part)

    return '-'.join(normalized_parts)


def extract_po_reference(doc: dict) -> Optional[str]:
    """
    Extract PO reference from a document based on its type.

    For POs: use po_number field
    For invoices/DOs: use po_reference field

    Args:
        doc: Extracted document with tag_id and fields

    Returns:
        Normalized PO reference or None if not found
    """
    tag = doc.get('tag_id', '').lower()

    # Check common field names for PO reference
    po_fields = ['po_number', 'po_reference', 'purchase_order_number',
                 'order_number', 'order_ref', 'reference']

    for field_name in po_fields:
        if field_name in doc:
            ref = doc[field_name]
            if ref:
                return normalize_po_number(str(ref))

    # Check nested 'fields' or 'extracted_data' structures
    for container in ['fields', 'extracted_data', 'data']:
        if container in doc and isinstance(doc[container], dict):
            for field_name in po_fields:
                if field_name in doc[container]:
                    ref = doc[container][field_name]
                    if ref:
                        return normalize_po_number(str(ref))

    return None


def classify_document(doc: dict) -> str:
    """
    Classify document type from tag_id.

    Args:
        doc: Document with tag_id field

    Returns:
        One of: 'po', 'invoice', 'delivery', 'unknown'
    """
    tag = doc.get('tag_id', '').lower()

    if 'purchase' in tag or tag == 'po':
        return 'po'
    elif 'invoice' in tag:
        return 'invoice'
    elif 'delivery' in tag or 'do' == tag or 'goods_receipt' in tag:
        return 'delivery'
    else:
        return 'unknown'


def group_documents(splits: list) -> dict:
    """
    Group documents by PO reference number.

    This is the main entry point for document grouping. It:
    1. Indexes all POs by their po_number
    2. Matches invoices and DOs to POs by po_reference
    3. Identifies orphan documents (unauthorized invoices, unmatched POs)

    Args:
        splits: List of extracted document dictionaries with tag_id

    Returns:
        Dictionary with:
        - grouped_sets: List of DocumentGroup objects
        - stats: Summary statistics
        - orphan_invoices: Invoices without PO reference (unauthorized)
        - orphan_deliveries: Deliveries without PO reference
    """
    # Separate documents by type
    pos = []
    invoices = []
    deliveries = []
    unknown = []

    for doc in splits:
        doc_type = classify_document(doc)
        if doc_type == 'po':
            pos.append(doc)
        elif doc_type == 'invoice':
            invoices.append(doc)
        elif doc_type == 'delivery':
            deliveries.append(doc)
        else:
            unknown.append(doc)

    # Index POs by normalized po_number
    po_index: dict[str, DocumentGroup] = {}
    for po in pos:
        po_ref = extract_po_reference(po)
        if po_ref:
            if po_ref not in po_index:
                po_index[po_ref] = DocumentGroup(po=po)
            else:
                # Duplicate PO number - use latest by date or keep first
                existing = po_index[po_ref]
                if _is_newer_document(po, existing.po):
                    existing.po = po

    # Match invoices to POs
    orphan_invoices = []
    for inv in invoices:
        po_ref = extract_po_reference(inv)
        if po_ref and po_ref in po_index:
            po_index[po_ref].invoices.append(inv)
        elif po_ref:
            # Invoice references a PO we don't have - create placeholder
            if po_ref not in po_index:
                po_index[po_ref] = DocumentGroup()
            po_index[po_ref].invoices.append(inv)
        else:
            # No PO reference - unauthorized
            orphan_invoices.append(inv)

    # Match deliveries to POs
    orphan_deliveries = []
    for do in deliveries:
        po_ref = extract_po_reference(do)
        if po_ref and po_ref in po_index:
            po_index[po_ref].deliveries.append(do)
        elif po_ref:
            # Delivery references a PO we don't have - create placeholder
            if po_ref not in po_index:
                po_index[po_ref] = DocumentGroup()
            po_index[po_ref].deliveries.append(do)
        else:
            # No PO reference
            orphan_deliveries.append(do)

    # Classify match status and check for flags
    for po_ref, group in po_index.items():
        group.match_status = _determine_match_status(group)
        _check_consolidated_invoice(group)

    # Build result
    grouped_sets = [group.to_dict() for group in po_index.values()]

    # Add unauthorized groups for orphan invoices
    for inv in orphan_invoices:
        grouped_sets.append({
            'po': None,
            'invoices': [inv],
            'deliveries': [],
            'match_status': 'unauthorized'
        })

    stats = {
        'total_documents': len(splits),
        'purchase_orders': len(pos),
        'invoices': len(invoices),
        'deliveries': len(deliveries),
        'unknown': len(unknown),
        'groups_complete': sum(1 for g in grouped_sets if g['match_status'] == 'complete'),
        'groups_partial': sum(1 for g in grouped_sets if g['match_status'] == 'partial'),
        'groups_unmatched': sum(1 for g in grouped_sets if g['match_status'] == 'unmatched'),
        'groups_unauthorized': sum(1 for g in grouped_sets if g['match_status'] == 'unauthorized'),
        'groups_with_flags': sum(1 for g in grouped_sets if g.get('flags')),
        'orphan_invoices': len(orphan_invoices),
        'orphan_deliveries': len(orphan_deliveries)
    }

    return {
        'grouped_sets': grouped_sets,
        'stats': stats,
        'orphan_invoices': orphan_invoices,
        'orphan_deliveries': orphan_deliveries,
        'unknown_documents': unknown
    }


def _determine_match_status(group: DocumentGroup) -> str:
    """
    Determine the match status of a document group.

    - complete: PO + at least 1 invoice + at least 1 delivery
    - partial: PO + some but not all expected documents
    - unmatched: PO only, no invoices or deliveries
    - unauthorized: Invoice(s) without PO
    """
    has_po = group.po is not None
    has_invoices = len(group.invoices) > 0
    has_deliveries = len(group.deliveries) > 0

    if not has_po:
        if has_invoices:
            return 'unauthorized'
        else:
            return 'orphan'

    if has_invoices and has_deliveries:
        return 'complete'
    elif has_invoices or has_deliveries:
        return 'partial'
    else:
        return 'unmatched'


def _is_newer_document(doc1: dict, doc2: dict) -> bool:
    """
    Compare document dates to determine which is newer.

    Used for handling revised documents (keep latest version).
    """
    date_fields = ['date', 'document_date', 'issue_date', 'invoice_date']

    date1 = None
    date2 = None

    for field in date_fields:
        if not date1 and field in doc1:
            date1 = doc1[field]
        if not date2 and field in doc2:
            date2 = doc2[field]

    if date1 and date2:
        # Simple string comparison works for ISO dates
        return str(date1) > str(date2)

    return False


def _extract_total(doc: dict) -> Optional[float]:
    """
    Extract total amount from a document.

    Checks common field names for document totals.
    """
    if not doc:
        return None

    total_fields = ['total', 'total_amount', 'grand_total', 'amount', 'invoice_total']

    for field_name in total_fields:
        if field_name in doc and doc[field_name] is not None:
            try:
                val = str(doc[field_name]).replace(',', '').replace('$', '')
                return float(val)
            except (ValueError, TypeError):
                continue

    return None


def _check_consolidated_invoice(group: DocumentGroup) -> None:
    """
    Check if any invoice in the group appears to be consolidated.

    A consolidated invoice covers multiple POs - detected when invoice total
    significantly exceeds the PO total. Adds 'consolidated_invoice' flag.
    """
    if not group.po or not group.invoices:
        return

    po_total = _extract_total(group.po)
    if not po_total or po_total <= 0:
        return

    for inv in group.invoices:
        inv_total = _extract_total(inv)
        if inv_total and inv_total > po_total * 1.1:  # Invoice 10%+ larger
            group.flags.append('consolidated_invoice')
            return  # Only flag once per group


def main():
    """CLI entry point for document grouping."""
    parser = argparse.ArgumentParser(
        description='Group documents by PO reference for 3-way matching'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input JSON file with extracted document splits'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='Output JSON file for grouped document sets'
    )
    parser.add_argument(
        '--pretty', '-p',
        action='store_true',
        help='Pretty-print output JSON'
    )

    args = parser.parse_args()

    # Load input
    with open(args.input, 'r') as f:
        splits = json.load(f)

    # Handle both array and object with 'splits' key
    if isinstance(splits, dict) and 'splits' in splits:
        splits = splits['splits']

    # Group documents
    result = group_documents(splits)

    # Write output
    with open(args.output, 'w') as f:
        if args.pretty:
            json.dump(result, f, indent=2, default=str)
        else:
            json.dump(result, f, default=str)

    # Print summary
    stats = result['stats']
    print(f"Processed {stats['total_documents']} documents")
    print(f"  POs: {stats['purchase_orders']}")
    print(f"  Invoices: {stats['invoices']}")
    print(f"  Deliveries: {stats['deliveries']}")
    print(f"\nGrouping results:")
    print(f"  Complete matches: {stats['groups_complete']}")
    print(f"  Partial matches: {stats['groups_partial']}")
    print(f"  Unmatched POs: {stats['groups_unmatched']}")
    print(f"  Unauthorized: {stats['groups_unauthorized']}")
    if stats['groups_with_flags']:
        print(f"  Groups with flags: {stats['groups_with_flags']}")


if __name__ == '__main__':
    main()
