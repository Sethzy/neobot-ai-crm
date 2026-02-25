"""
Discrepancy Calculator - Detects and classifies variances in matched line items.

This script is the third phase of 3-way reconciliation. It takes matched line items
and identifies quantity shortages, price variances, missing items, and other
discrepancies that require attention before payment approval.

Usage:
    python calculate_discrepancies.py --input matched.json --output discrepancies.json --price-tolerance 0.02
"""

import argparse
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional


# Severity levels for discrepancies
SEVERITY_INFO = "info"          # Minor variance within tolerance
SEVERITY_WARNING = "warning"    # Requires review before payment
SEVERITY_CRITICAL = "critical"  # Block payment, escalate


@dataclass
class Discrepancy:
    """A detected variance or issue requiring attention."""
    type: str                       # quantity_shortage, quantity_excess, price_variance, etc.
    severity: str                   # info, warning, critical
    description: str                # Human-readable description
    po_line: Optional[dict] = None  # Related PO line item
    invoice_line: Optional[dict] = None
    delivery_line: Optional[dict] = None
    expected_value: Optional[float] = None
    actual_value: Optional[float] = None
    variance: Optional[float] = None  # Absolute or percentage variance
    variance_pct: Optional[float] = None
    recommended_action: str = ""
    flags: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def calculate_discrepancies(
    matched_item: dict,
    price_tolerance: float = 0.02,
    qty_tolerance: float = 0.0
) -> list:
    """
    Calculate discrepancies for a single matched item.

    Compares PO line against invoice and delivery lines to detect:
    - Quantity shortages/excesses
    - Price variances
    - Missing items

    Args:
        matched_item: A matched item with po_line, invoice_lines, delivery_lines
        price_tolerance: Allowed price variance (e.g., 0.02 = 2%)
        qty_tolerance: Allowed quantity variance (e.g., 0 = exact match)

    Returns:
        List of Discrepancy objects
    """
    discrepancies = []

    po_line = matched_item.get('po_line')
    invoice_lines = matched_item.get('invoice_lines', [])
    delivery_lines = matched_item.get('delivery_lines', [])

    if not po_line:
        return discrepancies

    po_qty = po_line.get('quantity', 0) or 0
    po_price = po_line.get('unit_price', 0) or 0

    # Calculate totals from matched documents
    invoice_qty = sum((line.get('quantity') or 0) for line in invoice_lines)
    invoice_price = _average_price(invoice_lines)
    delivery_qty = sum((line.get('quantity') or 0) for line in delivery_lines)

    # --- Quantity Checks ---

    # Check PO vs Invoice quantity
    if invoice_lines:
        qty_diff = invoice_qty - po_qty
        if abs(qty_diff) > (po_qty * qty_tolerance) and qty_diff != 0:
            if qty_diff < 0:
                discrepancies.append(Discrepancy(
                    type="quantity_shortage_invoice",
                    severity=SEVERITY_WARNING,
                    description=f"Invoice quantity ({invoice_qty}) less than PO ({po_qty})",
                    po_line=po_line,
                    invoice_line=invoice_lines[0] if len(invoice_lines) == 1 else None,
                    expected_value=po_qty,
                    actual_value=invoice_qty,
                    variance=qty_diff,
                    variance_pct=(qty_diff / po_qty * 100) if po_qty else 0,
                    recommended_action="Verify partial shipment or request credit note"
                ))
            else:
                discrepancies.append(Discrepancy(
                    type="quantity_excess_invoice",
                    severity=SEVERITY_WARNING,
                    description=f"Invoice quantity ({invoice_qty}) exceeds PO ({po_qty})",
                    po_line=po_line,
                    invoice_line=invoice_lines[0] if len(invoice_lines) == 1 else None,
                    expected_value=po_qty,
                    actual_value=invoice_qty,
                    variance=qty_diff,
                    variance_pct=(qty_diff / po_qty * 100) if po_qty else 0,
                    recommended_action="Verify PO amendment or reject excess"
                ))

    # Check PO vs Delivery quantity
    if delivery_lines:
        qty_diff = delivery_qty - po_qty
        if abs(qty_diff) > (po_qty * qty_tolerance) and qty_diff != 0:
            if qty_diff < 0:
                discrepancies.append(Discrepancy(
                    type="quantity_shortage_delivery",
                    severity=SEVERITY_WARNING,
                    description=f"Delivered quantity ({delivery_qty}) less than PO ({po_qty})",
                    po_line=po_line,
                    delivery_line=delivery_lines[0] if len(delivery_lines) == 1 else None,
                    expected_value=po_qty,
                    actual_value=delivery_qty,
                    variance=qty_diff,
                    variance_pct=(qty_diff / po_qty * 100) if po_qty else 0,
                    recommended_action="Contact vendor for remaining shipment"
                ))
            else:
                discrepancies.append(Discrepancy(
                    type="quantity_excess_delivery",
                    severity=SEVERITY_WARNING,
                    description=f"Delivered quantity ({delivery_qty}) exceeds PO ({po_qty})",
                    po_line=po_line,
                    delivery_line=delivery_lines[0] if len(delivery_lines) == 1 else None,
                    expected_value=po_qty,
                    actual_value=delivery_qty,
                    variance=qty_diff,
                    variance_pct=(qty_diff / po_qty * 100) if po_qty else 0,
                    recommended_action="Verify PO amendment or return excess"
                ))

    # Check Invoice vs Delivery quantity (3-way mismatch)
    if invoice_lines and delivery_lines:
        qty_diff = invoice_qty - delivery_qty
        if abs(qty_diff) > 0:
            discrepancies.append(Discrepancy(
                type="invoice_delivery_mismatch",
                severity=SEVERITY_WARNING,
                description=f"Invoice qty ({invoice_qty}) differs from delivery qty ({delivery_qty})",
                po_line=po_line,
                invoice_line=invoice_lines[0] if len(invoice_lines) == 1 else None,
                delivery_line=delivery_lines[0] if len(delivery_lines) == 1 else None,
                expected_value=delivery_qty,
                actual_value=invoice_qty,
                variance=qty_diff,
                recommended_action="Reconcile invoice against actual receipt"
            ))

    # --- Price Checks ---

    if invoice_lines and po_price > 0 and invoice_price > 0:
        price_diff = invoice_price - po_price
        price_diff_pct = abs(price_diff) / po_price

        if price_diff_pct > price_tolerance:
            severity = SEVERITY_WARNING if price_diff_pct <= 0.10 else SEVERITY_CRITICAL
            discrepancies.append(Discrepancy(
                type="price_variance",
                severity=severity,
                description=f"Invoice price (${invoice_price:.2f}) differs from PO (${po_price:.2f})",
                po_line=po_line,
                invoice_line=invoice_lines[0] if len(invoice_lines) == 1 else None,
                expected_value=po_price,
                actual_value=invoice_price,
                variance=price_diff,
                variance_pct=price_diff_pct * 100,
                recommended_action="Verify price authorization or request credit"
            ))
        elif price_diff_pct > 0:
            # Within tolerance but still a variance
            discrepancies.append(Discrepancy(
                type="price_variance",
                severity=SEVERITY_INFO,
                description=f"Minor price variance (${price_diff:.2f}, {price_diff_pct:.1%})",
                po_line=po_line,
                invoice_line=invoice_lines[0] if len(invoice_lines) == 1 else None,
                expected_value=po_price,
                actual_value=invoice_price,
                variance=price_diff,
                variance_pct=price_diff_pct * 100,
                recommended_action="Within tolerance - approve"
            ))

    # --- Missing Document Checks ---

    if not invoice_lines:
        discrepancies.append(Discrepancy(
            type="missing_invoice",
            severity=SEVERITY_INFO,
            description="PO line item not yet invoiced",
            po_line=po_line,
            expected_value=po_qty,
            actual_value=0,
            recommended_action="Follow up with vendor for invoice"
        ))

    if not delivery_lines:
        discrepancies.append(Discrepancy(
            type="missing_delivery",
            severity=SEVERITY_INFO,
            description="PO line item not yet delivered",
            po_line=po_line,
            expected_value=po_qty,
            actual_value=0,
            recommended_action="Follow up with vendor for delivery"
        ))

    return discrepancies


