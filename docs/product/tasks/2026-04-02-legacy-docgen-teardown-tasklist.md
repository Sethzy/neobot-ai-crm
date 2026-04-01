# Legacy Docgen Teardown Tasklist

**Goal:** Remove the old document-processing product end-to-end: analyst chat, quick export/docgen, Gemini extraction API pipeline, legacy `pages/api` entrypoints, and the dashboard surfaces that still expose them.

**Why now:** This stack is outside the current product direction, bypasses the approved AI SDK runtime, duplicates chat infrastructure, and leaves a large amount of legacy debug logging in hot paths.

**Status:** Planning only. Do not implement from this tasklist until approved for execution.

## Scope

This teardown removes the old "case documents + analyst + report generation" product slice:

- `/cases` detail experience that still exposes `AI Analyst` and `Reports`
- analyst chat UI and its custom SSE/localStorage transport
- quick export / docgen report history flow
- Gemini document-processing endpoints and helper libraries
- legacy `pages/api/**` bridges kept around for the old product
- obsolete tests, references, and QA/docs that only exist for this slice

This teardown does **not** remove:

- the main `/chat` product
- the runner engine, AI SDK chat transport, or current tool system
- CRM entities and pages
- sandbox skills, agent-generated views, or current file upload support used by `/chat`
- historical migrations and historical handover docs unless they are actively misleading

## Product Alignment

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
  The v2 plan says the product is AI CRM + autopilot + connections + channels. The old docgen stack is now drift, not core scope.
- `roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md`
  Use only for rationale if needed. v2 plan still wins.

## Read Before Coding

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
- `docs/product/tasks/2026-03-30-pr60-vault-teardown-tasklist.md`
- `app/(dashboard)/cases/[caseId]/page.tsx`
- `src/components/analyst/analyst-section.tsx`
- `src/hooks/use-analyst-chat.ts`
- `src/hooks/use-docgen.ts`
- `src/components/docgen/report-history.tsx`
- `pages/api/analyst/chat.ts`
- `pages/api/docgen/generate.ts`
- `pages/api/gemini/process.ts`
- `src/server/api/chat.ts`
- `src/server/api/docgen/generate.ts`
- `src/server/api/gemini/process.ts`

## Assumptions

- The old analyst/docgen/case-processing product is fully retired, not being replaced in-place.
- Existing customer-facing workflows should route to `/chat` or CRM surfaces, not to a reduced "read-only cases" shell.
- Historical migrations stay on disk. Teardown should happen via new forward-only cleanup migrations where DB/storage removal is required.
- The safest order is: remove user-facing entrypoints first, then server/API code, then storage/database glue, then docs/tests cleanup.

## Non-Goals

- Do not migrate the analyst feature onto AI SDK in this PR. This is a removal, not a rewrite.
- Do not refactor unrelated chat surfaces while touching shared utilities.
- Do not "quiet" all logs in the entire app. Only remove logs tied to the legacy docgen slice in this teardown.
- Do not touch the main `/chat` transport unless a dead import/reference from the removed stack forces it.

## Relevant Files

**Primary UI surfaces**
- `app/(dashboard)/cases/[caseId]/page.tsx`
- `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx`
- `app/(dashboard)/cases/page.tsx`
- `src/components/analyst/**`
- `src/components/docgen/report-history.tsx`
- `src/components/library/**`

**Legacy hooks**
- `src/hooks/use-analyst-chat.ts`
- `src/hooks/use-docgen.ts`
- `src/hooks/use-upload-processor.ts`
- `src/hooks/use-splits.ts`
- `src/hooks/use-documents.ts`
- `src/hooks/use-cases.ts`

**Legacy server/API**
- `pages/api/analyst/chat.ts`
- `pages/api/docgen/generate.ts`
- `pages/api/gemini/process.ts`
- `src/server/api/chat.ts`
- `src/server/api/docgen/generate.ts`
- `src/server/api/gemini/process.ts`
- `src/api/gemini-process.ts`

**Legacy libraries**
- `src/lib/analyst/**`
- `src/lib/docgen/**`
- `src/lib/gemini-files.ts`
- `src/lib/report-history.ts`
- `src/lib/gemini.ts`

**Likely DB/storage touchpoints**
- `src/types/database.ts`
- `supabase/migrations/**` for new teardown migration(s)
- storage buckets and tables backing old docs/reports if still live

