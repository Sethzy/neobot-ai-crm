---
name: maintain-evals
description: Set up ExtendAI evaluation sets and run Composer AI optimization (Phase 9). Use post-onboarding to measure and improve extraction accuracy.
---

# Evals & Composer Optimization

## Overview

Use ExtendAI's evaluation system and Composer AI agent to measure and improve extraction accuracy. Create evaluation sets with ground truth, run AI-driven optimization, then pull improvements back to codebase.

**Time:** 30-60 minutes initial setup, then ongoing

**Announce at start:** "I'm using the maintain-evals skill to set up evaluations and run Composer optimization."

---

## Why Evals Matter

- **Catch regressions** when schemas change
- **Measure accuracy objectively** per field
- **Enable Composer** - AI agent that auto-optimizes your schema
- **Data-driven iteration** instead of guesswork

---

## Prerequisites

Before running this skill:

- [ ] Client fully onboarded (Phases 1-8 complete)
- [ ] Schema published in ExtendAI Dashboard
- [ ] `EXTEND_API_KEY` set in `.env.local`
- [ ] 20-30+ sample documents available for ground truth

---

## Inputs Required

User provides:
- **client-id**: kebab-case identifier (e.g., `hoh-law`)
- **tag-id**: snake_case tag ID (e.g., `medical_expense`)
- **processor-id**: ExtendAI processor ID (e.g., `dp_CoZLsiI6FOxHC4rNTZHGS`)

Example: `/maintain-evals hoh-law medical_expense`

---

## The Process

### Step 1: Create Evaluation Set (10 min)

_What this does:_ An evaluation set is a collection of documents with "ground truth" - the correct expected outputs you've manually verified.

**Via Dashboard (Recommended):**
1. Go to ExtendAI Dashboard → Processor → **Evaluation** tab
2. Click **Create Evaluation Set**
3. Name it descriptively (e.g., "Hoh Law - Medical Expense - Q1 2025")

**Via API:**
```bash
curl -X POST https://api.extend.ai/evaluation_sets \
  -H "Authorization: Bearer $EXTEND_API_KEY" \
  -H "x-extend-api-version: 2025-04-21" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "{Client Name} - {Tag Name} - {Date}",
    "description": "Representative sample of {tag} documents",
    "processorId": "{processor_id}"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "evaluationSet": {
    "id": "ev_2LcgeY_mp2T5yPaEuq5Lw",
    "name": "Hoh Law - Medical Expense - Q1 2025",
    "processorId": "dp_abc123xyz"
  }
}
```

**Save the evaluation set ID** for subsequent steps.

---

### Step 2: MANUAL CHECKPOINT - Add Items with Ground Truth (15-30 min)

**PAUSE FOR HUMAN INTERVENTION**

_What this does:_ Upload documents and provide the correct expected output for each. This is your "answer key" for measuring accuracy.

Display:
```
MANUAL CHECKPOINT - ADD GROUND TRUTH
═════════════════════════════════════

Create your evaluation set with verified ground truth data.

Requirements:
- 20-30+ documents minimum for reliable optimization
- Diverse samples - include edge cases, poor scans, variations
- Manually verified - ground truth must be accurate

Via Dashboard:
1. Open: https://dashboard.extend.ai/processors/{processor_id}/evaluation
2. Select your evaluation set
3. Upload documents from src/clients/{client-id}/samples/
4. For each document, manually enter the correct expected values
5. Verify each field is accurate

Quality matters: Poor ground truth = poor optimizations.

When you have 20-30+ items with verified ground truth, type 'done' to continue.
```

**Wait for user to type "done"**

---

### Step 3: MANUAL CHECKPOINT - Run Composer Optimization (15-30 min)

**PAUSE FOR HUMAN INTERVENTION**

_What this does:_ Composer is an AI agent that analyzes your evaluation results and automatically improves your schema descriptions and extraction rules.

Display:
```
MANUAL CHECKPOINT - RUN COMPOSER
═════════════════════════════════

Launch Composer AI optimization in ExtendAI Dashboard.

Prerequisites:
- [ ] Evaluation set has 20-30+ items with verified ground truth
- [ ] Schema structure is finalized (Composer won't change field types/names)
- [ ] Processor version is published (so you can revert if needed)

Steps:
1. Open: https://dashboard.extend.ai/processors/{processor_id}/composer
2. Configure Composer:
   - Evaluation Set: Select your eval set
   - Processor Version: Draft (optimize before publishing)
   - Max Generation Runs: 5-7 (more = better, higher cost)
   - Improvement Threshold: 5%
   - Email Notification: Enable
3. Click "Optimize"
4. Wait for completion (15-30 min depending on eval set size)

How Composer Works:
1. ANALYZE - Examines current schema + evaluates against eval set
2. GENERATE - Creates candidate improvements for field descriptions
3. EVALUATE - Tests each candidate against eval set
4. SELECT - Picks best performing version per field

When Composer completes, type 'done' to continue.
```

**Wait for user to type "done"**

---

### Step 4: MANUAL CHECKPOINT - Review & Apply Results (10 min)

