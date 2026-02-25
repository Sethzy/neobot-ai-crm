# Edge Cases in 3-Way Reconciliation

This document describes edge cases encountered in PO/Invoice/Delivery matching and the recommended handling strategies.

## 1. Consolidated Invoices (1 Invoice → Many POs/Deliveries)

### Scenario
Vendor sends one invoice covering multiple POs or deliveries:
- Invoice INV-100: $3,000 total
- PO-1006: $1,000 expected
- PO-1007: $2,000 expected

### Challenge
Invoice total exceeds any single PO, indicating it may cover multiple POs.

### Detection
Script flags groups where invoice total > PO total × 1.1 (10% buffer).

### Resolution
**Ask the user** - since allocation logic can be complex, defer to human:

"Invoice INV-100 ($3,000) exceeds PO-1006 ($1,000). Does this invoice cover multiple POs? If so, which ones?"

Based on response:
- Re-group invoice with additional POs
- Or proceed if user confirms single-PO is correct

### Script Handling
```python
# In match_3way.py, _check_consolidated_invoice() adds flag
if inv_total > po_total * 1.1:
    group.flags.append('consolidated_invoice')
```

---

## 2. Revised/Corrected Invoices

### Scenario
Vendor reissues invoice after correction:
- INV-100 (v1): $5,000 - issued Jan 5
- INV-100 (v2): $4,800 - issued Jan 8 (corrected)

### Challenge
Both invoices may be in the document set.

### Resolution
1. Detect duplicates by invoice number
2. Use latest by `invoice_date` or `issue_date`
3. Mark older versions as `superseded`
4. Only process the latest version

### Script Handling
```python
# In match_3way.py, _is_newer_document() handles date comparison
# Group by invoice number, keep only latest
```

---

## 3. Currency Conversion

### Scenario
- PO issued in SGD: $1,000 SGD
- Invoice issued in USD: $750 USD

### Challenge
Cannot compare amounts directly without conversion. Container has no network access to fetch live rates.

### Resolution
**Ask the user** for the exchange rate:

"Invoice INV-001 is in USD, but PO-123 is in SGD. What exchange rate should I use? (e.g., 1 USD = 1.33 SGD)"

Once provided:
1. Convert invoice amount to PO currency
2. Apply standard price tolerance + additional 2% for FX fluctuation
3. Proceed with comparison

### Detection
```python
# Check currency fields on PO vs invoice
po_currency = po.get('currency', 'SGD')
inv_currency = invoice.get('currency', 'SGD')
if po_currency != inv_currency:
    # Flag for user input
```

---

## 4. Partial Payments / Deposits

### Scenario
- PO Total: $10,000
- Deposit invoice: $5,000 (50% upfront)
- Final invoice: $5,000 (on delivery)

### Challenge
Payment terms create multiple invoices for single PO.

### Resolution
1. Track payment terms from PO (`payment_terms` field)
2. Sum all invoices for PO; should not exceed PO total
3. Flag if cumulative invoices exceed PO amount
4. Mark as "deposit" or "final" based on invoice description

### Script Handling
```python
# Track cumulative invoice total per PO
cumulative_invoice_total = sum(
    extract_total(inv) for inv in group['invoices']
)
if cumulative_invoice_total > po_total:
    flag_overpayment()
```

---

## 5. Fuzzy Item Names / SKU Variations

### Scenario
Documents from different sources use different naming:
- PO: "WDG-001 - Industrial Widget 50mm"
- Invoice: "Widget Model A (Industrial)"
- Delivery: "WIDGET-50MM"

### Challenge
No common identifier across documents.

### Resolution
1. **Tier 1 - Exact SKU**: Normalize and compare (remove punctuation, case)
2. **Tier 2 - Number match**: If same numbers appear in both descriptions (e.g., "50mm"), boost confidence
3. **Tier 3 - Fuzzy description**: 80% similarity threshold
4. **Tier 4 - Claude reasoning**: For unmatched items, Claude reviews and reasons about potential matches

### Confidence Scores
| Match Type | Confidence | Action |
|------------|------------|--------|
| Exact SKU | High | Auto-approve |
| Number + description match | Medium | Auto-approve |
| Description ≥80% | Medium | Auto-approve |
| Description <80% | Low | Claude reviews unmatched items |
| Claude confirms match | Medium | Note reasoning, proceed |
| Claude uncertain | Low | Flag for user review |