**Tests/docs likely to delete or update**
- `src/hooks/__tests__/use-analyst-chat.test.ts`
- `src/hooks/use-docgen.test.ts`
- `src/lib/__tests__/report-history.test.ts`
- `src/api/gemini-process*.test.ts`
- `src/server/api/__tests__/chat*.test.ts`
- case/analyst/docgen component tests
- docs and QA references that still describe the old product as active

## Execution Order

1. Remove user-visible entrypoints and navigation first.
2. Remove frontend hooks/components for analyst/docgen.
3. Delete legacy API routes and provider-specific server code.
4. Remove document-processing background triggers and report-history helpers.
5. Add teardown migration(s) for old DB/storage assets if they are no longer needed.
6. Regenerate types, delete/update tests, then clean docs and QA references.

## Task 1: Freeze And Inventory The Legacy Surface

**Goal:** Prevent partial removal mistakes by enumerating every live entrypoint and dependency before deleting anything.

**Deliverables**
- A checked list of all routes, hooks, background triggers, and tables belonging to the old docgen product
- Clear keep/delete decisions for each file group

**Steps**
1. Run a code search for `analyst`, `docgen`, `gemini/process`, `report_history`, `splits`, `useReportHistory`, and `/api/analyst/chat`.
2. Capture all live route entrypoints that still expose the old product.
3. Confirm whether `/cases` should be fully removed or reduced to a redirect.
4. Confirm whether `documents`, `splits`, `cases`, and `report_history` tables are entirely dead after UI/API removal.

**Exit Criteria**
- No ambiguity remains about whether this is a feature removal versus a backend-only cleanup.

## Task 2: Remove The Dashboard Entry Surface

**Goal:** Stop users from entering the retired product.

**Files**
- `app/(dashboard)/cases/[caseId]/page.tsx`
- `app/(dashboard)/cases/page.tsx`
- any sidebar/nav entries that link to `/cases`
- related page/component tests

**Steps**
1. Remove the `AI Analyst` tab and `Reports` tab from the case detail page.
2. Remove lazy imports and preload hooks for analyst/docgen/library sections.
3. Decide whether `/cases` and `/cases/[caseId]` are deleted entirely or replaced with redirects.
4. Remove any route-level counts or badges that depend on report history.
5. Update tests so the old surface is no longer expected.

**Preferred outcome**
- `/cases*` no longer presents a partial zombie product. Either it is gone or it clearly redirects elsewhere.

## Task 3: Delete Analyst UI And Custom Transport

**Goal:** Remove the duplicated chat system instead of carrying a second transport stack.

**Files**
- `src/components/analyst/**`
- `src/hooks/use-analyst-chat.ts`
- `src/hooks/__tests__/use-analyst-chat.test.ts`
- `src/lib/analyst/**`

**Steps**
1. Delete the analyst section and all dependent UI components.
2. Delete the custom SSE parser, localStorage session persistence, visibility handling, and upload-specific chat plumbing.
3. Remove any imports from case pages or shared components that reference analyst code.
4. Remove analyst-only tests and mocks.

**Notes**
- This is the highest-value architecture cleanup because it removes the non-AI-SDK chat path entirely.

## Task 4: Delete Report Generation And Report History

**Goal:** Remove quick export/docgen instead of leaving dead report infrastructure behind.

**Files**
- `src/hooks/use-docgen.ts`
- `src/components/docgen/report-history.tsx`
- `src/lib/report-history.ts`
- `src/server/api/docgen/generate.ts`
- `pages/api/docgen/generate.ts`
- any report-history consumers

**Steps**
1. Remove the quick export action from analyst UI before deleting the UI itself.
2. Delete the report-history hook and component.
3. Delete the report generation route and helper library.
4. Remove report-history table access from frontend code.
5. Remove report-related tests.

**Decision checkpoint**
- If the `report_history` table has no remaining non-legacy use, drop it in the teardown migration. Otherwise, explicitly document the surviving owner.

## Task 5: Delete Gemini Processing Pipeline

**Goal:** Remove the direct-provider document-processing stack and its background trigger path.

**Files**
- `src/server/api/gemini/process.ts`
- `pages/api/gemini/process.ts`
- `src/api/gemini-process.ts`
- `src/lib/gemini-files.ts`
- `src/lib/gemini.ts`
- `src/hooks/use-upload-processor.ts`
- any tests for these modules

**Steps**
1. Remove the `/api/gemini/process` endpoint and the `pages/api` bridge.
2. Delete provider-specific Gemini helper modules that only exist for this pipeline.
3. Remove `triggerGeminiProcessing()` from the upload processor.
4. Decide whether the entire upload queue/case-documents flow should also be removed with this product.
5. Remove associated tests and mocks.

