# CRM Tool Efficiency Review

**Date:** 2026-04-13
**Scope:** Managed-agent CRM tools only
**Code reviewed:** `src/lib/managed-agents/tools/crm/*`, `src/lib/managed-agents/tools/declarations.ts`, `src/lib/managed-agents/tools/utility/run-sql.ts`, `scripts/managed-agents/create-agent.ts`

## Executive Summary

The CRM surface is much better than the pre-consolidation state, but it still misses the stated target of "most common requests in 1-2 calls" for several frequent workflows. Read-heavy single-record summaries are mostly good now because `search_crm.include` collapses 3-5 reads into one call, but there are three structural gaps:

1. `search_crm` is still single-entity, single-hop, and `select("*")` on the primary rows, so it is efficient for "one deal" and inefficient for portfolio-wide, cross-entity, or relationship-shaped questions.
2. Write workflows still fan out because creation, linking, note creation, interaction logging, and task creation are mostly separate primitives.
3. There is no first-class path for attachment content reads, note update/delete, or config reads.

The biggest efficiency win is not another generic escape hatch. It is a narrower set of additions:

1. Add a read-only config path (`get_crm_config`, or inject `crmConfig` into tool context so `get_agent_db_schema` can expose it).
2. Extend `search_crm` with `fields`, `count_only`, and at least one multi-hop include (`company` on deals/contacts, or nested contacts-with-deals for company reads).
3. Add a batched/compound relationship write path so "create/link/log/task" workflows stop taking 3-4 calls.
4. Add first-class attachment reading and note CRUD.
5. Remove or demote low-frequency tools from the default agent toolset (`list_record_attachments`, probably `manage_views`) to reduce model decision space and tool-description tokens.

## Ranked Changes

| Rank | Change | Why it matters |
| --- | --- | --- |
| 1 | Add `get_crm_config` or inject `crmConfig` into managed-agent tool context | The agent currently has no reliable read path for valid stages, contact types, industries, or interaction types. That creates avoidable uncertainty before writes. |
| 2 | Extend `search_crm` with `fields`, `count_only`, and pagination/cursor semantics | `search_crm` currently does `select("*")` on primary rows and can only return row payloads, not counts. This is the main source of token waste. |
| 3 | Add multi-hop include support for common shapes | `company -> contacts with their deals` and `deal/contact -> company details` still require extra reads. |
| 4 | Add a compound write path for create+link+task / link+interaction | Common CRM workflows still take 3-4 calls because writes are too atomic. |
| 5 | Add `read_record_attachment` and note CRUD (`update_note`, `delete_note`, or fold into existing tools) | Current gaps force `run_sql` hacks or make workflows impossible. |
| 6 | Add batched relationship writes to `link_records` | Bulk imports are efficient only for record creation, not for relationship creation. |
| 7 | Remove `list_record_attachments` from the default toolset | `search_crm.include: ['attachments']` overlaps with it for most reads. Keeping both expands decision space. |
| 8 | Consider removing `manage_views` from the default agent toolset | It is valid product functionality, but low-frequency agent work. It likely does not deserve permanent prompt budget. |

## Scenario Matrix

### 1. Context Gathering

| Scenario | Current minimum sequence | Current calls | Optimal calls | Useful or wasteful? | Recommendation |
| --- | --- | ---: | ---: | --- | --- |
| Tell me everything about the Nassim Hill deal | `search_crm(entity:'deals', query:'Nassim Hill', include:['contacts','interactions','notes','tasks','attachments'])` | 1 | 1 | Good collapse. Waste comes from primary `select("*")` and the fact that company details are not included, only `company_id`. | Keep as-is, but add `company` include or a `fields` selector. |
| Give me a summary of David Lee | `search_crm(entity:'contacts', query:'David Lee', include:['deals','interactions','notes','tasks','attachments'])` | 1 | 1 | Good collapse. Same caveat: company details are missing, only `company_id` is present on the parent contact row. | Keep as-is, but add `company` include for contacts. |
| What files are attached to my deals? | `search_crm(entity:'deals', include:['attachments'])` | 1 | 1 | Efficient only for the first 20 deals and first 10 attachments per deal. There is no pagination, no count-only mode, and no attachment content path. | Add pagination or `count_only`; expose a read path for attachment contents. |
| Who haven't I spoken to in 2 weeks? | `run_sql(query: contacts LEFT JOIN interactions with MAX(occurred_at) filter)` | 1 | 1 | Correct use of `run_sql`. `search_crm` cannot express "latest interaction per contact". | Keep `run_sql`; do not try to force this into `search_crm`. |
| What's my pipeline value by stage? | `run_sql(query: SELECT stage, SUM(amount) ... GROUP BY stage)` | 1 | 1 | Correct use of `run_sql`. | Keep `run_sql`; add `count_only` or aggregate helper only if this pattern is dominant. |
| Show me all contacts at Acme Corp with their deals | `search_crm(entity:'companies', query:'Acme Corp', limit:1)` -> `search_crm(entity:'contacts', filters:{company_id:'...'}, include:['deals'])` | 2 | 1 | Current surface cannot return contact-level rows with their deals from a company lookup alone. `companies include ['contacts','deals']` gives two flat sibling arrays, not contact->deal groupings. | Add multi-hop include or a global/multi-entity search mode. |

