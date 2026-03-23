# Final Review: PR 52 + PR 53 Together

**Date:** 2026-03-23
**Goal:** One final review pass across both sandbox PRs as a unified whole before handing to implementation. Two prior review rounds caught real issues (schema mismatches, file input contracts, tool conventions, TDD gaps). This pass checks that everything is now consistent and implementation-ready.

---

## Context

We're building two tools that delegate coding tasks to Claude Code running inside a Fly.io Sprite:

- **PR 52** (`analyze_spreadsheet`) — user uploads xlsx → Excel financial model with live formulas
- **PR 53** (`publish_artifact`) — agent gathers data → React showcase page with live preview URL

PR 52 is the foundation (SDK wrapper, DB table, session lifecycle, skill loader). PR 53 builds on it.

Two prior review rounds found and fixed: v2 plan drift, per-client→per-thread, migration schema, chat upload path, tool registry conventions, file input contract, npm→pnpm, TDD depth, stale doc refs.

---

## Files to review

Read ALL of these. The review should check cross-file consistency, not just individual file quality.

**Source of truth:**
- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` — Phase 6 entries (PRs 52, 53, 54). Check the 2026-03-23 changelog entry and the PR task/testCriteria arrays.

**Design:**
- `docs/product/designs/sandbox-skill-execution.md` — the full architecture. Every pattern in the tasklists should trace back here.

**Tasklists (the main review targets):**
- `docs/product/tasks/2026-03-20-pr52-sandbox-excel-analysis-tasklist.md`
- `docs/product/tasks/2026-03-20-pr53-sandbox-artifact-publishing-tasklist.md`

**SDK verification:**
- `docs/product/references/sprites-sdk-verification.md` — 9 API correctness questions answered. Check that tasklist code matches the verified patterns.

**Existing codebase (check tasklist code against these):**
- `src/lib/runner/tool-registry.ts` — how tools are registered
- `src/lib/runner/tools/utility/generate-pdf.ts` — example tool using AI SDK v6 `tool({ inputSchema, execute })`
- `src/lib/runner/__tests__/tool-registry.test.ts` — tool registry test pattern
- `src/lib/runner/schemas.ts` — runner schemas (file parts contract)
- `src/lib/runner/__tests__/context.test.ts` — how file parts flow through the runner
- `src/lib/storage/agent-files.ts` — storage abstractions
- `src/lib/runner/skills/discover-skills.ts` — skill loading
- `src/lib/runner/skills/skill-templates.ts` — bundled skill content
- `app/api/files/upload/route.ts` — chat upload route
- `src/components/chat/chat-composer.tsx` — chat composer file handling
- `supabase/migrations/20260301000000_create_clients_table.sql` — client table schema
- `supabase/migrations/20260301000002_create_conversation_threads.sql` — thread table schema
- `supabase/migrations/20260301000005_add_rls_policies.sql` — RLS patterns

---

## What to check

### 1. Cross-PR consistency

- PR 53 depends on PR 52's infra (`sprites-client.ts`, `sprite-session.ts`, `skill-loader.ts`, `types.ts`). Do the interfaces match? Does PR 53 import what PR 52 actually exports?
- Both tools use `getOrCreateSprite(threadId)`. Is the function signature consistent across both tasklists?
- Both tools use `loadSkillFilesForSandbox()`. Same question.
- Both tools pass env via `execFile()`. Is the env object shape consistent (same keys, same fallbacks)?
- The `sprite_sessions` table from PR 52 — does PR 53's usage match the schema (column names, types, RLS)?

### 2. Tasklist vs design doc consistency

- Every architectural decision in the design doc (§12 Decision Log) should be reflected in the tasklists. Check for drift.
- The Sprite lifecycle diagram (§4) says per-thread, auto-sleep, kill after 24h. Does the code match?
- The security model (§9) says egress allowlist, per-command env, no secrets on disk. Does the code match?
- The skill file layout (§5) — are the paths consistent between design doc, PR 52a skill content, and the prompts sent to Claude Code?

### 3. Tasklist vs existing codebase

- **Tool definition:** Does it use `tool({ inputSchema, execute })` matching `generate-pdf.ts`?
- **Registry wiring:** Does it follow the pattern in `tool-registry.ts`? Is env gating correct?
- **File parts:** Does `fileUrls` consume public chat-attachments URLs matching the contract in `context.test.ts`?
- **Migration:** Do FK references, column names, and RLS policies match existing migration patterns?
- **Storage:** Does output upload use the same patterns as `agent-files.ts`?
- **Skills:** Does skill loading reuse `discoverUserSkills()` / `getSkillContent()` from `discover-skills.ts`?

### 4. Tasklist vs SDK verification

- **`execFile()` not `exec()`** — no string-based commands anywhere?
- **`client.createSprite()` not `client.sprite()`** — for creation?
- **Per-command env** — `ANTHROPIC_API_KEY` passed via env option, never written to disk?
- **Services for preview** — `createService()` in PR 53, not `createSession()`?
- **URL auth** — `updateURLSettings({ auth: 'public' })` called before returning preview URL?
- **`@fly/sprites@0.0.1-rc37`** — pinned, not stable?
- **pnpm** — not npm?

### 5. TDD quality

- Does every testable task follow red-green-refactor (write test → run FAIL → implement → run PASS → commit)?
- Are the "red" steps meaningful? (expected failure message, not just "FAIL")
- Are the risky paths tested? (Sprite creation failure, CLI timeout, file download failure, output missing, service crash recovery)
- Are migration contract tests included?
- Are tool registry exposure tests included?
- Is the test count realistic for each task?

### 6. Loose ends

- Any hardcoded paths (`/Users/sethlim/...`)?
- Any `npm install` instead of `pnpm add`?
- Any `sprite.exec("...")`  instead of `sprite.execFile()`?
- Any per-client instead of per-thread?
- Any "chat-only" claims that should be "excluded from subagents"?
- Any "sleeping costs $0" that should be "no idle compute cost"?
- Any hardcoded `.sprites.dev` or `.sprites.app` URLs?
- Any `parameters` instead of `inputSchema`?
- Any `MEMORY_BUCKET_ID` used for input files (should only be for output upload)?

---

## Output format

```markdown
# PR 52 + PR 53 Final Review

## Status: READY / NEEDS WORK

## Cross-PR Consistency
- [findings]

## Tasklist vs Design Doc
- [findings]

## Tasklist vs Codebase
- [findings]

## Tasklist vs SDK Verification
- [findings]

## TDD Quality
- [findings]

## Loose Ends
- [findings]

## Verdict
[One paragraph: is this implementation-ready? If not, what specific items remain?]
```

If the verdict is READY, the dev can proceed to implementation in a new session. If NEEDS WORK, list the exact items that need fixing with file paths and line references.
