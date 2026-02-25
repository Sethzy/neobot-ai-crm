---
name: maintain-docgen
description: Update client's docgen skill post-onboarding. Use when adding new capabilities or modifying existing docgen behavior. Follows thin-skill philosophy - define WHAT, Claude figures out HOW.
---

# Maintain DocGen Skill

Updates an existing client's DocGen skill after initial onboarding.

**Announce at start:** "I'm using the maintain-docgen skill to update the DocGen capabilities for this client."

**Location:** `src/clients/{client-id}/docgen-skill/{client-id}-docgen/SKILL.md`

---

## Philosophy

```
Thin skill + thick sandbox + conversational correction loop

Skill defines:     Problem, output schema, constraints
Sandbox handles:   Parsing, matching, calculations (writes scripts if needed)
Human provides:    Correction when uncertain
```

**Key principle:** Scripts do data wrangling. Claude does semantic judgment. Don't prescribe HOW - let Claude figure it out and ask when stuck.

When updating a skill:
- Focus on WHAT outcome to achieve, not HOW to implement
- Add constraints from real failures, not hypotheticals
- Keep it thin - Claude adapts at runtime

---

## How Skill Updates Work

Custom skills uploaded to Claude API support **versioning**. When you update a skill:

1. **Edit files locally** → `src/clients/{client-id}/docgen-skill/{client-id}-docgen/`
2. **Run upload script** → Creates a NEW VERSION of the existing skill
3. **Same skill_id** → No registry change needed, `version: 'latest'` auto-uses newest

```
┌────────────────────────────────────────────────────────────────┐
│  First upload (6-onboard-docgen)                               │
│    skills.create() → skill_014MCHbuRqzRdh9bsURwh72X           │
│                      version: 1759178010641129                 │
├────────────────────────────────────────────────────────────────┤
│  Subsequent updates (maintain-docgen)                          │
│    skills.versions.create(skill_id, ...) → same skill_id      │
│                                            version: 175917... │
├────────────────────────────────────────────────────────────────┤
│  Runtime (claude-report.ts)                                    │
│    { type: 'custom', skill_id: '...', version: 'latest' }     │
│    → Always uses most recent version                           │
└────────────────────────────────────────────────────────────────┘
```

**Key insight:** The upload script auto-detects if a skill_id exists in `skill-registry.ts`:

- **Exists** → Creates new version (keeps same skill_id)
- **Missing** → Creates new skill (updates registry)

---

## Process

### Step 1: Understand Current State

Read `src/clients/{client-id}/docgen-skill/{client-id}-docgen/SKILL.md`. Note:
- What problem it solves
- What output schema it uses
- What constraints exist

### Step 2: Review Reference Patterns

Read these to understand which architecture fits the problem:

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **reconciliation** | Matching by ID/exact value. Scripts do the lookup. | Match PO-12345 to Invoice #12345 |
| **contract-reconciliation** | Matching by meaning. No IDs - requires semantic understanding. | Does "Monthly retainer - legal" match "Attorney services per agreement"? |
| **financial-analysis** | Interpretation has standardized benchmarks. Rules encode judgment. | Current ratio 2.3 → "Healthy liquidity" |

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

### Step 3: Plan Changes

Ask:
- What outcome should change?
- What new constraints are needed (from real failures)?
- Should Claude handle this, or does it need a script?

**Present plan to user before implementing.**

### Step 4: Update SKILL.md

Sections to consider updating:
- **Description** (frontmatter) - Should follow format: "Domain context that complements xlsx/pdf/word skills. Provides problem definition, output schema, and constraints for: document reconciliation (match/unmatch), pattern analysis (trends/outliers), and audits (discrepancies/flags)."
- **Problem** - If scope changes
- **Output Schema** - If output format changes
- **Constraints** - Add rules from real failures
- **Script Guidance** - If new scripts would help
- **Edge Cases** - Add known ambiguities

**Keep it thin.** Script guidance is examples, not implementation:

```python
# calculate_variance.py
# Compare expected vs actual quantities
# Return: items with variance > threshold
# Let Claude decide what variance is significant
```

### Step 5: Upload New Version

```bash
python3 scripts/upload-docgen-skill.py {client-id}
```

The script auto-detects existing skill_id and creates a new version.

### Step 6: Report

```
DocGen skill updated for {Client Name}!

Changes:
- {What outcome changed}
- {What constraints added}

Next: python3 scripts/upload-docgen-skill.py {client-id}
```

---

## Error Handling

| Error                      | Action                                                   |
| -------------------------- | -------------------------------------------------------- |
| DocGen skill doesn't exist | STOP - "Run 6-onboard-docgen first"                      |
| Unclear requirements       | ASK - "What outcome should change? Show me an example."  |
| Too many constraints       | SIMPLIFY - Start thin, add constraints from real failures |

---

## Related

- `6-onboard-docgen` - Initial skill creation
- `references/docgen-design/reconciliation/SKILL.md` - Deterministic pattern
- `references/docgen-design/contract-reconciliation/SKILL.md` - Semantic pattern
- `references/docgen-design/financial-analysis/SKILL.md` - Rule-based pattern
