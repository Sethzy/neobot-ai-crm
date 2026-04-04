# Handover: Bulk CRM Operations — Tasklist Review

**Date:** 2026-04-03
**Author:** Seth
**Status:** Tasklist written, needs review before execution

---

## Context

We're enabling batch enrichment of 500+ CRM records. The bottleneck isn't the enrichment itself (that runs in the sandbox) — it's writing results back to the CRM. Today, `update_record` caps at 50 per call and runs sequential per-record DB queries. The agent hits "one tool per step" limits trying to write 500 records across 10 separate calls.

The fix: raise the limit on `update_record` and `create_record` to 500, add a bulk code path that parallelizes DB writes, and return counts instead of full records for large batches.

No new tools. Same tool interface. The agent doesn't know anything changed.

---

## What to review

### The tasklist

`docs/product/tasks/2026-04-03-bulk-crm-operations-tasklist.md`

### The design doc (for context on why)

`docs/product/designs/2026-04-03-batch-enrichment-skill-design.md`

### The infra review (for sandbox/API constraints)

`docs/product/designs/2026-04-03-batch-enrichment-infra-review.md`

---

## Specific things to validate

### 1. The bulk update path skipping custom field deep-merge

The tasklist says bulk updates skip `mergeCustomFields()` (which fetches each record's existing custom_fields before merging). This is a behavior change — at ≤50 records, custom fields are deep-merged (existing keys preserved). At >50, they're overwritten.

**Question:** Is this the right call? The enrichment use case writes to standard fields (industry, employee_count, notes), not custom_fields. But if someone uses the bulk path for custom fields, they'd lose existing values. Should we:
- Always skip deep-merge for bulk (simpler, documented as a known limitation)
- Always deep-merge but batch the fetches into one query instead of N queries
- Only skip deep-merge if no record in the batch has `custom_fields` in its patch

### 2. The bulk update path skipping deal stage analytics

The tasklist says bulk updates skip the `deal_stage_changed` analytics event. The current single-record path fetches the previous stage, compares, and fires a PostHog event if it changed.

**Question:** For batch enrichment, deals don't change stage — the agent is writing industry/description, not moving pipeline stages. But `update_record` is a general tool. If someone later calls it with 100 deal stage changes, those analytics events silently disappear. Should we:
- Skip analytics for all bulk updates (simpler, documented)
- Only skip if no record in the batch patches `stage`
- Always run analytics but batch the previous-stage fetches

### 3. Promise.all in chunks of 25

The tasklist proposes chunking Supabase `.update()` calls into batches of 25 via `Promise.all`. This means 500 records = 20 parallel chunks of 25.

**Question:** Is 25 the right chunk size for Supabase's connection pool? Check:
- What's the Supabase connection pool limit on our plan?
- Does the PostgREST proxy handle 25 concurrent PATCH requests?
- Would a single multi-row UPDATE statement be more efficient than 25 individual ones?

### 4. The create_record dedup optimization

The tasklist proposes batch dedup for large creates — one `WHERE LOWER(name) IN (...)` query instead of N individual queries. 

**Question:** At 500 records, that's a `WHERE ... IN` clause with 500 values. Is this safe for Postgres query planning? Should we cap the IN clause and chunk it?

### 5. The 50 threshold

Batches ≤50 return full records. Batches >50 return counts only. This is the behavioral split point.

**Question:** Is 50 the right number? The existing tool already supported 50 with full records. We could also consider:
- 100 (matches HubSpot's batch size)
- Any batch with `force_create: true` returns counts (since it's clearly a bulk import)
- Let the agent choose via an optional `summary_only: true` param

### 6. Vocabulary normalization in bulk path

The tasklist says to normalize vocabulary values (stage, type, industry) in the bulk path same as `updateOne`. This means calling `matchVocabularyValue()` for each record.

**Question:** Is this the right place to do it, or should the enrichment script pre-normalize? If the script writes "Logistics" but the config has "logistics", `matchVocabularyValue` handles it. But this adds per-record processing in the bulk path.

---

## Key files

| File | What it does |
|------|-------------|
| `src/lib/runner/tools/crm/update-record.ts` | The update tool — main change target |
| `src/lib/runner/tools/crm/create-record.ts` | The create tool — limit raise + summary response |
| `src/lib/runner/tools/crm/custom-fields.ts` | Custom field deep-merge logic |
| `src/lib/runner/tools/crm/__tests__/update-record.test.ts` | Existing update tests |
| `src/lib/runner/tools/crm/__tests__/create-record.test.ts` | Existing create tests |
| `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` | Shared mock for CRM tests |
| `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` | Sandbox timeout (separate concern) |

---

## Deliverable

Review notes as a companion doc or inline comments on the tasklist. Specifically answer the 6 questions above. No code changes needed — this is a design review of the implementation approach.
