# Run 3 — Final Pass Report

| Field | Value |
|---|---|
| Date | 2026-04-30 |
| Branch SHA | 23ae7447f60d91bda53ac4b1bc6d977ea3ab4b8d |
| Agent version | ANTHROPIC_AGENT_VERSION_HAIKU="13" |
| Dev server | http://localhost:3000 |
| Model | claude-haiku-4-5 |
| Time spent | in progress |

## Preflight

| Check | Result | Notes |
|----|--------|-------|
| Branch | pass | On `feat/twenty-aesthetic-clone` at pinned SHA `23ae7447f60d91bda53ac4b1bc6d977ea3ab4b8d`. |
| Dev server | pass | `http://localhost:3000/` returned 200. |
| Login | pass | Logged in through UI as `limzheyi1996@gmail.com`. |
| Model picker | pass-with-note | Fresh `/chat` defaulted to Sonnet; switched to `Claude Haiku 4.5` before starting T01. Matches prior T41 default-model leak. |
| Console | pass | Cleared pre-run console and page errors after preflight. |

## T01–T27 results

| ID | Result | Notes |
|----|--------|-------|
| T01 | fail | Haiku selected and composer recovered, but only `get_agent_db_schema` appeared; expected `get_crm_config`. Issue: `/tmp/sunder-qa/run-3-final/issues/T01-wrong-tool-selected.md`. |
| T02 | pass | `configure_crm` rendered twice; first call asked for missing label, second call succeeded and confirmed `qa_test_flag` boolean default false. Screenshot: `/tmp/sunder-qa/run-3-final/T02-configure-crm.png`. |
| T03 | pass | `create_record` invoked, recovered from singular entity args, then deduped to exact existing QA Bot by email with contact id `11973707-8792-435b-94c6-2fb64427a299`; no unrelated false positive or duplicate create. Screenshot: `/tmp/sunder-qa/run-3-final/T03-create-record-existing.png`. |
| T04 | pass | Same thread as T03; `update_record` succeeded against QA Bot and assistant confirmed `qa_test_flag` set to `true`. Screenshot: `/tmp/sunder-qa/run-3-final/T04-update-record.png`. |
| T05 | pass | Same T03/T04 thread; `search_crm` returned the exact QA Bot contact, email, id, and `qa_test_flag=true`. Screenshot: `/tmp/sunder-qa/run-3-final/T05-search-crm.png`. |
| T06 | fail | `create_record` succeeded, but `link_records` failed validation with `relationship: "contact-company"` instead of `contact_company`; agent recovered with `update_record`, but expected link tool did not succeed. Issue: `/tmp/sunder-qa/run-3-final/issues/T06-link-records-invalid-relationship.md`. |
| T07 | pass | Fresh Haiku thread; `search_crm` located QA Bot and `create_interaction` succeeded with 5-minute call summary `said hi`. Screenshot: `/tmp/sunder-qa/run-3-final/T07-create-interaction.png`. |
| T08 | pass | Fresh Haiku thread; `create_task` succeeded and assistant confirmed tomorrow 3pm Singapore time. Screenshot: `/tmp/sunder-qa/run-3-final/T08-create-task.png`. |
| T09 | pass | Same T08 thread; `update_task` succeeded and assistant confirmed the task was marked done. Screenshot: `/tmp/sunder-qa/run-3-final/T09-update-task.png`. |
| T10 | pass | Fresh Haiku thread; `manage_views` first retried for missing state, then succeeded saving `QA Hot` filtered to `qa_test_flag=true`. Screenshot: `/tmp/sunder-qa/run-3-final/T10-manage-views.png`. |
| T11 | pass | Fresh Haiku thread; `attach_file_to_record` succeeded for `/agent/qa.txt` after search located the exact `qa@bot.test` contact among multiple QA records. Screenshot: `/tmp/sunder-qa/run-3-final/T11-attach-file.png`. |
| T12 | pass | Same T11 thread; `list_record_attachments` returned `qa.txt` with size, MIME, and created timestamp. Screenshot: `/tmp/sunder-qa/run-3-final/T12-list-attachments.png`. |
| T13 | pass | Same attachment thread; `read_record_attachment` succeeded and returned `hello QA`. Screenshot: `/tmp/sunder-qa/run-3-final/T13-read-attachment.png`. |
| T14 | pass | Same attachment thread; approval gate appeared, clicked Allow, `delete_record_attachment` succeeded and composer recovered. Screenshots: `/tmp/sunder-qa/run-3-final/T14-delete-attachment-approval.png`, `/tmp/sunder-qa/run-3-final/T14-delete-attachment.png`. |
| T15 | pass | Fresh Haiku thread; approval gate appeared and Allow was clicked; two `delete_records` cards succeeded for QA Bot contact and QA Co company, composer recovered. Screenshots: `/tmp/sunder-qa/run-3-final/T15-delete-records-approval.png`, `/tmp/sunder-qa/run-3-final/T15-delete-records.png`. |
| T16 | pass | Fresh Haiku thread; `storage_write` succeeded for `/agent/qa.txt` with `hello QA`. Screenshot: `/tmp/sunder-qa/run-3-final/T16-storage-write.png`. |
| T17 | pass | Same T16 thread; `storage_read` returned `hello QA`. Screenshot: `/tmp/sunder-qa/run-3-final/T17-storage-read.png`. |
| T18 | pass | Fresh Haiku thread; `get_agent_db_schema` returned CRM core tables, config/index views, session tables, and todo table. Screenshot: `/tmp/sunder-qa/run-3-final/T18-db-schema.png`. |
| T19 | pass-with-note (matches checklist baseline) | Same T18 thread; `run_sql` executed the literal `people` query and returned the clean known error that `people` does not exist, pointing to `contacts` instead. Screenshot: `/tmp/sunder-qa/run-3-final/T19-run-sql-people-error.png`. |
| T20 | pass | Fresh Haiku thread; `manage_todo` retried with corrected structure and completed the three-step email workflow todo. Screenshot: `/tmp/sunder-qa/run-3-final/T20-manage-todo.png`. |
| T21 | pass | Same T20 thread; `list_todo` returned the email workflow with check/draft/send steps. Screenshot: `/tmp/sunder-qa/run-3-final/T21-list-todo.png`. |
| T22 | pass | Same todo thread; `rename_chat` succeeded and sidebar updated to `QA Tool Sweep`. Screenshot: `/tmp/sunder-qa/run-3-final/T22-rename-chat.png`. |
| T23 | pass | Fresh Haiku thread; `web_search` returned 3 relevant Anthropic/Claude release links. Screenshot: `/tmp/sunder-qa/run-3-final/T23-web-search.png`. |
| T24 | pass | Fresh Haiku thread; `web_scrape` returned H1 `Example Domain`. Screenshot: `/tmp/sunder-qa/run-3-final/T24-web-scrape.png`. |
| T25 | pass | Fresh Haiku thread; `calculate_drive_time` returned a 20-minute Funan to Changi T3 estimate. Screenshot: `/tmp/sunder-qa/run-3-final/T25-drive-time.png`. |
| T26 | pass | Fresh Haiku thread; `search_market_data` retried with corrected mode and returned Tampines-only HDB resale summary. Screenshot: `/tmp/sunder-qa/run-3-final/T26-market-data.png`. |
| T27 | pass | Fresh Haiku thread; `search_meeting_recordings` ran twice and returned this month's meeting summary with 17 recordings and substantive items. Screenshot: `/tmp/sunder-qa/run-3-final/T27-search-meetings.png`. |

