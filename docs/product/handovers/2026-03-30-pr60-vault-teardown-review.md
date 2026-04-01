# Review Handover: PR 60 — Vault Teardown (Kill Knowledge Base)

**Date:** 2026-03-30
**For:** Reviewer (independent review, no dependencies on PR 61 or 62)
**Estimated review time:** 30 minutes

---

## What This PR Does

Deletes the entire Knowledge Base (vault) feature. This was a text-only file upload page with FTS search. It's being replaced by Google Drive via Composio (PR 62). The agent's private workspace (memory files, subagent instructions, skills) stays — only vault-specific code is removed.

Supersedes PR 12a (Knowledge Base schema + pages), which shipped in Phase 1.

## Files to Review

**Design doc:** `docs/plans/2026-03-30-vault-teardown-google-drive-design.md`
**Tasklist:** `docs/product/tasks/2026-03-30-pr60-vault-teardown-tasklist.md`

### What gets deleted

| Category | Files |
|---|---|
| **Frontend page** | `app/(dashboard)/knowledge/page.tsx`, `__tests__/page.test.tsx` |
| **Components** | `src/components/knowledge/vault-files-table.tsx`, `__tests__/` |
| **Hooks** | `src/hooks/use-vault-files.ts`, `__tests__/use-vault-files.test.tsx` |
| **Schemas** | `src/lib/knowledge/schemas.ts`, `postgrest-filters.ts`, `__tests__/` |

### What gets modified

| File | Change |
|---|---|
| `src/lib/runner/tools/storage/index.ts` | Remove `search_knowledge` tool, `runPathAwareSync`, `withRetryableVaultSync`, vault path classification, retry logic, constants |
| `src/lib/runner/tools/storage/__tests__/index.test.ts` | Remove vault sync tests, search_knowledge tests |
| `src/components/layout/app-sidebar.tsx` | Remove "Knowledge" nav item |
| `src/lib/ai/system-prompt.ts` | Remove `/agent/vault/` from filesystem docs (2 lines) |
| `src/hooks/use-realtime.ts` | Remove `"vault_files"` from `RealtimeTableName` union |

### Migration

New migration to `DROP TABLE vault_files CASCADE` and update `get_client_accessible_schema()` SQL function (remove vault_files from WHEN/VALUES clauses).

## What to Verify

1. **Is the deletion list complete?** Run `grep -ri "vault" src/ app/ supabase/ scripts/ --include="*.ts" --include="*.tsx" --include="*.sql"` and verify every hit is covered by the tasklist. The initial design doc missed the SQL helper function and some test files — the reviewer who caught those already updated the docs, but there may be more.

2. **Does removing vault sync break `write_file`?** Read `src/lib/runner/tools/storage/index.ts` and trace the `write_file` execute function. After removing `runPathAwareSync()` calls, verify that:
   - Memory file writes (`/agent/memory/`, `/agent/SOUL.md`) still work (they have their own event capture, not vault sync)
   - Skill file writes (`/agent/skills/`) still work
   - General file writes (`/agent/home/`, `/agent/subagents/`) still work
   - The `pathKind` variable and `classifyStoragePath()` — are they still used after vault removal? If only vault used them, they should be removed too.

3. **Does removing `search_knowledge` from the tool registry break anything?** Check `src/lib/runner/tool-registry.ts` — verify `createStorageTools()` return type is consumed correctly when it no longer includes `search_knowledge`.

4. **System prompt:** Read `src/lib/ai/system-prompt.ts` lines ~160-200. Are there any other vault references beyond the two listed (line 167 filesystem tree, line 198 explanation)?

5. **QA scenarios:** `scripts/qa/scenarios.ts` has a Knowledge Base scenario. The tasklist removes it — verify this is the right approach (not just updating it).

6. **Realtime type union:** Removing `"vault_files"` from `RealtimeTableName` in `use-realtime.ts` — verify no other file imports or uses this value.

## Key Decisions (already made)

| Decision | Choice | Why |
|---|---|---|
| Keep `read_file`/`write_file` | Yes | They serve memory, subagents, skills, toolcalls — not just vault |
| Keep `agent-files` bucket | Yes | Vault files were stored there, but so is everything else |
| Drop vs keep `vault_files` table | Drop | With Google Drive replacing the vault, the table has no consumers |

## Context for the Reviewer

The vault was built in Phase 1 (PR 12a) as a "Knowledge Base" — text-only file uploads with Postgres FTS search. It never got PDF support, folder organization, or AI-generated summaries (columns existed but were never populated). Rather than building it up to parity with Google Drive, we're killing it and using Composio's Google workspace toolkits instead (PR 62).

The `read_file`/`write_file` tools do NOT go away. They serve 5 other systems: memory files, subagent instructions, skill files, toolcall block storage, and image artifact recovery. Only the vault-specific plumbing (sync, search, path classification) is removed.