**Scenarios requiring 3+ calls:** none in this category if `run_sql` is allowed, but "portfolio-wide files" becomes awkward once the user has more than 20 deals or wants attachment contents.

### 2. Write Workflows

| Scenario | Current minimum sequence | Current calls | Optimal calls | Useful or wasteful? | Recommendation |
| --- | --- | ---: | ---: | --- | --- |
| Add David Lee as a buyer on the Nassim Hill deal and log that we had a call | `search_crm(contacts, query:'David Lee')` -> `search_crm(deals, query:'Nassim Hill')` -> `link_records(contact_deal)` -> `create_interaction(...)` | 4 | 2 | Two separate lookups plus two separate writes. This is the clearest miss against the 1-2 call target. | Add either multi-entity lookup plus a compound write (`link + interaction`), or allow `link_records` to accept optional interaction payloads. |
| Create a new contact, link them to this deal, and set a follow-up task | If deal ID is already known: `create_record` -> `link_records` -> `create_task`. If not: add one `search_crm` first. | 3-4 | 1-2 | The write fan-out is structural. `create_record` cannot express follow-on relationships or task creation. | Add optional `relationships` and `post_create_tasks` payloads to `create_record`, or add a dedicated compound workflow tool. |
| Bulk import these 10 contacts | `create_record(entity:'contacts', records:[...10])` | 1 | 1 | Good for create-only imports. | Keep. |
| Bulk import these 10 contacts and link them to one deal | `create_record(entity:'contacts', records:[...10])` -> 10x `link_records(contact_deal)` | 11 | 2 | Batch create exists; batch link does not. This is an avoidable explosion in steps. | Add batched `link_records` input or relationship hooks inside `create_record`. |
| Move this deal to negotiation stage and add a note about why | `update_record(entity:'deals', updates:[{id, fields:{stage:'negotiation', notes:'...'}}])` | 1 | 1 | Good. `update_record` already special-cases note creation. | Keep. |

### 3. Edge Cases That Break Flow

| Scenario | Current state | Calls | Awkwardness | Recommendation |
| --- | --- | ---: | --- | --- |
| Read an attachment's contents | No first-class CRM path. `search_crm` and `list_record_attachments` return metadata only, without `storage_path` (`search.ts:116-123`, `125-167`, `169-199`; `list-attachments.ts:25-42`). Existing attachments are only readable by falling back to `run_sql` to fetch `storage_path`, then `storage_read('/agent/...')`. | 2 via workaround | High | Add `read_record_attachment(attachment_id)` or expose `agent_path` in attachment metadata. |
| Update a note | No tool supports note updates. Notes are only created via `create_record`/`update_record` special handling (`create-record.ts:273-305`, `update-record.ts:68-93`, `180-187`). | Impossible | High | Add note CRUD, or extend `update_record` with note IDs and note actions. |
| Delete a note | `delete_records` excludes `record_notes` (`delete-records.ts:12-21`). `run_sql` is read-only (`run-sql.ts:21-55`). | Impossible | High | Add note delete support. |
| Search across all entities at once | No first-class path. `search_crm` accepts one entity at a time (`search.ts:248-287`). The agent must fan out across contacts, companies, deals, interactions, tasks, and notes, or write a `run_sql` UNION. | 6 with `search_crm`, 1 with `run_sql` workaround | Medium | Add multi-entity/global search mode for common "find anything mentioning X" requests. |
| Read CRM config to know valid stages/types before a write | `configure_crm` is write-only and rejects empty input (`configure-crm.ts:326-333`). `get_agent_db_schema` only returns `crm_fields` when `context.crmConfig` exists, but managed-agent adapter context does not inject it (`adapter.ts:598-607`, `781-790`). | Impossible as an explicit read | High | Add `get_crm_config` or inject `crmConfig` into tool context. |