**PAUSE FOR HUMAN INTERVENTION**

Display:
```
MANUAL CHECKPOINT - REVIEW COMPOSER RESULTS
════════════════════════════════════════════

Review Composer's proposed changes before applying.

Results View Shows:
- Field-by-field improvements with accuracy gains
- Original vs Updated descriptions - side-by-side diff
- Impact metrics - percentage improvement per field

Interpreting Results:
- Green +17.5% → Significant improvement, apply it
- >20% improvement → Major gain from clarifying descriptions
- 5-10% improvement → Incremental gains that add up

Steps:
1. Review each proposed change carefully
2. Verify updated descriptions match your requirements
3. Click "Apply Updates to Draft"
4. Publish new processor version (minor bump recommended)

Tip: You can revert using version history if optimizations don't perform well.

When you've applied changes and published, type 'done' to continue.
```

**Wait for user to type "done"**

---

### Step 5: Pull Optimized Schema to Codebase

After Composer optimizes your schema in the dashboard, pull the improved version back to your codebase.

**Use the maintain-schema skill:**

```
/maintain-schema {client-id} {tag-id}
```

This will:
1. Pull the latest published version from ExtendAI
2. Validate config settings
3. Update schema file in codebase
4. Auto-bump patch version
5. Run tests

---

### Step 6: Document Improvements

After pulling, add Composer improvement notes to the schema file's version history:

```typescript
/**
 * ## Version History
 * - v1.0.0 (2024-12-29): Initial config pulled from dashboard
 * - v1.0.1 (2025-01-15): Composer optimization (+12% amount, +8% provider)
 *
 * ## Composer Improvements Applied
 * - amount: +12% accuracy (clarified currency handling)
 * - provider: +8% accuracy (added clinic/hospital examples)
 */
```

---

### Step 7: Report Output

Display:
```
COMPOSER OPTIMIZATION COMPLETE
═══════════════════════════════

Tag: {tag_id}
Processor: {processor_id}

Eval Set: {eval_set_name}
Items: {count} documents with ground truth

Improvements Applied:
- {field1}: +{percent}% accuracy
- {field2}: +{percent}% accuracy
(list all improved fields)

Schema Updated:
- src/clients/{client-id}/schemas/{tag-id}.json
- Version: {old_version} → {new_version}

Next Steps:
- Commit changes with improvement notes
- Deploy to production
- Monitor production accuracy
- Repeat optimization cycle as needed
```

---

## Composer Limitations

**What Composer CAN do:**
- Improve field descriptions (wording, examples, clarifications)
- Optimize extraction rules
- Clarify ambiguous instructions

**What Composer CANNOT do:**
- Change field types or schema structure
- Modify deeply nested fields (>2 levels)
- Change advanced options (chunking, etc.)
- Fix parsing issues (illegible text, bad scans)

---

## Troubleshooting Composer

| Issue | Cause | Fix |
|-------|-------|-----|
| No improvements shown | Eval set too small or descriptions already optimal | Add more diverse samples (30+) |
| Accuracy decreases after applying | Eval set not representative of production | Add more production-like documents |
| Optimization takes too long | Large eval set or high max runs | Reduce max runs, use smaller eval set initially |
| Production accuracy differs | Eval set doesn't match real documents | Add more diverse real-world samples |

---

## Recommended Ongoing Workflow

```
Initial Setup (one-time):
  Phase 4 → Build schema in dashboard (rapid iteration)
  Phase 5 → Pull to codebase (source of truth)
  Phase 9.1-9.2 → Create eval set with 20-30+ docs

Ongoing Optimization Loop:
  1. Collect production failures/HITL corrections
  2. Add to eval set as ground truth
  3. Run Composer optimization in dashboard
  4. Review & apply improvements
  5. Pull updated schema via /maintain-schema
  6. Commit with improvement notes, deploy
  7. Monitor production accuracy
```

---

## API Reference

### Create Evaluation Set
```bash
POST https://api.extend.ai/evaluation_sets
```

### Add Items to Evaluation Set
```bash
POST https://api.extend.ai/evaluation_sets/{eval_set_id}/items
```

### Run Evaluation
```bash
POST https://api.extend.ai/evaluation_sets/{eval_set_id}/run
```

### List Processor Versions (to find latest after Composer)
```bash
GET https://api.extend.ai/processors/{processor_id}/versions
```

---

## Resources

- [ExtendAI Composer Docs](https://docs.extend.ai/product/optimization/composer)
- [Evaluation Overview](https://docs.extend.ai/product/evaluation/overview)
- [Quick Start Guide](https://docs.extend.ai/product/extraction/quick-5-minutes)

---

## Integration

**Not part of onboarding workflow.** This skill is for post-onboarding optimization.

**Prerequisites:**
- Client fully onboarded (Phases 1-8 complete)
- Schema already in codebase (5-onboard-schemas complete)
- Sample documents available for ground truth

**Use when:**
- Setting up initial evaluation baseline
- Running periodic Composer optimization
- Improving accuracy after production feedback
- Building ground truth from HITL corrections
