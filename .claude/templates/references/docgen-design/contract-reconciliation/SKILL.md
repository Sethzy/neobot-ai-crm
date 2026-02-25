---
name: contract-reconciliation
description: Match service invoices against contracts to verify compliance.
  Uses filesystem exploration pattern - Claude greps through contracts
  and reasons about compliance. No pre-processing scripts.
---

# Contract Reconciliation

## Philosophy

### Why No Scripts?

The 3-way reconciliation pattern (PO matching) uses scripts because it's a **lookup problem**: PO-12345 → find invoice referencing PO-12345. Deterministic. Scriptable.

Contract reconciliation is a **reasoning problem**:
- Invoices often lack explicit contract references
- Vendor names vary ("Acme Corp" vs "Acme Consulting LLC")
- Scope matching is semantic ("IT support" under "Technology Services"?)
- Rate structures are complex and varied

We tried scripting this. It produced 800+ lines of brittle Python that:
- Pretended to do "semantic matching" (it was just fuzzy string matching)
- Required perfectly structured extraction data (unrealistic)
- Couldn't handle edge cases without more code

**The insight from Vercel's agent research:**

> "We were constraining reasoning because we didn't trust the model to reason. The best agents might be the ones with the fewest tools."

LLMs are trained on code navigation. They can grep, read files, and reason. Let them.

### The Pattern

Instead of pre-processing with scripts:

```
contracts/
├── acme-msa-2024.json
├── globex-sow-001.json
└── initech-consulting.json

Invoice arrives → Claude explores → Claude reasons → Structured output
```

Claude **is** the semantic matcher. No script needed.

---

## When to Use This vs 3-Way Reconciliation

| Scenario | Pattern | Why |
|----------|---------|-----|
| Invoices with PO numbers | 3-Way Reconciliation | Explicit reference → lookup |
| Service invoices against contracts | Contract Reconciliation | Implicit relationship → reasoning |

---

## Context Setup

Contracts should be available as files Claude can read. Structure:

```
context/
├── contracts/
│   ├── vendor-a-msa.json
│   ├── vendor-b-sow.json
│   └── ...
└── invoice.json
```

Or passed directly in the prompt if small enough.

---

## The Process

### Step 1: Find Candidate Contracts

```bash
# Search for vendor name across contracts
grep -li "acme" contracts/*.json

# Or list all contracts if few
ls contracts/
```

### Step 2: Read Relevant Contracts

```bash
cat contracts/acme-msa-2024.json
```

### Step 3: Reason About Match & Compliance

Claude considers:
- **Vendor alignment**: Name variations, legal entities, subcontractors
- **Date validity**: Invoice date within contract effective/expiration
- **Scope coverage**: Service description vs contract scope
- **Rate compliance**: Billed rate vs contract rate (consider tiers, escalations)

### Step 4: Output Structured Result

```json
{
  "matched_contract": "acme-msa-2024",
  "match_confidence": "high",
  "match_reasoning": "Vendor 'Acme Consulting' matches contract party 'Acme Consulting LLC'. Invoice date 2024-06-15 within contract validity (2024-01-01 to 2024-12-31).",
  "compliance": {
    "rate": { "status": "ok", "detail": "Billed $175/hr matches contract rate" },
    "scope": { "status": "ok", "detail": "Software development within 'Technology Services' scope" },
    "dates": { "status": "ok", "detail": "Invoice within contract validity" }
  },
  "issues": [],
  "recommendation": "Approve for payment"
}
```

Or if issues found:

```json
{
  "matched_contract": "acme-msa-2024",
  "match_confidence": "high",
  "compliance": {
    "rate": { "status": "warning", "detail": "Billed $200/hr exceeds contract rate $175/hr by 14%" },
    "scope": { "status": "ok" },
    "dates": { "status": "ok" }
  },
  "issues": [
    {
      "type": "rate_variance",
      "severity": "warning",
      "description": "Invoice rate ($200/hr) exceeds contract rate ($175/hr)",
      "variance": "$25/hr (14%)",
      "recommendation": "Request credit or verify rate amendment"
    }
  ]
}
```

