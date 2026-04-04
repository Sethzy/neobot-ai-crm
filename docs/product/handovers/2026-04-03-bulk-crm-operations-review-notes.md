# Bulk CRM Operations — Review Notes

**Date:** 2026-04-03
**Reviewer:** Codex
**Primary artifact reviewed:** `docs/product/tasks/2026-04-03-bulk-crm-operations-tasklist.md`
**Context reviewed:** `docs/product/designs/2026-04-03-batch-enrichment-skill-design.md`, `docs/product/designs/2026-04-03-batch-enrichment-infra-review.md`

## Blocking findings

### 1. The tasklist says "single SQL transaction", but the proposed implementation is not one

Tasklist step 1.4 says the bulk path should "do a single SQL transaction", then immediately proposes individual Supabase `.update().eq(...).eq(...)` calls in `Promise.all` chunks of 25. Those are separate HTTP requests through PostgREST, not one SQL statement and not one DB transaction.

Why this matters:
- No atomicity: partial success is possible by design.
- Error semantics differ from a real transaction.
- Performance expectations should be framed as "concurrent fanout", not "bulk SQL".

Recommendation:
- Either rename the approach to `concurrent bulk-ish updates via PostgREST`, or
- If true transactional bulk update is required, move the write path to a server-side SQL/RPC function that accepts a JSON payload.

### 2. Skipping `custom_fields` merge and deal-stage analytics unconditionally would introduce silent semantic regressions

