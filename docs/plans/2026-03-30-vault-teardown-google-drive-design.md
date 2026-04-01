# Vault Teardown — Design Doc (PR A)

**Status:** Approved
**Date:** 2026-03-30
**Scope:** Remove vault/Knowledge Base feature entirely. Pure deletion — no new features.

---

## 1. Problem

The Knowledge Base (vault) is a half-built internal Google Drive. It only accepts text files, has no folders, no previews, no PDF support, and a 5-result search limit. Rather than fixing it, we're replacing it with Google Drive via Composio (see PR B design doc) and widening chat uploads.

## 2. Decision

Kill the vault. Google Drive replaces every vault use case. The agent's private workspace (`SOUL.md`, `USER.md`, `MEMORY.md`, subagent instructions, skills) stays in Supabase Storage via `read_file`/`write_file` — that's a different concern.

## 3. What stays (do NOT delete)

| Component | Purpose |
|---|---|
| `read_file` / `write_file` tools | Agent reads/writes persistent files in Supabase Storage (memory, subagents, skills, toolcalls) |
| `agent-files` bucket | Stores memory files, subagent instructions, skills, toolcall blocks |
| `/agent/memory/`, `/agent/SOUL.md`, etc. | Memory system — untouched |
| `/agent/subagents/` | Trigger/workflow instruction files — untouched |
| `/agent/skills/` | System and user skills — untouched |
| `/agent/toolcalls/` | Subagent observability, image artifact recovery — untouched |
| `chat-attachments` bucket | User file uploads in chat — expanded in PR B, not touched here |

## 4. What to delete

| Component | Location | Action |
|---|---|---|
| `vault_files` table | `supabase/migrations/20260303100000_*.sql` | New migration to drop table |
| `vault_files` RLS + realtime | `supabase/migrations/20260303100001_*.sql` | Dropped with table |
| Knowledge Base page | `app/(dashboard)/knowledge/page.tsx` | Delete file |
| Vault files table component | `src/components/knowledge/vault-files-table.tsx` | Delete file |
| Vault hooks | `src/hooks/use-vault-files.ts` | Delete file |
| Vault schemas | `src/lib/knowledge/schemas.ts` | Delete file |
| Vault search filters | `src/lib/knowledge/postgrest-filters.ts` | Delete file |
| `search_knowledge` tool | `src/lib/runner/tools/storage/index.ts` | Remove tool from `createStorageTools()` return |
| `runPathAwareSync` | `src/lib/runner/tools/storage/index.ts` | Remove function + all call sites in `write_file` |
| `withRetryableVaultSync` | `src/lib/runner/tools/storage/index.ts` | Remove function |
| Vault path detection in `write_file` | `src/lib/runner/tools/storage/index.ts` | Remove vault branch from path classification |
| `searchKnowledgeInputSchema` | `src/lib/runner/tools/storage/index.ts` | Remove schema |
| `KNOWLEDGE_SEARCH_MAX_RESULTS` | `src/lib/runner/tools/storage/index.ts` | Remove constant |
| Sidebar "Knowledge" link | `src/components/layout/app-sidebar.tsx` | Remove nav item |
| `/agent/vault/` in system prompt | `src/lib/ai/system-prompt.ts` | Remove from filesystem docs |
| Vault hook tests | `src/hooks/__tests__/use-vault-files.test.tsx` | Delete file |
| Vault component tests | `src/components/knowledge/__tests__/` | Delete directory |
| Vault schema tests | `src/lib/knowledge/__tests__/` | Delete directory |
| Vault-related DB types | `src/types/database.ts` | Regenerate after migration |
| `vault_files` in SQL helper | `supabase/migrations/20260305030001_create_sql_helper_functions.sql` | Remove `vault_files` from `get_client_accessible_schema()` function |
| Vault path tests in storage tools | `src/lib/runner/tools/storage/__tests__/index.test.ts` | Remove vault-specific test cases (vault sync, retry logic, path detection) |

**Important:** Before writing the tasklist, run `grep -ri "vault" --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.md"` across the codebase and add any missed references to this table. The reviewer found items beyond the original list.

## 5. Migration

```sql
-- Drop vault_files table (cascade drops RLS policies, indexes, triggers)
DROP TABLE IF EXISTS public.vault_files CASCADE;

-- Update get_client_accessible_schema() to remove vault_files reference
-- (exact change depends on function body — read the migration file first)
```

After applying: regenerate TypeScript types with `supabase gen types`.

## 6. Verification

- [ ] Knowledge Base page returns 404
- [ ] Sidebar has no "Knowledge" link
- [ ] Agent `search_knowledge` tool no longer appears in tool registry
- [ ] Agent `write_file` to any path no longer triggers vault sync
- [ ] `read_file` / `write_file` still work for memory, subagents, skills, toolcalls
- [ ] All existing tests pass (minus deleted vault tests)
- [ ] DB types regenerated and compile clean
- [ ] `grep -ri "vault"` across codebase returns zero hits (excluding this design doc and git history)
