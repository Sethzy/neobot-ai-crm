# Extract Bootstrap From Context Assembly

> Date: 2026-03-26
> Scope: PR-sized fix — move client storage bootstrap out of the prompt-loading path
> Reference: `roadmap docs/Sunder - Source of Truth/references/deepagents/08-context-bootstrap-alignment-proposal.md`

## Problem

`loadSystemPromptState()` in `src/lib/runner/context.ts` performs storage writes (bootstrapping memory files and skills) on every cold-start chat turn before it can do any reads. This couples initialization with context assembly, blocks prompt loading behind file creation, and relies on a process-local `Set<string>` cache that evaporates on serverless cold starts.

## Goal

Make `loadSystemPromptState()` read-only by extracting bootstrap into a durable one-time initialization step at the chat route entrypoint, following the Deep Agents pattern of "init first, load second, inject third."

## Non-Goals

- Refactoring skills to use layered sources (Stage 2, separate PR).
- Changing prompt ordering or cache structure (already done in PR 56).
- Adding bootstrap to multiple entrypoints (chat route only for now).
- Reducing `discoverUserSkills()` cold-read latency (one list + one download per skill on every turn). Upstream amortizes this with session-level state caching; Sunder doesn't have that yet. Out of scope — noted as a known residual cost.

## Design

### New function: `ensureClientBootstrap()`

Lives in `src/lib/memory/bootstrap.ts` alongside the existing bootstrap logic.

```
ensureClientBootstrap(supabase, clientId)
  -> SELECT is_bootstrapped FROM clients WHERE client_id = ?
  -> if true: return (no-op)
  -> if false/null:
      -> await bootstrapMemoryFiles(supabase, clientId)  // existing logic, includes bootstrapSkills()
      -> UPDATE clients SET is_bootstrapped = true WHERE client_id = ?
```

Fail-hard: if bootstrap throws (storage down), the error propagates to the chat route and returns 500. Read paths (`loadMemoryContext`, `discoverUserSkills`) continue to tolerate missing files gracefully — that's a separate concern.

This matches the Deep Agents error philosophy: "missing data" (a file that doesn't exist yet) is OK to degrade on, but "broken infrastructure" (storage backend won't respond) should fail immediately.

**Required fix in `bootstrapMemoryFiles()`:** The current `bucket.list()` calls at line 69 silently treat list errors as "no files exist" (null data → empty Set → re-uploads everything). This must throw on list failures so the fail-hard contract is real. Check `error` on both list responses before proceeding.

### Chat route change

In `app/api/chat/route.ts`, **fire** `ensureClientBootstrap()` right after `clientId` is resolved (~line 197) but **await** it just before `runAgent()` (~line 290). This overlaps the bootstrap check with the CRM config query and thread lookup for free latency hiding. On already-bootstrapped clients (99%+ of requests), the promise resolves from a single SELECT before the await is even reached.

### Context.ts change

Remove `await bootstrapMemoryFiles(supabase, clientId)` from `loadSystemPromptState()`. The function becomes read-only: starts reminder + compaction promises, then `Promise.all([loadMemoryContext, discoverUserSkills, ...])` with no preceding write.

### Migration

Add `is_bootstrapped BOOLEAN NOT NULL DEFAULT FALSE` to the `clients` table. Existing clients get `false` and pay the bootstrap cost once on their next chat turn.

### Cleanup

Remove the `bootstrappedClients: Set<string>` process-local cache from `bootstrap.ts`. The DB boolean replaces it.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/memory/bootstrap.ts` | Add `ensureClientBootstrap()`. Remove `bootstrappedClients` Set and `_resetBootstrapCache()`. |
| `src/lib/runner/context.ts` | Remove `await bootstrapMemoryFiles()` from `loadSystemPromptState()`. Remove the import. |
| `app/api/chat/route.ts` | Call `ensureClientBootstrap()` after `clientId` is resolved, await before `runAgent()`. |
| `supabase/migrations/<timestamp>_add_is_bootstrapped_to_clients.sql` | `ALTER TABLE clients ADD COLUMN is_bootstrapped BOOLEAN NOT NULL DEFAULT FALSE;` |
| `src/types/database.ts` | Regenerate with new column. |

### Tests

- `src/lib/runner/__tests__/context.test.ts` — remove bootstrap mock/assertions, add regression: context assembly does not call bootstrap.
- `src/lib/runner/__tests__/context-crm-config.test.ts` — same.
- `src/lib/memory/__tests__/bootstrap.test.ts` (or new) — test `ensureClientBootstrap()`: no-op when `is_bootstrapped = true`, runs and sets flag when false, fails hard on storage error.

## Unresolved Questions

1. **Should `ensureClientBootstrap()` combine its SELECT with the existing client row fetch?** The chat route already does `SELECT crm_config_mode_until FROM clients` at line 201. We could add `is_bootstrapped` to that same query instead of a separate round-trip. Worth doing, but implementation detail for the tasklist.

2. **What happens to the `_resetBootstrapCache()` test helper?** Tests that currently use it to force re-bootstrap will need to be rewritten against the DB boolean instead.

3. **Should `assembleSystemOnly()` (subagent path) get any changes?** It also calls `loadSystemPromptState()`, which currently calls bootstrap. After this PR, it becomes read-only automatically. No extra work needed, but tests should verify it.

## Known Gaps (out of scope)

- **`discoverUserSkills()` returns `[]` on any error**, not just missing files. This masks storage regressions. Not fixed in this PR — flagged for future tightening to match the upstream pattern of distinguishing "missing" from "broken."
- **Per-skill metadata downloads on every turn.** Upstream caches `skills_metadata` in checkpoint state after first load. Sunder re-discovers on every request. This is the next latency target after this PR lands.