### Script Handling
```python
# In match_line_items.py, fuzzy_similarity() now returns (score, method)
# If both strings contain same numbers, score is boosted to min 0.6
nums1 = set(re.findall(r'\d+(?:\.\d+)?', str1))
nums2 = set(re.findall(r'\d+(?:\.\d+)?', str2))
if nums1 and nums2 and (nums1 & nums2):
    return max(base_score, 0.6), "number_match"
```

---

## 6. Credit Notes / Returns

### Scenario
- Original invoice: 100 units at $5 = $500
- Return: 10 units
- Credit note: -$50

### Challenge
Credit notes have negative quantities/amounts.

### Resolution
1. Detect credit notes by negative totals or "credit" tag
2. Link to original invoice by reference number
3. Net calculation: Original invoice - Credit note
4. Validate credit doesn't exceed original

### Script Handling
```python
# Detect credit note
if invoice_total < 0 or 'credit' in invoice.get('tag_id', '').lower():
    is_credit_note = True
```

---

## 7. Blanket/Standing POs

### Scenario
Annual contract PO for ongoing supplies:
- Blanket PO: 1,000 units over 12 months
- Monthly invoices: ~80-90 units each

### Challenge
PO doesn't have specific delivery dates; invoices accumulate.

### Resolution
1. Identify blanket PO by `po_type` or high quantity
2. Track cumulative usage against PO limit
3. Flag when approaching PO limit (80%, 90%, 100%)
4. Don't flag individual invoices as mismatches

### Identification
```python
blanket_indicators = [
    'blanket', 'standing', 'annual', 'contract',
    'framework', 'call-off'
]
```

---

## 8. Draft / Proforma Documents

### Scenario
Documents marked as draft, proforma, or quotation mixed with finals.

### Challenge
Drafts should not be included in reconciliation.

### Resolution
1. Detect by status field or document title
2. Exclude from matching pipeline
3. Log as excluded for audit trail

### Detection
```python
draft_indicators = [
    'draft', 'proforma', 'pro-forma', 'quotation',
    'quote', 'estimate', 'pending'
]
# Check document status or title
```

---

## 9. Intercompany Transactions

### Scenario
Transactions between related entities:
- Buying entity: Company A (Singapore)
- Selling entity: Company A (Malaysia)

### Challenge
May have different elimination rules; not true external spend.

### Resolution
1. Flag by vendor code or company identifier
2. Mark as "intercompany" for separate treatment
3. May require different approval workflow
4. Often excluded from external vendor analytics

---

## 10. Goods Received Not Invoiced (GRNI)

### Scenario
Goods delivered but invoice not yet received:
- PO-100 for 100 units
- DO-100 confirms receipt of 100 units
- No invoice yet

### Challenge
Creates accrual liability; needs tracking.

### Resolution
1. Identify as "awaiting invoice" in match status
2. Calculate GRNI value: Delivered qty × PO unit price
3. Include in accruals report
4. Set follow-up reminder for vendor

---

## 11. Invoices Received Not Goods (IRNG)

### Scenario
Invoice received before delivery:
- INV-100 for 100 units
- No delivery order yet

### Challenge
Should not pay until goods received.

### Resolution
1. Flag as "awaiting delivery"
2. Block payment approval
3. Set follow-up reminder for delivery
4. May indicate prepayment requirement

---

## Summary Table

| Edge Case | Detection | Resolution | Severity |
|-----------|-----------|------------|----------|
| Consolidated invoice | 1 invoice, N deliveries | Aggregate DOs | Medium |
| Revised invoice | Duplicate invoice # | Keep latest | Low |
| Currency conversion | Mixed currencies | Apply FX rate | High |
| Partial payment | Multiple invoices/PO | Sum and track | Medium |
| Fuzzy names | Low match confidence | Tiered matching | Medium |
| Credit notes | Negative amounts | Net calculation | Low |
| Blanket PO | High qty, long term | Cumulative tracking | Low |
| Draft docs | Draft/proforma tags | Exclude | Low |
| Intercompany | Related party codes | Flag separately | Low |
| GRNI | Delivered, no invoice | Accrue liability | Medium |
| IRNG | Invoice, no delivery | Block payment | High |