def _average_price(lines: list) -> float:
    """Calculate average unit price from line items."""
    prices = [line.get('unit_price') for line in lines if line.get('unit_price')]
    if prices:
        return sum(prices) / len(prices)
    return 0.0


def detect_unauthorized_invoices(matched_groups: list) -> list:
    """
    Detect invoices without matching PO (unauthorized).

    These are critical - should not be paid without authorization.

    Args:
        matched_groups: List of matched group results

    Returns:
        List of unauthorized invoice discrepancies
    """
    discrepancies = []

    for group_result in matched_groups:
        group = group_result.get('group', {})

        if group.get('match_status') == 'unauthorized':
            for invoice in group.get('invoices', []):
                invoice_total = _extract_total(invoice)
                discrepancies.append(Discrepancy(
                    type="unauthorized_invoice",
                    severity=SEVERITY_CRITICAL,
                    description=f"Invoice without PO reference - DO NOT PAY",
                    invoice_line=invoice,
                    actual_value=invoice_total,
                    recommended_action="Return to vendor or obtain retroactive PO approval",
                    flags=["block_payment", "escalate"]
                ))

    return discrepancies


def detect_unmatched_pos(matched_groups: list) -> list:
    """
    Detect POs without invoices or deliveries.

    These need follow-up with vendor.

    Args:
        matched_groups: List of matched group results

    Returns:
        List of unmatched PO discrepancies
    """
    discrepancies = []

    for group_result in matched_groups:
        group = group_result.get('group', {})

        if group.get('match_status') == 'unmatched':
            po = group.get('po')
            if po:
                po_total = _extract_total(po)
                discrepancies.append(Discrepancy(
                    type="unmatched_po",
                    severity=SEVERITY_INFO,
                    description="PO has no matching invoice or delivery",
                    po_line=po,
                    expected_value=po_total,
                    actual_value=0,
                    recommended_action="Follow up with vendor on order status"
                ))

    return discrepancies