## EC00–EC35 results

| ID | Result | Notes |
|----|--------|-------|
| EC00 | fail | Fresh Haiku EC00 run wedged the active `agent-browser` session after the 60s wait; follow-up snapshot also hung and the daemon had to be killed. Issue: `/tmp/sunder-qa/run-3-final/issues/EC00-agent-browser-daemon-wedge.md`. |
| EC01 | pass | Fresh Haiku thread after re-login; `get_crm_config` showed `qa_retest_flag_20260426` was absent, then `configure_crm` added it once with true/false options. No duplicate created. Screenshot: `/tmp/sunder-qa/run-3-final/EC01-duplicate-field-created-once.png`. |
| EC02 | pass | `configure_crm` rejected invalid type `object`; follow-up `get_crm_config` confirmed `qa_invalid_type_20260426` was not added. Screenshot: `/tmp/sunder-qa/run-3-final/EC02-invalid-custom-field-type.png`. |
| EC03 | fail | `configure_crm` added `qa_edge_temperature_20260426`, but same-run `manage_views` rejected that filter as invalid and the agent falsely claimed the view was live. Issue: `/tmp/sunder-qa/run-3-final/issues/EC03-same-run-config-stale.md`. |
| EC04 | pass | `manage_views` rejected `made_up_field_20260426` after retrying with correct state structure and did not create the invalid view. Screenshot: `/tmp/sunder-qa/run-3-final/EC04-invalid-view-filter.png`. |
| EC05 | pass | `create_record` deduped to the existing exact email record and reported normalized fields: first_name `Dr.`, last_name `QA Multi Space 20260426`, email intact. Screenshot: `/tmp/sunder-qa/run-3-final/EC05-messy-name.png`. |
| EC06 | pass | `search_crm` found the existing exact email contact; second `create_record` surfaced exact duplicate only and did not create an unrelated match. Screenshot: `/tmp/sunder-qa/run-3-final/EC06-duplicate-detection.png`. |
| EC07 | pass-with-note (matches Run-2 baseline) | Exact partial-email search returned one record; broader `QA Multi Space` search returned 7 QA test records but included the same contact and the agent identified the exact matching id. Matches known search broadness note. Screenshot: `/tmp/sunder-qa/run-3-final/EC07-search-punctuation-partial.png`. |
| EC08 | pass | Fresh Haiku thread; after noisy preliminary `search_crm`/`create_record` retries, `link_records` succeeded and the second link call also succeeded without complaint, matching the FK-idempotent baseline. Screenshot: `/tmp/sunder-qa/run-3-final/EC08-link-duplicate-idempotent.png`. |
| EC09 | pass | Fresh Haiku thread; no company was created and no hallucinated id was used. Agent stopped safely with a clean missing-record explanation, matching the Run-2 target-not-found baseline, though it incorrectly failed to find the existing contact before reaching the missing-company link. Screenshot: `/tmp/sunder-qa/run-3-final/EC09-missing-link-clean-error.png`. |
| EC10 | pass | Fresh Haiku thread; `create_interaction` with duration `-5` failed validation (`expected number to be >=0`), and duration `0` succeeded with explicit narration. Agent created the missing test contact first after failing to find it. Screenshot: `/tmp/sunder-qa/run-3-final/EC10-invalid-duration.png`. |
| EC11 | pass | Fresh Haiku thread; `create_task` stored `2026-05-01T07:00:00+00:00`, correctly interpreting tomorrow at 3pm Singapore time as UTC+8. Agent failed to bind the task to the named QA contact, but timezone handling passed. Screenshot: `/tmp/sunder-qa/run-3-final/EC11-timezone-task.png`. |
| EC12 | pass | Same EC11 Haiku thread; invalid status `finished-ish` was rejected, then valid `done` status succeeded. Assistant reported the record was not touched by the invalid status and the description was not polluted. Screenshot: `/tmp/sunder-qa/run-3-final/EC12-invalid-task-status.png`. |
| EC13 | fail | Fresh Haiku thread; agent failed to find the QA contact, attempted to create it as a deal, then the UI surfaced `network error` and left `Running: create_record` on screen. Expected storage/attachment/list/read/delete tools never ran. Issue: `/tmp/sunder-qa/run-3-final/issues/EC13-network-error-stale-tool-card.md`. |
| EC14 | pass | Fresh Haiku thread; `storage_write` wrote the `.exe`, `attach_file_to_record` rejected it quickly with unsupported extension/MIME guidance, and there was no retry loop. Screenshot: `/tmp/sunder-qa/run-3-final/EC14-unsupported-attachment.png`. |
| EC15 | pass | Fresh Haiku thread; attachment lifecycle completed and `read_record_attachment` returned clean not-found after deletion. Agent force-created a deal for the QA name before attaching, which is unwanted extra state but did not affect the deleted-read behavior under test. Screenshot: `/tmp/sunder-qa/run-3-final/EC15-deleted-attachment-read.png`. |
| EC16 | pass | Fresh Haiku thread; `attach_file_to_record` failed cleanly for missing `/agent/definitely-missing-20260426.txt` and assistant reported no attachment row was created. Screenshot: `/tmp/sunder-qa/run-3-final/EC16-missing-file-attach.png`. |
| EC17 | pass | Fresh Haiku thread; `storage_write` rejected `/agent/../qa-path-traversal-20260426.txt` at validation and the agent did not attempt to read escaped content. Screenshot: `/tmp/sunder-qa/run-3-final/EC17-path-traversal-blocked.png`. |
| EC18 | pass | Fresh Haiku thread; `storage_write` and `storage_read` completed and final output showed the last three lines `line 18`, `line 19`, `line 20`. Screenshot: `/tmp/sunder-qa/run-3-final/EC18-20-line-storage.png`. |
| EC19 | pass | Same Haiku thread for delete + verification; approval gate appeared, clicked Deny, and follow-up `search_crm` confirmed both QA Duplicate Noise deal and QA Edge Co company still existed. Screenshot: `/tmp/sunder-qa/run-3-final/EC19-deny-delete-records-intact.png`. |
| EC20 | pass | Same Haiku thread; one approval gate covered the two-record cleanup, clicked Allow, and two `delete_records` calls succeeded. Screenshot: `/tmp/sunder-qa/run-3-final/EC20-allow-batch-delete.png`. |
| EC21 | pass-with-note | Fresh Haiku thread; no write executed and the agent clearly refused because `run_sql` is SELECT/CTE-only. Unlike Run 2, it did not call `run_sql` to surface the tool-level rejection, so the exact tool error was not observed. Screenshot: `/tmp/sunder-qa/run-3-final/EC21-sql-write-blocked.png`. |
| EC22 | pass | Fresh Haiku thread; `get_agent_db_schema` succeeded, `run_sql` against `definitely_missing_table_20260426` returned a clean missing-table error, and composer recovered. Screenshot: `/tmp/sunder-qa/run-3-final/EC22-bad-table-sql.png`. |
| EC23 | pass-with-note | Fresh Haiku thread; exact `people` SQL failed because `people` does not exist, then agent used schema context and corrected to `contacts`, returning count 42. Tenant/RLS explanation referenced `client_id`, Postgres RLS, and database-layer enforcement as expected. Screenshot: `/tmp/sunder-qa/run-3-final/EC23-sql-tenant-scope.png`. |
| EC24 | pass | Fresh Haiku thread; duplicate todo behavior was explicit: `manage_todo` created separate records and `list_todo` showed duplicates rather than merge behavior. No runaway loop. Screenshot: `/tmp/sunder-qa/run-3-final/EC24-todo-duplicates.png`. |
| EC25 | pass | Same Haiku thread; `rename_chat` accepted the long/special title, sidebar truncated it with ellipsis and no visible overflow. Screenshot: `/tmp/sunder-qa/run-3-final/EC25-long-rename-sidebar.png`. |
| EC26 | pass | Fresh Haiku thread; `web_search` returned tangential/noisy matches and the agent correctly framed them as unreliable rather than authoritative. Screenshot: `/tmp/sunder-qa/run-3-final/EC26-web-search-no-result.png`. |
| EC27 | pass | Fresh Haiku thread; `web_scrape` failed once with a clean HTTP 503/invalid-domain explanation and did not retry. Screenshot: `/tmp/sunder-qa/run-3-final/EC27-web-scrape-invalid-url.png`. |
| EC28 | pass | Fresh Haiku thread; `calculate_drive_time` rejected the fake origin as not geocodable and did not fabricate a drive time. Screenshot: `/tmp/sunder-qa/run-3-final/EC28-drive-impossible-origin.png`. |
| EC29 | pass | Fresh Haiku thread; `calculate_drive_time` succeeded for leave-now request with 23-minute current-traffic estimate and no past-instant departure error. Screenshot: `/tmp/sunder-qa/run-3-final/EC29-drive-right-now.png`. |
| EC30 | pass | Fresh Haiku thread; agent explicitly rejected fake town as invalid and did not fallback to an unrelated HDB town. It did not call `search_market_data`, but behavior matched the no-fallback acceptance criterion. Screenshot: `/tmp/sunder-qa/run-3-final/EC30-market-invalid-town.png`. |
| EC31 | pass | Fresh Haiku thread; `search_market_data` retried with corrected dataset/mode and returned Tampines Executive transactions only. Screenshot: `/tmp/sunder-qa/run-3-final/EC31-market-tampines-executive.png`. |
| EC32 | pending |  |
| EC33 | pending |  |
| EC34 | pending |  |
| EC35 | pending |  |