Current `update_record` behavior guarantees:
- `custom_fields` are merged, not replaced, in [`src/lib/runner/tools/crm/update-record.ts`](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/crm/update-record.ts#L162)
- `deal_stage_changed` is emitted when a stage actually changes in [`src/lib/runner/tools/crm/update-record.ts`](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/crm/update-record.ts#L192)

The tasklist bulk path would drop both guarantees for batches above 50. That is too large a behavioral split for a tool that is supposed to keep the same interface.

Recommendation:
- Keep the fast path when those features are not needed.
- Preserve current semantics when they are needed by batch-fetching the prerequisite state once, then processing in memory.

## Answers

### 1. Bulk update path skipping custom field deep-merge

Recommendation: **Only skip the merge work when no record in the batch includes `custom_fields`. Do not overwrite unconditionally.**

Rationale:
- The current tool description explicitly promises deep-merge behavior in [`src/lib/runner/tools/crm/update-record.ts`](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/crm/update-record.ts#L36).
- The enrichment use case does not need `custom_fields`, so the common batch path can remain fast.
- If any patch includes `custom_fields`, fetch existing `custom_fields` for the touched IDs in a batched pre-read, merge in memory, then issue the updates.

Suggested implementation shape:
- `const hasCustomFieldPatches = updates.some((u) => "custom_fields" in u.fields)`
- If false: no pre-read.
- If true: prefetch `{ pk, custom_fields }` in chunks, map by ID, merge in memory, then update.

I would not document "bulk overwrites custom fields" as a limitation. That is too easy to forget and too destructive.

### 2. Bulk update path skipping deal stage analytics

Recommendation: **Only skip the analytics work when no patch includes `stage`. If any patch includes `stage`, preserve semantics with a batched pre-read and batched event capture.**

Rationale:
- The current tool is general-purpose, not enrichment-specific.
- Silent loss of `deal_stage_changed` for large batches would create reporting drift later.
- The common enrichment case pays zero extra cost because those batches do not patch `stage`.

Suggested implementation shape:
- `const stagePatches = entity === "deals" ? updates.filter((u) => typeof u.fields.stage === "string") : []`
- If `stagePatches.length === 0`: skip pre-read and analytics entirely.
- Otherwise: fetch prior `{ deal_id, stage, amount }` once for touched deals, compare after update, and send only the changed ones via `captureServerEvents`.

### 3. `Promise.all` in chunks of 25

Recommendation: **25 concurrent PATCHes is a reasonable interim concurrency, but the tasklist should stop calling it a transaction.**

What I validated:
- The current Supabase org is on the **Free** plan as of 2026-04-03.
- `SHOW max_connections` on project `xtewwwycvapskgvfnliq` returned **60** on 2026-04-03.
- Supabase's published defaults say **Nano (free)** has **60 direct connections** and **200 pooler connections**.
- Supabase docs do not publish a tiny PostgREST-specific PATCH concurrency limit that would make `25` obviously unsafe.

Interpretation:
- 25 concurrent requests is comfortably below the published pooler ceiling for a free project.
- I do not see evidence that PostgREST itself is the bottleneck at 25 concurrent PATCH requests.
- The bigger issue is that 25 separate requests are still 25 separate writes with partial-failure semantics.

Would a single multi-row `UPDATE` be better?
- Yes, in principle.
- No, not with the currently described implementation surface.
- With Supabase/PostgREST, one `.update()` applies one patch to all matched rows. Here each row has a different patch shape.
- A true multi-row update would need a server-side SQL/RPC path or equivalent JSON-to-recordset SQL. That is broader than "just parallelize the existing code path".

Practical conclusion:
- Keep the concurrent fanout approach if scope must stay small.
- Use a named constant like `BULK_UPDATE_CONCURRENCY = 25`.
- Describe it as a throughput optimization, not as SQL bulk update.

Sources:
- Supabase docs: https://supabase.com/docs/guides/troubleshooting/how-to-change-max-database-connections-_BQ8P5
- Supabase docs: https://supabase.com/docs/guides/database/connection-management

### 4. `create_record` dedup with `WHERE LOWER(name) IN (...)`

Recommendation: **The `IN` list size is fine for Postgres itself, but chunk if this goes through PostgREST query parameters. The bigger issue is indexability and implementation shape, not planner safety.**

Rationale:
- 500 values in an `IN (...)` predicate is not inherently a Postgres planner problem.
- The repo's existing indexes are:
  - companies: `(client_id, name)` in [`supabase/migrations/20260307000000_add_companies_table.sql`](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260307000000_add_companies_table.sql#L19)
  - contacts: `(client_id, last_name, first_name)` in [`supabase/migrations/20260301110000_create_crm_contacts.sql`](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260301110000_create_crm_contacts.sql#L17)
  - deals do not currently have an address index in [`supabase/migrations/20260301110001_create_crm_deals.sql`](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260301110001_create_crm_deals.sql#L16)
- `LOWER(name)` will not use the plain `(client_id, name)` index unless you add a matching expression index.
- Through Supabase JS / PostgREST, `LOWER(name) IN (...)` is also not the cleanest filter shape.

Practical conclusion:
- If you keep this on the PostgREST path, chunk the batch dedup query by roughly 100-200 keys to avoid very long filter URLs and keep the response bounded.
- If you move dedup into SQL/RPC, 500 keys in one query is fine.
- If bulk dedup becomes a core workflow, add expression indexes or normalized shadow columns. Otherwise one or a few batched scans are still much better than 500 per-record `ilike` queries.

### 5. The `50` threshold

Recommendation: **Keep `50` as the response-shape threshold.**

Rationale:
- `50` is the old hard cap, so keeping `<= 50` on the existing "return full records" path preserves prior behavior exactly.
- Moving the threshold to `100` would create a new 51-100 range with much larger tool outputs and more context bloat.
- `summary_only: true` would be a new tool parameter, which cuts against the "same tool interface" goal.
- Tying response shape to `force_create` mixes two unrelated concerns: dedup policy and output size.

If you want to revisit this later, do it as a separate UX/tool-contract change. For this PR, `50` is the cleanest compatibility line.

### 6. Vocabulary normalization in the bulk path

Recommendation: **Keep normalization in the tool path. The script can pre-normalize, but the tool should remain defensive.**

Rationale:
- `matchVocabularyValue()` is cheap in-memory string work compared with HTTP requests and DB writes.
- The current single-record update and create paths already normalize vocabulary in the tool layer:
  - updates in [`src/lib/runner/tools/crm/update-record.ts`](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/crm/update-record.ts#L131)
  - creates in [`src/lib/runner/tools/crm/create-record.ts`](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/crm/create-record.ts#L141)
- If normalization only lives in the enrichment script, other callers of `update_record` and `create_record` would diverge.

Practical conclusion:
- Keep normalization in the tool.
- Treat script-side normalization as an optional optimization, not the source of truth.

## Recommended tasklist edits

1. Replace "single SQL transaction" with "concurrent per-record updates through Supabase/PostgREST".
2. Change custom-field handling from "skip merge in bulk" to "skip merge only when no patch includes `custom_fields`; otherwise prefetch and merge".
3. Change stage analytics handling from "skip in bulk" to "skip only when no patch includes `stage`; otherwise prefetch prior state and emit batched events".
4. Clarify that `25` is a concurrency constant, not a proven platform ceiling.
5. Reword the large-create dedup item to note that `LOWER(...) IN (...)` via PostgREST is an implementation detail that may require chunking or an RPC path.

## Bottom line

The overall direction is correct: raise the tool limits to 500, keep `<= 50` as the full-record response path, and use a faster bulk path above that threshold.

The tasklist should be tightened before execution so it does not:
- mislabel concurrent PATCH fanout as a SQL transaction,
- introduce silent semantic regressions for `custom_fields`,
- or silently drop `deal_stage_changed` analytics for large batches.
