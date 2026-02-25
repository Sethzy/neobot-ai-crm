---
name: 6-onboard-docgen
description: Generate thin docgen skill for client (Phase 6.5). Use when intake brief exists. Creates SKILL.md that defines problem/schema/constraints - Claude figures out the HOW at runtime. Called by orchestrator or via /6-onboard-docgen {client-id}.
---

# Generate DocGen Skill

Creates a **thin skill** for a client - defines WHAT to solve, not HOW to solve it.

**Announce at start:** "I'm using the 6-onboard-docgen skill to generate a DocGen skill for this client."

**Output:** `src/clients/{client-id}/docgen-skill/{client-id}-docgen/SKILL.md`

---

## Philosophy

```
Thin skill + thick sandbox + conversational correction loop

Skill defines:     Problem, output schema, constraints
Sandbox handles:   Parsing, matching, calculations (writes scripts if needed)
Human provides:    Correction when uncertain
```

**Key principle:** Scripts do data wrangling. Claude does semantic judgment. Don't prescribe HOW - let Claude figure it out and ask when stuck.

---

## Process

### Step 1: Understand the Problem

Read `src/clients/{client-id}/intake-brief.md`. If unclear, ask:

- What documents are you reconciling/analyzing?
- What does a good output look like?
- What errors should we catch?

### Step 2: Define the Skill

Write a thin SKILL.md with these sections: Problem, Output Schema, Constraints, Script Guidance, Edge Cases.

**Output Schema tips:**

- Use flexible templates (adapt sections as needed)
- Or use input/output examples when style matters
- Examples help Claude understand better than descriptions

**Template:**

````markdown
---
name: {client-id}-docgen
description: Domain context that complements xlsx/pdf/word skills. Provides problem definition, output schema, and constraints for: document reconciliation (match/unmatch), pattern analysis (trends/outliers), and audits (discrepancies/flags).
---

<IMPORTANT>
Read this entire skill before your first response. This defines:
- What documents you're working with
- What output the user expects
- Domain-specific constraints

Do not start analyzing or running code until you understand the problem.
</IMPORTANT>

# {Client Name} DocGen

## How to Use This Skill

This is flexible guidance, not rigid rules. Adapt sections based on what you discover in the documents. Use your judgment. Tailor to the specific context. The outline below is a sensible outline - adjust as needed.

## Background

You're in a multi-turn chat with the user. You have access to a code execution tool with their document data pre-loaded.

**What You Have:**

- `code_execution` tool - invoke when you need to run Python/bash
- `data.json` - available in the container when you invoke code execution
- `xlsx` skill - for generating Excel files
- Files persist across turns once created and are downloadable by the user

**Data Structure** (in `data.json`):

```json
{
  "summary": {
    "total_splits": 48,
    "by_document_type": { "purchase_order": 20, "invoice": 28 }
  },
  "splits": [
    {
      "split_id": "uuid",
      "tag_id": "document_type",
      "document_date": "YYYY-MM-DD or null",
      "identifier": "invoice/reference number or null",
      "potential_duplicate": "split_id if flagged, else null"
      // ...all extracted fields from the document
    }
  ]
}
```

**Interaction Model:**

- First turn: explore the request, clarify if needed - no need to immediately run code
- Before expensive operations (reconciliation, large Excel generation): summarize your plan, wait for user confirmation
- User can correct or redirect you mid-task
- When confidence < 70%, ask. One clarification beats redoing work.
- Keep responses conversational

## Problem

{What documents? What outcome? What makes it valuable?}

## Output Schema

# Reconciliation Report

## Summary

- Documents matched: X/Y
- Discrepancies found: Z

## Discrepancies

| Line | Expected | Actual | Issue |
| ---- | -------- | ------ | ----- |
| ...  | ...      | ...    | ...   |

## Constraints

- Never hallucinate data not in source documents
- Ask user if confidence < 70%
- {Domain-specific rules}

## Script Guidance

Scripts that would help (Claude writes these at runtime if needed):

```python
# match_line_items.py
# Parse PO and invoice, match by item ID
# Return: matched pairs + unmatched items
# Let Claude reason about fuzzy matches
```

## Edge Cases

- Partial matches: ask user
- Missing PO numbers: flag for review
- {Known ambiguities}

## That's it. Figure out the rest.
````

### Step 3: Review Reference Patterns

Read these to understand which architecture fits the problem:

| Pattern                     | When to Use                                                        | Example                                                                  |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **reconciliation**          | Matching by ID/exact value. Scripts do the lookup.                 | Match PO-12345 to Invoice #12345                                         |
| **contract-reconciliation** | Matching by meaning. No IDs - requires semantic understanding.     | Does "Monthly retainer - legal" match "Attorney services per agreement"? |
| **financial-analysis**      | Interpretation has standardized benchmarks. Rules encode judgment. | Current ratio 2.3 → "Healthy liquidity"                                  |

References:

- `references/docgen-design/reconciliation/SKILL.md`
- `references/docgen-design/contract-reconciliation/SKILL.md`
- `references/docgen-design/financial-analysis/SKILL.md`

**Decision tree:**

1. Can you match on an ID or exact value? → **reconciliation** (scripts do lookup)
2. Are there standardized benchmarks for interpretation? → **financial-analysis** (rules encode judgment)
3. Does it require understanding meaning/context? → **contract-reconciliation** (Claude reasons)
4. None of the above fit? → **Figure it out.** These are patterns, not a checklist. Apply the thin-skill philosophy and design what fits.

**Key principle:** Scripts handle structure. Rules handle judgment when benchmarks are standardized. Claude handles semantic judgment.

### Step 4: Validate and Upload

**Checklist:**

- [ ] Problem is clear (a junior could understand it)
- [ ] Output schema is concrete (shows actual format)
- [ ] Script guidance is examples, not implementation
- [ ] Background section explains the chat context

**Upload:** `python3 scripts/upload-docgen-skill.py {client-id}`

**Report:**

```
DocGen skill generated for {Client Name}!

Created: src/clients/{client-id}/docgen-skill/{client-id}-docgen/SKILL.md

This is a thin skill - Claude will figure out parsing/matching at runtime.
User will be asked for clarification on ambiguous cases.

Next: python3 scripts/upload-docgen-skill.py {client-id}
```

---

## Error Handling

| Error                 | Action                                                     |
| --------------------- | ---------------------------------------------------------- |
| No intake brief       | ASK - "What documents? What output? What errors to catch?" |
| Unclear output format | ASK - "Show me an example of what good output looks like"  |
| Too many constraints  | SIMPLIFY - Start thin, add constraints from real failures  |