def _extract_total(doc: dict) -> Optional[float]:
    """Extract total amount from a document."""
    total_fields = ['total', 'grand_total', 'amount', 'total_amount', 'invoice_total']

    for field in total_fields:
        if field in doc and doc[field] is not None:
            try:
                val = str(doc[field]).replace(',', '').replace('$', '')
                return float(val)
            except (ValueError, TypeError):
                continue

    # Check nested structures
    for container in ['fields', 'extracted_data', 'data']:
        if container in doc and isinstance(doc[container], dict):
            for field in total_fields:
                if field in doc[container]:
                    try:
                        val = str(doc[container][field]).replace(',', '').replace('$', '')
                        return float(val)
                    except (ValueError, TypeError):
                        continue

    return None


def calculate(matched_data: dict, price_tolerance: float = 0.02, qty_tolerance: float = 0.0) -> dict:
    """
    Main entry point for discrepancy calculation.

    Processes all matched groups and calculates discrepancies.

    Args:
        matched_data: Output from match_line_items.py
        price_tolerance: Allowed price variance (0-1)
        qty_tolerance: Allowed quantity variance (0-1)

    Returns:
        Dictionary with all discrepancies and summary stats
    """
    all_discrepancies = []
    discrepancy_by_group = []

    matched_groups = matched_data.get('matched_groups', [])

    # Process each group
    for group_result in matched_groups:
        group_discrepancies = []

        line_matching = group_result.get('line_matching')
        if line_matching:
            # Calculate discrepancies for each matched item
            for matched_item in line_matching.get('matched_items', []):
                item_discrepancies = calculate_discrepancies(
                    matched_item, price_tolerance, qty_tolerance
                )
                group_discrepancies.extend(item_discrepancies)

            # Check unmatched lines
            for po_line in line_matching.get('unmatched_po_lines', []):
                group_discrepancies.append(Discrepancy(
                    type="unmatched_po_line",
                    severity=SEVERITY_WARNING,
                    description="PO line item has no matching invoice or delivery line",
                    po_line=po_line,
                    recommended_action="Review line item manually"
                ))

            for inv_line in line_matching.get('unmatched_invoice_lines', []):
                group_discrepancies.append(Discrepancy(
                    type="unmatched_invoice_line",
                    severity=SEVERITY_WARNING,
                    description="Invoice line item has no matching PO line",
                    invoice_line=inv_line,
                    recommended_action="Verify line item against PO or reject"
                ))

        discrepancy_by_group.append({
            'group': group_result.get('group'),
            'discrepancies': [d.to_dict() for d in group_discrepancies]
        })
        all_discrepancies.extend(group_discrepancies)

    # Detect unauthorized invoices
    unauthorized = detect_unauthorized_invoices(matched_groups)
    all_discrepancies.extend(unauthorized)

    # Detect unmatched POs
    unmatched_pos = detect_unmatched_pos(matched_groups)
    all_discrepancies.extend(unmatched_pos)

    # Calculate summary stats
    stats = {
        'total_discrepancies': len(all_discrepancies),
        'by_severity': {
            'critical': sum(1 for d in all_discrepancies if d.severity == SEVERITY_CRITICAL),
            'warning': sum(1 for d in all_discrepancies if d.severity == SEVERITY_WARNING),
            'info': sum(1 for d in all_discrepancies if d.severity == SEVERITY_INFO)
        },
        'by_type': {}
    }

    for d in all_discrepancies:
        dtype = d.type
        stats['by_type'][dtype] = stats['by_type'].get(dtype, 0) + 1

    return {
        'discrepancies': [d.to_dict() for d in all_discrepancies],
        'discrepancy_by_group': discrepancy_by_group,
        'stats': stats,
        'config': {
            'price_tolerance': price_tolerance,
            'qty_tolerance': qty_tolerance
        },
        'generated_at': datetime.now().isoformat()
    }


