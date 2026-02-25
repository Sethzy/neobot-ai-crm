---
name: 3way-reconciliation
description: Match purchase orders against invoices and delivery orders.
  Detects quantity shortages, price variances, unauthorized invoices, and
  unmatched documents. Use for AP reconciliation, goods receipt verification,
  or procurement audits.
---

# 3-Way Reconciliation

## Overview

Match POs, invoices, and delivery orders to identify discrepancies before payment. This skill automates the accounts payable verification process by:

1. Grouping documents by PO reference
2. Matching line items across document types
3. Detecting quantity and price variances
4. Flagging unauthorized or unmatched documents

## Capabilities

- **Document grouping** by PO reference number
- **Line-item matching** with exact SKU + fuzzy description fallback
- **Quantity variance detection** (shortage/excess)
- **Price variance detection** with configurable tolerance (default 2%)
- **Unauthorized invoice flagging** (invoice without PO)
- **Partial shipment handling** (1 PO → multiple deliveries)
- **Consolidated invoice detection** (flags invoices that may cover multiple POs)

## Document Requirements

Input documents must have `tag_id` field set to one of:
- `purchase_order` - PO with `po_number`, line items
- `invoice` - Invoice with `po_reference`, line items
- `delivery_order` - DO with `po_reference`, line items

Each line item should include:
- `sku` or `item_code` (optional but preferred)
- `description` (required)
- `quantity` (required)
- `unit_price` (required for PO/invoice)

## Matching Strategy

### Phase 1: Document Grouping (Script)

Run `match_3way.py` to group documents by PO reference.

**Input:** Array of extracted document splits
**Output:** Grouped sets with match status

```
grouped_sets: [
  { po: {...}, invoices: [...], deliveries: [...], match_status: "complete" },
  { po: {...}, invoices: [], deliveries: [], match_status: "unmatched" },
  { po: null, invoices: [...], deliveries: [...], match_status: "unauthorized" }
]
```

### Phase 2: Line-Item Matching (Script)

Run `match_line_items.py` for deterministic matches.

**Matching priority:**
1. Exact SKU match → high confidence
2. Number + fuzzy description match → medium confidence (e.g., both have "50mm")
3. Fuzzy description match (≥80% similarity) → medium confidence

Items that don't meet threshold are added to `unmatched_*` arrays for Claude review.

### Phase 2b: Low-Confidence Review (Claude)

After scripts complete, review `unmatched_po_lines` and `unmatched_invoice_lines` in the output.

For items with descriptions but no match, reason about whether they refer to the same product:
- Abbreviated product names (e.g., "WDG-001" vs "Widget")
- Different naming conventions (e.g., "Industrial Widget 50mm" vs "50mm Widgets bulk")
- Bundled vs individual items

If confident they match, treat as medium-confidence match and note reasoning. If uncertain, flag for user review.

### Phase 3: Discrepancy Analysis (Script)

Run `calculate_discrepancies.py` on matched items.

**Discrepancy types:**
| Type | Severity | Trigger |
|------|----------|---------|
| Quantity shortage | warning | delivered < ordered |
| Quantity excess | warning | delivered > ordered |
| Price variance | info/warning | unit price differs by >tolerance |
| Missing invoice | warning | PO line not invoiced |
| Missing delivery | warning | invoiced but not delivered |
| Unauthorized | critical | invoice without PO |

### Phase 4: Report Generation (Claude)

Synthesize findings into actionable Excel report with sheets:
1. **Summary** - Match stats, discrepancy counts
2. **Matched** - Successfully reconciled items
3. **Discrepancies** - Items requiring attention
4. **Unauthorized** - Invoices without PO (do not pay)
5. **Unmatched** - POs awaiting invoice/delivery

## Scripts

### `match_3way.py`

Groups documents by PO reference number.

```bash
python match_3way.py --input splits.json --output grouped.json
```

### `match_line_items.py`

Matches line items within each document group.

```bash
python match_line_items.py --input grouped.json --output matched.json --threshold 0.8
```

### `calculate_discrepancies.py`

Detects and classifies variances.

```bash
python calculate_discrepancies.py --input matched.json --output discrepancies.json --price-tolerance 0.02
```

## Edge Cases

See `references/edge_cases.md` for detailed handling of:

- Revised/corrected invoices (use latest by date)
- Partial payments (track balance)
- Draft/proforma documents (exclude from matching)
- Credit notes (negative quantities)

## Consolidated Invoices

If an invoice total significantly exceeds its matched PO (>10%), the group is flagged with `consolidated_invoice`.

**Action:** Ask the user: "Invoice INV-100 ($3,000) exceeds PO-1006 ($1,000). Does this invoice cover multiple POs? If so, which ones?"

Based on user response, either:
- Re-group the invoice with additional POs
- Or proceed with single-PO matching if user confirms it's correct

## Currency Mismatch

When invoice currency ≠ PO currency, ask the user for the exchange rate:

"Invoice INV-001 is in USD, but PO-123 is in SGD. What exchange rate should I use? (e.g., 1 USD = 1.33 SGD)"

Apply the provided rate and continue with comparison.

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `price_tolerance` | 0.02 | Allow 2% price variance |
| `qty_tolerance` | 0 | Exact quantity match required |
| `fuzzy_threshold` | 0.8 | Min similarity for description match |
| `currency` | null | Base currency for conversion |

## Best Practices

1. **Run scripts in order:** match_3way → match_line_items → calculate_discrepancies
2. **Review low-confidence matches** before approving payment
3. **Flag unauthorized invoices immediately** - do not process
4. **Investigate quantity excesses** - may indicate PO amendment needed
5. **Document price variance approvals** - audit trail

## Limitations

- **Consolidated invoices require user input** - flagged for user to clarify which POs are covered
- **Currency conversion requires user input** - exchange rate provided via chat
- **Handwritten documents** - flagged for manual review
- **No historical trend analysis** - per-batch processing only
- **No network access** - cannot fetch exchange rates or call external APIs

## Integration Example

```python
import json
from match_3way import group_documents
from match_line_items import match_items
from calculate_discrepancies import calculate

# Load extracted documents
with open('splits.json') as f:
    splits = json.load(f)

# Phase 1: Group by PO
grouped = group_documents(splits)

# Phase 2: Match line items
matched = match_items(grouped)

# Phase 3: Find discrepancies
discrepancies = calculate(matched, price_tolerance=0.02)

# Phase 4: Generate report (via Claude)
print(json.dumps(discrepancies, indent=2))
```
