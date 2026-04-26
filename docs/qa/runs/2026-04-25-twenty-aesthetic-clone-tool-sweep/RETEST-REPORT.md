# T01-T27 Production Readiness Retest

| Field | Value |
|-------|-------|
| Date | 2026-04-26 |
| App URL | http://localhost:3000 |
| Browser | Vercel agent-browser CLI |
| Model | Claude Haiku 4.5 only |
| Scope | T01-T27 managed-agent tool surfaces, happy-path regression plus edge cases |

## Summary

Regression pass completed for T01-T27 through the real chat UI with `agent-browser` and Haiku only.

- T01-T27 happy-path tool surfaces were exercised successfully after republishing Haiku as v11.
- Found and fixed one real T12 coverage bug: `list_record_attachments` existed locally but was not in `MANAGED_AGENT_TOOL_DECLARATIONS`, so Haiku v10 could not call it. Added it to the declaration list, republished Haiku v11, restarted dev, and verified the tool card appears in UI.
- Found one remaining production-readiness edge issue: a mixed non-happy-path prompt involving missing file, read-only SQL, temp CRM record creation, unsupported `.exe` attachment, and cleanup left one thread stuck on `Running: storage_write`; Stop did not cancel it. Fresh threads still worked, and temp CRM cleanup succeeded in a new thread.

## Environment Checks

- Started on `/chat`; authenticated as `limzheyi1996@gmail.com`.
- Chat composer model selector showed `Claude Haiku 4.5` before any managed-agent prompts.
- Initial screenshot: `/tmp/sunder-qa/retest-t01-t27/00-chat-haiku-ready.png`.
- Current Companies page screenshot: `/tmp/sunder-qa/retest-t01-t27/01-companies-current.png`.
- Republished managed agent with `claude-haiku-4-5`; new `ANTHROPIC_AGENT_VERSION_HAIKU=11`.
- Restarted local dev server so the UI picked up Haiku v11.
- Focused tests passed: `pnpm vitest run src/lib/managed-agents/tools/__tests__/declarations.test.ts src/lib/managed-agents/tools/__tests__/index.test.ts src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts`.

## Issues

### Fixed During Retest: T12 Tool Not Published

- Symptom: forcing `list_record_attachments` on Haiku v10 produced an assistant response saying the tool did not exist.
- Root cause: `src/lib/managed-agents/tools/crm/index.ts` exported `listRecordAttachmentsTool`, but `src/lib/managed-agents/tools/declarations.ts` did not import/add it to `MANAGED_AGENT_TOOL_DECLARATIONS`.
- Fix: added `listRecordAttachmentsTool` to declarations and added a regression assertion.
- Verification: Haiku v11 UI thread `QA Retest Haiku T12` showed `search_crm`, `attach_file_to_record`, `list_record_attachments`, and `delete_record_attachment`.
- Evidence: `/tmp/sunder-qa/retest-t01-t27/17-t12-v11-list-attachments.png`, `/tmp/sunder-qa/retest-t01-t27/18-t12-v11-after-delete.png`.

### Open Edge Issue: Stuck Storage Write After Mixed Failure Prompt

- Prompt combined missing-file read, read-only SQL write attempt, temp CRM person creation, unsupported `.exe` attachment, and cleanup.
- Observed: `storage_read`, `run_sql`, `create_record`, built-in `write/read`, `attach_file_to_record`, and `storage_write` cards appeared, then a second `Running: storage_write` card remained for more than 70 seconds.
- Stop button did not cancel the run; composer stayed disabled in that thread.
- Fresh thread remained usable, and cleanup of temp person succeeded after approval.
- Evidence: `/tmp/sunder-qa/retest-t01-t27/issues/edge-storage-write-hang.png`, `/tmp/sunder-qa/retest-t01-t27/28-stop-edge-hang-retry.png`, `/tmp/sunder-qa/retest-t01-t27/31-edge-cleanup-after-allow.png`.

## Coverage Notes

- T01-T03/T16 setup: `get_crm_config`, `configure_crm`, `create_record`, `storage_write`; evidence `/tmp/sunder-qa/retest-t01-t27/05-t01-t03-t16-after-wait.png`.
- T04-T06: `search_crm`, `update_record`, `create_record`, `link_records`; evidence `/tmp/sunder-qa/retest-t01-t27/08-t04-t06-long-wait.png`.
- T07-T10: `create_interaction`, `create_task`, `manage_views`, `update_task`; evidence `/tmp/sunder-qa/retest-t01-t27/10-t07-t10-after-wait.png`.
- T11-T14: `attach_file_to_record`, `read_record_attachment`, `delete_record_attachment`; explicit T12 fixed/retested on Haiku v11 with `list_record_attachments`.
- T15: approval UI clicked `Allow`, then `delete_records` ran for person and company; evidence `/tmp/sunder-qa/retest-t01-t27/20-t15-after-allow.png`.
- T17-T19: `storage_read`, `get_agent_db_schema`, `run_sql`; evidence `/tmp/sunder-qa/retest-t01-t27/21-t17-t19.png`.
- T20-T22: `manage_todo`, `list_todo`, `rename_chat`; evidence `/tmp/sunder-qa/retest-t01-t27/22-t20-t22.png`.
- T23-T27: `web_search`, `web_scrape`, `calculate_drive_time`, `search_market_data`, `search_meeting_recordings`; evidence `/tmp/sunder-qa/retest-t01-t27/23-t23-t27-progress.png`.