def main():
    """CLI entry point for discrepancy calculation."""
    parser = argparse.ArgumentParser(
        description='Calculate discrepancies in matched line items'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input JSON file from match_line_items.py'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='Output JSON file for discrepancies'
    )
    parser.add_argument(
        '--price-tolerance', '-pt',
        type=float,
        default=0.02,
        help='Allowed price variance (0-1, default 0.02 = 2%%)'
    )
    parser.add_argument(
        '--qty-tolerance', '-qt',
        type=float,
        default=0.0,
        help='Allowed quantity variance (0-1, default 0 = exact)'
    )
    parser.add_argument(
        '--pretty', '-p',
        action='store_true',
        help='Pretty-print output JSON'
    )

    args = parser.parse_args()

    # Load input
    with open(args.input, 'r') as f:
        matched_data = json.load(f)

    # Calculate discrepancies
    result = calculate(
        matched_data,
        price_tolerance=args.price_tolerance,
        qty_tolerance=args.qty_tolerance
    )

    # Write output
    with open(args.output, 'w') as f:
        if args.pretty:
            json.dump(result, f, indent=2, default=str)
        else:
            json.dump(result, f, default=str)

    # Print summary
    stats = result['stats']
    print(f"Found {stats['total_discrepancies']} discrepancies")
    print(f"\nBy severity:")
    print(f"  Critical: {stats['by_severity']['critical']}")
    print(f"  Warning: {stats['by_severity']['warning']}")
    print(f"  Info: {stats['by_severity']['info']}")
    print(f"\nBy type:")
    for dtype, count in sorted(stats['by_type'].items()):
        print(f"  {dtype}: {count}")


if __name__ == '__main__':
    main()
