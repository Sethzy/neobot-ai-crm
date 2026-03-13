# Handover: CRM Tool Consolidation — Implementation

**Date:** 2026-03-12 (updated from 2026-03-09 design review)
**Author:** Seth + Claude
**For:** Developer implementing this with zero prior context

---

## TL;DR

Consolidate 28 CRM agent tools → 11 (9 new + `configure_crm` unchanged + `describe_crm_schema` moved to passive context). All work is in `src/lib/runner/tools/crm/`. Do NOT touch non-CRM tools (those were aligned in commit `68964bb`).

**Execution checklist:** `docs/product/tooling/crm-tool-consolidation-checklist.json`
**Design rationale:** `docs/product/tooling/crm-tool-consolidation.md`

---

## What you're building

| # | New Tool | Replaces | Type |
|---|----------|----------|------|
| 0 | *(passive CRM schema in system-reminder)* | `describe_crm_schema` | Context injection |
| 1 | `search_crm` | 5 search + 4 get_* tools (9 total) | Read |
| 2 | `create_record` | 3 create + 3 batch_create (6 total) | Write |
| 3 | `update_record` | 3 update tools | Write |
| 4 | `delete_records` | 5 per-entity delete tools | Write (approval-gated) |
| 5 | `link_records` | 3 link + 3 unlink tools (6 total) | Write |
| 6 | `crm_sql` | *(new — read-only SQL escape hatch)* | Read |
| 7 | *(rewire index.ts)* | — | Wiring |
| 8 | *(update system prompt + autopilot refs)* | — | References |
| 9 | *(cleanup old tests)* | — | Cleanup |

**Total agent tools after:** 52 → 33

---

## How to execute

1. Open `docs/product/tooling/crm-tool-consolidation-checklist.json`
2. Work through `implementation_order` (0 → 9)
3. Each entry has:
   - `kills` — exact old tool names + source file locations + test files to rewrite/delete
   - `creates` — new file path + test file path
   - `new_tool` — exact name, description, params (types + descriptions), response shape
   - `implementation` — routing logic, reusable code references, per-entity specifics, gotchas
4. After each tool: run tests, mark `status: "DONE"` in the JSON
5. After all tools: run full test suite, grep for any remaining old tool name references

---

## Files — final state

### DELETE (6 source files)
- `schema.ts` — replaced by system-reminder injection
- `contacts.ts` — split across `search.ts`, `create-record.ts`, `update-record.ts`, `delete-records.ts`
- `companies.ts` — same
- `deals.ts` — same
- `deal-contacts.ts` — replaced by `search.ts` (get_*) + `link-records.ts` (link/unlink)
- `company-links.ts` — replaced by `search.ts` (get_*) + `link-records.ts` (link/unlink)

### CREATE (6 source files)
- `search.ts` — `search_crm`
- `create-record.ts` — `create_record`
- `update-record.ts` — `update_record`
- `delete-records.ts` — `delete_records`
- `link-records.ts` — `link_records`
- `crm-sql.ts` — `crm_sql`

### MODIFY (5 files)
- `index.ts` — rewrite factory to register new tools
- `interactions.ts` — remove `search_interactions` + `delete_interaction`, keep `create_interaction`
- `tasks.ts` — remove `search_tasks` + `delete_task`, keep `create_task` + `update_task`
- `src/lib/ai/system-prompt.ts` — add CRM schema to system-reminder, update tool name strings
- `src/lib/autopilot/constants.ts` — update tool name strings in autopilot prompt

### KEEP UNCHANGED
- `filter-utils.ts` — shared search/date utilities (used by new tools)
- `custom-fields.ts` — deep-merge logic (used by `create-record.ts`, `update-record.ts`)
- `configure-crm.ts` — setup-mode only, out of scope

---

## Gotchas

1. **`update_deal` has analytics logic.** When `stage` changes, it fires a `deal_stage_changed` PostHog event with `from_stage`, `to_stage`, `deal_value`. This MUST be preserved in `update_record`. See `deals.ts:193-254`.

2. **`batch_create_contacts` has intra-batch dedup.** It checks for duplicate names within the array before hitting the DB. This must be generalized in `create_record` for all entity types.

3. **`deal_contacts` is a junction table, not an FK.** `link_records` must handle two different patterns: INSERT/DELETE on `deal_contacts` (contact_deal) vs UPDATE FK on contacts/deals table (contact_company, deal_company).

4. **`interactions.ts` and `tasks.ts` are partially kept.** Remove their search and delete exports, but keep create/update. Don't delete the whole file.

5. **38 files reference old tool names.** The checklist JSON (entry `9_cleanup_tests`) lists all integration test files that need grep + update. The system prompt and autopilot constants are the most critical.

6. **`crm_sql` is separate from `run_agent_memory_sql`.** They use the same underlying RPC but have different descriptions and the CRM version adds a `purpose` audit field. Don't merge them.

---

## Reference material

If you need to understand *why* any decision was made:
- **Design doc:** `docs/product/tooling/crm-tool-consolidation.md` — full rationale, rejected approaches, safety analysis
- **CRM vs Tasklet drift:** `roadmap docs/Sunder - Source of Truth/tool-infrastructure-comparison/2026-03-02-pr6-crm-vs-tasklet-hubspot-drift.md`
- **Tool comparison JSON:** `docs/product/tooling/tool-comparison-tasklet-vs-sunder.json` — non-CRM tools already aligned

---

## Project context

- **Product:** Sunder — AI orchestration SaaS for solo real estate agents in Singapore
- **Tech stack:** Next.js 15 + Vercel AI SDK v6 + Supabase (Postgres + RLS)
- **Source of truth:** `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
- **CLAUDE.md** at repo root has full conventions
- **Current state:** Phases 1-3 done, Phase 4 in progress
