"""
Line Item Matching - Matches line items across PO, invoice, and delivery documents.

This script is the second phase of 3-way reconciliation. It takes grouped document
sets and matches individual line items using a tiered matching strategy:
1. Exact SKU match (high confidence)
2. Fuzzy description match (medium confidence)
3. Semantic similarity (low confidence, flagged for review)

Usage:
    python match_line_items.py --input grouped.json --output matched.json --threshold 0.8
"""

import argparse
import json
import re
from dataclasses import dataclass, field, asdict
from difflib import SequenceMatcher
from typing import Optional


@dataclass
class LineItemMatch:
    """A matched set of line items across documents."""
    po_line: Optional[dict] = None
    invoice_lines: list = field(default_factory=list)
    delivery_lines: list = field(default_factory=list)
    confidence: str = "none"  # high, medium, low, none
    match_reason: str = ""
    flags: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_sku(sku: str) -> str:
    """
    Normalize SKU/item code for comparison.

    Handles variations like:
    - "WDG-001" vs "WDG001" vs "wdg-001"
    - "ITEM-ABC-123" vs "ITEM ABC 123"

    Args:
        sku: Raw SKU string

    Returns:
        Normalized SKU for comparison
    """
    if not sku:
        return ""

    # Uppercase and strip
    normalized = str(sku).upper().strip()

    # Remove all non-alphanumeric
    normalized = re.sub(r'[^A-Z0-9]', '', normalized)

    return normalized