## Issues filed

- `T01` — `/tmp/sunder-qa/run-3-final/issues/T01-wrong-tool-selected.md` — Haiku used `get_agent_db_schema` instead of the expected `get_crm_config` tool card.
- `T06` — `/tmp/sunder-qa/run-3-final/issues/T06-link-records-invalid-relationship.md` — Haiku passed an invalid hyphenated `link_records.relationship` enum and only recovered via `update_record`.
- `EC00` — `/tmp/sunder-qa/run-3-final/issues/EC00-agent-browser-daemon-wedge.md` — mixed-failure run wedged the active browser automation session, preventing completion evidence.
- `EC03` — `/tmp/sunder-qa/run-3-final/issues/EC03-same-run-config-stale.md` — same-run `manage_views` custom-field validation regressed and assistant narrated success over a failed tool.
- `EC08-EC12 console` — `/tmp/sunder-qa/run-3-final/issues/EC08-EC12-console-406-thread-lookup.md` — Browser console logged red Supabase `conversation_threads` 406 errors on new-thread lookups, so the console-clean gate is not satisfied.
- `EC13` — `/tmp/sunder-qa/run-3-final/issues/EC13-network-error-stale-tool-card.md` — attachment round trip aborted with visible `network error` and stale `Running: create_record` tool card before expected storage/attachment tools ran.

## Verdict

- Hard fails: in progress / 63
- Run-2 pass-with-notes still matching their baseline: in progress / 5
- New pass-with-notes (with issue file + rationale): in progress
- Console clean across all runs: in progress

**Decision:** in progress

**Rationale:** in progress.