### 4. Missing Capability Checks

| Capability | Status | Evidence |
| --- | --- | --- |
| Read file contents from CRM attachments | No first-class capability | Attachment read tools expose metadata only; attachment content requires a `storage_path` the CRM read tools do not return. |
| Update notes | Missing | Notes are append-only side effects on create/update record. |
| Delete notes | Missing | `delete_records` does not support `record_notes`; `run_sql` cannot write. |
| Read CRM config without `configure_crm` | Missing | `configure_crm` requires updates; adapter does not inject `crmConfig`. |
| Search interactions by date range and contact and deal in one `search_crm` call | Yes | `search_crm` supports arbitrary equality filters plus `occurred_after` / `occurred_before` (`search.ts:240-246`, `506-523`). |
| Get a count without fetching all records | Not with `search_crm`; yes with `run_sql` | `search_crm` always returns rows. `run_sql` can express `COUNT(*)`. |

## Token Waste Audit

### Approximate typical payload sizes

These are rough estimates from representative JSON payloads based on the current schemas in `src/lib/crm/schemas.ts`, not exact tokenizer measurements.

| Tool | Typical success payload | Approx tokens |
| --- | --- | ---: |
| `search_crm` | 3 simple rows | ~220 |
| `search_crm` with one fully hydrated deal | ~280 |
| `create_record` | 1 created row | ~80 |
| `create_record` duplicate response | ~85 |
| `update_record` | 1 updated row | ~65 |
| `delete_records` | counts + IDs only | ~15 |
| `link_records` | 1 relationship row | ~45 |
| `create_interaction` | 1 interaction row | ~70 |
| `create_task` | 1 task row | ~80 |
| `update_task` | 1 task row | ~80 |
| `configure_crm` | resolved config | ~240, but can be much larger once field definitions grow |
| `attach_file_to_record` | 1 attachment row | ~85 |
| `list_record_attachments` | 2 attachment metadata rows | ~90 |
| `delete_record_attachment` | deleted ID only | ~10 |
| `manage_views` list | 5 views | ~340 |
| `run_sql` | 10 aggregate rows | ~150 |

### Main waste sources

1. **Primary `search_crm` rows always use `select("*")`.**
   - `search.ts:479-483`
   - This means simple reads always ship `client_id`, timestamps, nullable FKs, and full `custom_fields` blobs even when the agent only needs names, stages, or IDs.

2. **Duplicate detection reads full rows.**
   - `create-record.ts:79-84`, `108-113`, `126-131`
   - For duplicate checks, the model likely only needs IDs plus a tiny identity subset, not full records.

3. **Mutation tools generally return full rows after write.**
   - `create-record.ts:449-489`
   - `update-record.ts:167-214`
   - `tasks.ts:80-121`, `181-209`
   - `interactions.ts:56-73`
   - `link-records.ts:51-67`, `146-171`, `189-214`
   - `attach-file.ts:136-172`
   - `manage-views.ts:68-90`, `156-168`
   - This is defensible for auto-verification, but most workflows only need `{id, status}` or `{id, changed_fields}`. The current design pays the token cost every time.

4. **Pre-read snapshots use `select("*")` when only diff-critical fields are needed.**
   - `update-record.ts:99-107`
   - `link-records.ts:138-143`, `181-186`
   - `tasks.ts:155-162`
   - `delete-records.ts:66-77`

5. **`manage_views list` returns full rows.**
   - `manage-views.ts:93-111`
   - This is likely more data than the agent needs for most list operations.

### Worst-case `search_crm` payload

The worst current shape is `search_crm(entity:'deals', limit:20, include:['contacts','interactions','notes','tasks','attachments'])`.

- Parent rows: 20 deals
- Included rows at default limits:
  - 20 contacts per deal = 400 rows
  - 10 interactions per deal = 200 rows
  - 5 notes per deal = 100 rows
  - 10 tasks per deal = 200 rows
  - 10 attachments per deal = 200 rows
- Total objects returned: 1,120

A representative synthetic payload of that shape is roughly **301k characters / 75k tokens** before any model reasoning on top of it. The contact-hydrated equivalent is still roughly **223k characters / 56k tokens**.