def normalize_description(desc: str) -> str:
    """
    Normalize description for fuzzy matching.

    Removes common noise words and normalizes whitespace.

    Args:
        desc: Raw description string

    Returns:
        Normalized description for comparison
    """
    if not desc:
        return ""

    # Lowercase and strip
    normalized = str(desc).lower().strip()

    # Remove common noise
    noise_words = ['the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'to']
    words = normalized.split()
    words = [w for w in words if w not in noise_words]

    # Remove punctuation except hyphens
    normalized = ' '.join(words)
    normalized = re.sub(r'[^\w\s-]', '', normalized)

    # Normalize whitespace
    normalized = ' '.join(normalized.split())

    return normalized


def fuzzy_similarity(str1: str, str2: str) -> tuple[float, str]:
    """
    Calculate fuzzy similarity ratio between two strings with number awareness.

    Uses SequenceMatcher plus number extraction. If both strings contain
    the same numbers (e.g., "50mm" and "50 mm widget"), boosts confidence
    since matching dimensions/quantities often indicate the same item.

    Args:
        str1: First string
        str2: Second string

    Returns:
        Tuple of (similarity score 0.0-1.0, match method used)
    """
    if not str1 or not str2:
        return 0.0, "none"

    base_score = SequenceMatcher(None, str1, str2).ratio()

    # Extract numbers from both strings
    nums1 = set(re.findall(r'\d+(?:\.\d+)?', str1))
    nums2 = set(re.findall(r'\d+(?:\.\d+)?', str2))

    # If both have numbers and they overlap, boost the score
    if nums1 and nums2 and (nums1 & nums2):
        return max(base_score, 0.6), "number_match"

    return base_score, "fuzzy"


def extract_line_items(doc: dict) -> list:
    """
    Extract line items from a document.

    Handles various document structures and field naming conventions.

    Args:
        doc: Document dictionary

    Returns:
        List of line item dictionaries with normalized fields
    """
    items = []

    # Check common locations for line items
    item_fields = ['line_items', 'items', 'order_lines', 'lines', 'products']

    raw_items = None
    for field_name in item_fields:
        if field_name in doc and isinstance(doc[field_name], list):
            raw_items = doc[field_name]
            break
        # Check nested structures
        for container in ['fields', 'extracted_data', 'data']:
            if container in doc and isinstance(doc[container], dict):
                if field_name in doc[container]:
                    raw_items = doc[container][field_name]
                    break
        if raw_items:
            break

    if not raw_items:
        return items

    # Normalize each line item
    for idx, item in enumerate(raw_items):
        normalized = {
            'original': item,
            'index': idx,
            'sku': _extract_field(item, ['sku', 'item_code', 'product_code', 'part_number', 'code']),
            'description': _extract_field(item, ['description', 'name', 'product_name', 'item_name', 'desc']),
            'quantity': _extract_numeric(item, ['quantity', 'qty', 'ordered_qty', 'received_qty']),
            'unit_price': _extract_numeric(item, ['unit_price', 'price', 'rate', 'unit_cost']),
            'total': _extract_numeric(item, ['total', 'amount', 'line_total', 'extended_price']),
            'uom': _extract_field(item, ['uom', 'unit', 'unit_of_measure'])
        }
        items.append(normalized)

    return items


def _extract_field(item: dict, field_names: list) -> Optional[str]:
    """Extract first matching field value as string."""
    for name in field_names:
        if name in item and item[name]:
            return str(item[name]).strip()
    return None


def _extract_numeric(item: dict, field_names: list) -> Optional[float]:
    """Extract first matching field value as number."""
    for name in field_names:
        if name in item and item[name] is not None:
            try:
                # Handle string numbers with commas
                val = str(item[name]).replace(',', '')
                return float(val)
            except (ValueError, TypeError):
                continue
    return None


def match_line_items_in_group(group: dict, threshold: float = 0.8) -> dict:
    """
    Match line items within a document group.

    For each PO line item, finds matching invoice and delivery lines.
    Also identifies unmatched items from invoices/deliveries.

    Args:
        group: Document group with po, invoices, deliveries
        threshold: Minimum fuzzy match threshold (0-1)

    Returns:
        Dictionary with matched_items, unmatched_po_lines,
        unmatched_invoice_lines, unmatched_delivery_lines
    """
    matched_items = []
    unmatched_po_lines = []
    unmatched_invoice_lines = []
    unmatched_delivery_lines = []

    # Extract line items from all documents
    po_items = []
    if group.get('po'):
        po_items = extract_line_items(group['po'])

    invoice_items = []
    for inv in group.get('invoices', []):
        items = extract_line_items(inv)
        for item in items:
            item['source_doc'] = inv.get('document_id', inv.get('filename', 'unknown'))
        invoice_items.extend(items)

    delivery_items = []
    for do in group.get('deliveries', []):
        items = extract_line_items(do)
        for item in items:
            item['source_doc'] = do.get('document_id', do.get('filename', 'unknown'))
        delivery_items.extend(items)

    # Track which items have been matched
    matched_invoice_indices = set()
    matched_delivery_indices = set()

    # Match each PO line item
    for po_item in po_items:
        match = LineItemMatch(po_line=po_item)

        # Find matching invoice lines
        inv_matches = _find_matching_items(
            po_item, invoice_items, threshold, matched_invoice_indices
        )
        for inv_item, confidence, reason in inv_matches:
            match.invoice_lines.append(inv_item)
            matched_invoice_indices.add(id(inv_item))

        # Find matching delivery lines
        del_matches = _find_matching_items(
            po_item, delivery_items, threshold, matched_delivery_indices
        )
        for del_item, confidence, reason in del_matches:
            match.delivery_lines.append(del_item)
            matched_delivery_indices.add(id(del_item))

        # Determine overall match confidence
        if match.invoice_lines or match.delivery_lines:
            match.confidence = _determine_confidence(inv_matches, del_matches)
            match.match_reason = _summarize_match_reasons(inv_matches, del_matches)
            matched_items.append(match.to_dict())
        else:
            unmatched_po_lines.append(po_item)

    # Collect unmatched invoice and delivery lines
    for item in invoice_items:
        if id(item) not in matched_invoice_indices:
            unmatched_invoice_lines.append(item)

    for item in delivery_items:
        if id(item) not in matched_delivery_indices:
            unmatched_delivery_lines.append(item)

    return {
        'matched_items': matched_items,
        'unmatched_po_lines': unmatched_po_lines,
        'unmatched_invoice_lines': unmatched_invoice_lines,
        'unmatched_delivery_lines': unmatched_delivery_lines,
        'stats': {
            'total_po_lines': len(po_items),
            'total_invoice_lines': len(invoice_items),
            'total_delivery_lines': len(delivery_items),
            'matched': len(matched_items),
            'unmatched_po': len(unmatched_po_lines),
            'unmatched_invoice': len(unmatched_invoice_lines),
            'unmatched_delivery': len(unmatched_delivery_lines)
        }
    }


def _find_matching_items(
    source_item: dict,
    candidates: list,
    threshold: float,
    already_matched: set
) -> list:
    """
    Find items matching a source item from candidates.

    Returns list of (item, confidence, reason) tuples.
    """
    matches = []

    source_sku = normalize_sku(source_item.get('sku', ''))
    source_desc = normalize_description(source_item.get('description', ''))

    for candidate in candidates:
        if id(candidate) in already_matched:
            continue

        cand_sku = normalize_sku(candidate.get('sku', ''))
        cand_desc = normalize_description(candidate.get('description', ''))

        # Try exact SKU match first (high confidence)
        if source_sku and cand_sku and source_sku == cand_sku:
            matches.append((candidate, 'high', f'SKU match: {source_sku}'))
            continue

        # Try fuzzy description match (medium confidence)
        if source_desc and cand_desc:
            similarity, match_method = fuzzy_similarity(source_desc, cand_desc)
            if similarity >= threshold:
                reason = f'Description match ({similarity:.0%}): "{source_desc[:30]}..."'
                if match_method == "number_match":
                    reason = f'Number+description match ({similarity:.0%}): "{source_desc[:30]}..."'
                matches.append((candidate, 'medium', reason))
                continue

        # Semantic matching happens outside the container - Claude reviews
        # unmatched items after script completes and reasons about matches

    return matches


def _determine_confidence(inv_matches: list, del_matches: list) -> str:
    """Determine overall confidence from individual matches."""
    all_matches = inv_matches + del_matches

    if not all_matches:
        return 'none'

    confidences = [m[1] for m in all_matches]

    if all(c == 'high' for c in confidences):
        return 'high'
    elif any(c == 'low' for c in confidences):
        return 'low'
    else:
        return 'medium'


def _summarize_match_reasons(inv_matches: list, del_matches: list) -> str:
    """Summarize match reasons for reporting."""
    reasons = []
    for _, _, reason in inv_matches + del_matches:
        if reason not in reasons:
            reasons.append(reason)
    return '; '.join(reasons[:3])  # Limit to 3 reasons


def match_items(grouped_data: dict, threshold: float = 0.8) -> dict:
    """
    Main entry point for line-item matching.

    Processes all document groups and matches line items within each.

    Args:
        grouped_data: Output from match_3way.py
        threshold: Fuzzy match threshold (0-1)

    Returns:
        Matched data with line-item matches for each group
    """
    results = []
    aggregate_stats = {
        'total_groups': 0,
        'groups_with_matches': 0,
        'total_matched_items': 0,
        'total_unmatched_po_lines': 0,
        'total_unmatched_invoice_lines': 0,
        'total_unmatched_delivery_lines': 0,
        'high_confidence': 0,
        'medium_confidence': 0,
        'low_confidence': 0
    }

    for group in grouped_data.get('grouped_sets', []):
        aggregate_stats['total_groups'] += 1

        # Skip unauthorized groups (no PO to match against)
        if group.get('match_status') == 'unauthorized':
            results.append({
                'group': group,
                'line_matching': None,
                'skip_reason': 'unauthorized - no PO to match against'
            })
            continue

        # Match line items
        line_matching = match_line_items_in_group(group, threshold)

        # Update aggregate stats
        if line_matching['matched_items']:
            aggregate_stats['groups_with_matches'] += 1

        aggregate_stats['total_matched_items'] += len(line_matching['matched_items'])
        aggregate_stats['total_unmatched_po_lines'] += len(line_matching['unmatched_po_lines'])
        aggregate_stats['total_unmatched_invoice_lines'] += len(line_matching['unmatched_invoice_lines'])
        aggregate_stats['total_unmatched_delivery_lines'] += len(line_matching['unmatched_delivery_lines'])

        # Count confidence levels
        for item in line_matching['matched_items']:
            conf = item.get('confidence', 'none')
            if conf in aggregate_stats:
                aggregate_stats[conf] += 1

        results.append({
            'group': group,
            'line_matching': line_matching
        })

    return {
        'matched_groups': results,
        'aggregate_stats': aggregate_stats,
        'config': {
            'threshold': threshold
        }
    }


def main():
    """CLI entry point for line-item matching."""
    parser = argparse.ArgumentParser(
        description='Match line items across PO, invoice, and delivery documents'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input JSON file from match_3way.py'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='Output JSON file for matched line items'
    )
    parser.add_argument(
        '--threshold', '-t',
        type=float,
        default=0.8,
        help='Fuzzy match threshold (0-1, default 0.8)'
    )
    parser.add_argument(
        '--pretty', '-p',
        action='store_true',
        help='Pretty-print output JSON'
    )

    args = parser.parse_args()

    # Validate threshold
    if not 0 <= args.threshold <= 1:
        print("Error: threshold must be between 0 and 1")
        return

    # Load input
    with open(args.input, 'r') as f:
        grouped_data = json.load(f)

    # Match line items
    result = match_items(grouped_data, threshold=args.threshold)

    # Write output
    with open(args.output, 'w') as f:
        if args.pretty:
            json.dump(result, f, indent=2, default=str)
        else:
            json.dump(result, f, default=str)

    # Print summary
    stats = result['aggregate_stats']
    print(f"Processed {stats['total_groups']} document groups")
    print(f"  Groups with matches: {stats['groups_with_matches']}")
    print(f"\nLine item matching:")
    print(f"  Total matched items: {stats['total_matched_items']}")
    print(f"    High confidence: {stats['high_confidence']}")
    print(f"    Medium confidence: {stats['medium_confidence']}")
    print(f"    Low confidence: {stats['low_confidence']}")
    print(f"\nUnmatched items:")
    print(f"  PO lines: {stats['total_unmatched_po_lines']}")
    print(f"  Invoice lines: {stats['total_unmatched_invoice_lines']}")
    print(f"  Delivery lines: {stats['total_unmatched_delivery_lines']}")


if __name__ == '__main__':
    main()