**Important**
- Do not leave an upload flow that still creates `documents` rows but no longer processes them.

## Task 6: Remove Legacy `pages/api` Bridges

**Goal:** Finish the Pages Router teardown for the retired product.

**Files**
- `pages/api/analyst/chat.ts`
- `pages/api/docgen/generate.ts`
- `pages/api/gemini/process.ts`

**Steps**
1. Delete all three route bridges after frontend callers are removed.
2. Verify no remaining `fetch()` calls point to these URLs.
3. Verify no docs still instruct users or tests to use these routes.

## Task 7: Clean Shared Imports, Types, And Dead Utilities

**Goal:** Avoid keeping orphaned modules just because they are still imported somewhere obscure.

**Files**
- shared hooks/components touched by the removed code
- `src/types/database.ts`
- any barrel files or dead exports

**Steps**
1. Run global search for removed symbols and imports.
2. Remove dead query keys, helper types, and unused utility modules.
3. Regenerate database types after any DB teardown migration.
4. Re-run lint/typecheck/build to catch stragglers.

## Task 8: Drop Obsolete Database And Storage Assets

**Goal:** Remove backend state that exists only for the retired product.

**Potential assets**
- `report_history`
- `splits`
- `documents`
- `cases`
- old storage buckets such as `reports` and any legacy document bucket if unused outside this product

**Steps**
1. Confirm no surviving product surface depends on each table/bucket.
2. Write new forward-only Supabase migration(s) to drop only the retired assets.
3. Preserve historical migrations; do not rewrite old files.
4. Regenerate DB types.

**Decision checkpoint**
- If any of these tables still support a live non-docgen workflow, stop and split the teardown so we do not over-delete.

## Task 9: Remove Legacy Debug Logging In The Removed Slice

**Goal:** Ensure deleting the legacy stack also deletes its noisy logging.

**Examples already identified**
- `src/hooks/use-analyst-chat.ts`
- `src/components/analyst/chat-input.tsx`
- `src/components/analyst/analyst-section.tsx`
- `src/server/api/gemini/process.ts`
- `src/lib/gemini-files.ts`
- `src/lib/report-history.ts`

**Steps**
1. Delete logs by deleting the modules where possible.
2. For any shared code that survives, remove only logs that existed for the legacy product.
3. Verify no old debug markers remain in the codebase after teardown.

## Task 10: Documentation And QA Cleanup

**Goal:** Remove references that would mislead future work.

**Update or delete**
- active docs under `docs/product/tasks/`, `docs/product/handovers/`, `docs/product/tooling/`, and QA docs that describe the old docgen product as live
- README/product docs if they mention analyst/docgen as active

**Keep**
- historical plan and architecture docs that are clearly archival
- old migrations and old handovers that remain useful as history, unless they are still linked from active docs as current behavior

**Steps**
1. Remove active references from current tasklists, trackers, and QA docs.
2. Mark any unavoidable historical docs as deprecated if they remain in-tree.
3. Ensure no active "how to use the product" doc points at `/cases`, analyst chat, or quick export.

## Verification Checklist

Run at the end of the teardown:

```bash
pnpm lint
pnpm build
pnpm test:run
rg -n "analyst|docgen|gemini/process|report_history|/api/analyst/chat|/api/docgen/generate|/api/gemini/process" app src pages
```

Expected end state:

- no user-facing analyst/docgen surface remains
- no `pages/api` bridge remains for the retired product
- no direct provider runtime for the retired product remains
- no legacy debug logs remain from this slice
- build, lint, and tests pass

## Suggested Commit Breakdown

1. `chore(legacy-docgen): remove cases entry surface and analyst ui`
2. `chore(legacy-docgen): remove docgen routes and report history`
3. `chore(legacy-docgen): remove gemini processing pipeline`
4. `chore(legacy-docgen): drop retired docgen data model`
5. `chore(legacy-docgen): clean docs tests and qa references`

## Open Questions To Resolve Before Execution

1. Should `/cases` be deleted entirely, or temporarily redirect to `/chat`?
2. Are `cases`, `documents`, and `splits` fully dead product concepts, or is any subset still needed?
3. Should `report_history` be dropped now, or left one release behind for data export/backfill?
4. Do we want a short-lived migration period where the UI is removed first and DB teardown lands second?