This is the biggest reason to add:

- `fields`
- `count_only`
- cursor/pagination
- lower include defaults or caller-specified include limits

## Consolidation Review

| Proposal | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| Merge `create_task` and `update_task` | Saves one tool description and one decision point. The schemas are already very close. | Low. The only real branch is whether `task_id` is present. | Yes. Fold into a single `write_task` or `upsert_task`. |
| Let `create_interaction` accept batches | Strong for call logs, meeting imports, and "log 10 follow-ups" workflows. | Low. Array input is straightforward. | Yes. Add batch support. |
| Fold `link_records` into `create_record` | High value for "create contact, link to deal/company" workflows. | Medium. Full folding would overcomplicate `create_record`, especially for `contact_deal`. | Partial yes. Keep `link_records`, but allow `create_record` to accept optional relationship hooks. |
| Remove `list_record_attachments` | Reduces tool count and overlaps heavily with `search_crm.include:['attachments']`. | Low. Only downside is losing the most explicit attachment-listing verb. | Yes, unless a future `read_record_attachment` reuses it. |
| Keep `manage_views` as a dedicated default tool | Product-valid, but likely low-frequency agent work. Every extra tool name appears in the published tool list (`create-agent.ts:106`) and declaration set (`declarations.ts:60-104`). | Low product risk if moved out of the default toolset. | Remove from default agent toolset or gate behind explicit user request / specialized skill. |

## Source-Level Findings

### [high] `search_crm` is still too blunt for frequent reads
- **Files:** `src/lib/managed-agents/tools/crm/search.ts:80-123`, `125-199`, `348-435`, `479-551`
- **What goes wrong:** The agent can often finish in one call, but it pays too much for that call because the primary read is `select("*")`, includes have fixed per-parent fan-out, and includes stop at one hop.
- **Impact:** Token-heavy reads, inability to answer some "relationship-shaped" questions in one call, and practical failure once a user has enough records.
- **Recommendation:** Add `fields`, `count_only`, include-specific limits, and one multi-hop include path.

### [high] Common write workflows still require tool choreography
- **Files:** `src/lib/managed-agents/tools/crm/create-record.ts:349-527`, `src/lib/managed-agents/tools/crm/link-records.ts:243-271`, `src/lib/managed-agents/tools/crm/interactions.ts:37-74`, `src/lib/managed-agents/tools/crm/tasks.ts:66-123`
- **What goes wrong:** The common "create/link/log/task" workflows still require 3-4 calls because each tool is narrowly atomic.
- **Impact:** Higher step count, more reasoning surface, more chances for the model to stall or pick the wrong next tool.
- **Recommendation:** Add compound write support or limited sub-operations on existing tools.

### [high] Attachment and note workflows are incomplete
- **Files:** `src/lib/managed-agents/tools/crm/attach-file.ts:136-172`, `src/lib/managed-agents/tools/crm/list-attachments.ts:25-42`, `src/lib/managed-agents/tools/crm/update-record.ts:68-93`, `180-187`, `src/lib/managed-agents/tools/crm/delete-records.ts:12-21`, `src/lib/managed-agents/tools/utility/run-sql.ts:21-55`
- **What goes wrong:** The agent can create notes and attach files, but it cannot first-class read attachment contents or edit/delete notes.
- **Impact:** Real workflows break or fall back to awkward `run_sql` + `storage_read` sequences.
- **Recommendation:** Add `read_record_attachment` plus note CRUD.

### [medium] Managed-agent runtime does not expose CRM config as tool-readable context
- **Files:** `src/lib/managed-agents/adapter.ts:598-607`, `781-790`, `src/lib/managed-agents/tools/crm/configure-crm.ts:326-333`
- **What goes wrong:** The tools internally fall back to defaults when `crmConfig` is missing, but the agent has no explicit read path for the live config.
- **Impact:** Extra ambiguity before writes, especially after mid-session config changes.
- **Recommendation:** Add `get_crm_config` or inject `crmConfig` into the tool context used by managed agents.

## Next Steps

1. Ship a narrow PR for `get_crm_config` plus `search_crm.fields` / `count_only`.
2. Ship a second PR for batched `link_records` and batch `create_interaction`.
3. Ship a third PR for attachment reading and note CRUD.
4. Then trim the default toolset by removing `list_record_attachments` and reconsidering `manage_views`.