---

## Prompt Template

```
You are checking invoice compliance against contracts.

## Contracts Available
[List contract files or provide contract JSON directly]

## Invoice to Check
[Invoice JSON]

## Task
1. Find the matching contract:
   - Search by vendor name (consider variations: abbreviations, legal suffixes)
   - Verify invoice date within contract validity
   - Check service alignment with contract scope

2. Check compliance:
   - Rate: Does billed rate match contract rate? (5% tolerance acceptable)
   - Scope: Is the service covered by the contract?
   - Dates: Is invoice within contract validity period?
   - Terms: Any billing term violations?

3. Output structured JSON with:
   - matched_contract: contract identifier or null
   - match_confidence: high/medium/low/none
   - match_reasoning: why this contract matches
   - compliance: status for rate, scope, dates
   - issues: array of any problems found
   - recommendation: approve/review/reject

## Edge Cases to Consider
- Contract may have amendments (use most recent before invoice date)
- Vendor may be authorized subcontractor (check parties list)
- Rate may include escalation clause (calculate applicable rate)
- Contract may have auto-renewal (check if truly expired)
```

---

## Edge Cases

Claude should reason about these naturally. Brief reminders:

| Edge Case | What to Consider |
|-----------|------------------|
| **Amendments** | Which version applies on invoice date? Use most recent before invoice date. |
| **Subcontractors** | Invoice vendor might be authorized sub, not primary. Check parties. |
| **Work Orders** | MSA may have no rates - rates live in linked Work Orders. |
| **Rate escalation** | Calculate applicable rate if escalation clause exists. |
| **Auto-renewal** | Contract "expired" but has auto-renewal? May still be valid. |
| **Blended rates** | Implied rate doesn't match tier? May be role mix - flag for breakdown. |

These don't need scripts. Claude reads the contract, sees the clause, reasons about it.

---

## Why This Works

From Vercel's research on agent architecture:

| Before (Many Tools) | After (Minimal Tools) |
|--------------------|-----------------------|
| 274.8s execution | 77.4s execution |
| 80% success rate | 100% success rate |
| ~102k tokens | ~61k tokens |

> "Filesystems replace vector databases for context retrieval. Bash commands replace custom tools."

For contract matching:
- **grep** finds candidate contracts by vendor name
- **cat** reads the relevant contract
- **Claude reasons** about compliance

No embedding. No fuzzy matching scripts. No brittle extraction assumptions.

---

## Trade-offs

**More tokens per invoice**: Claude reads contracts each time vs pre-processed summaries.

**Acceptable because**:
- Actually works with messy/varied data
- No script maintenance
- Handles edge cases without code changes
- Ships in minutes, not hours

**If scale becomes an issue**: Pre-filter candidates with grep, only read top matches.

---

## Integration

```python
# Minimal integration - just invoke Claude with context

prompt = f"""
Check this invoice against available contracts.

Contracts directory: contracts/
Invoice: {invoice_json}

Find matching contract, check compliance, output structured result.
"""

# Claude explores files, reasons, returns structured JSON
result = claude.complete(prompt, tools=["bash"])
```

That's it. No pre-processing. No extraction scripts. Claude does the work.

---

## What We Deleted (And Why)

| Deleted | Lines | Why |
|---------|-------|-----|
| `match_contracts.py` | 400 | Pre-grouping unnecessary - Claude can grep |
| `extract_obligations.py` | 400 | Assumed structured data we don't have |
| `semantic_match.py` | 500 | Fuzzy matching was pretending to be semantic |
| `calculate_discrepancies.py` | 500 | Compliance is reasoning, not calculation |

**Total deleted: ~1800 lines of code that didn't work well.**

Replaced with: a prompt template and this philosophy doc.

---

## Summary

> **Scripts handle structure. Claude handles judgment.**

Contract compliance is judgment. Let Claude judge.
