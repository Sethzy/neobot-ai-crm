# Vault Teardown Implementation Plan

**PR:** PR 60: Vault teardown (kill Knowledge Base)
**Decisions:** SERVICE-02, DATA-09
**Goal:** Remove the Knowledge Base feature end-to-end while keeping the rest of the agent filesystem and runner working.

**Architecture:** PR 60 deletes the `SERVICE-02` Knowledge Base slice from the product: the `vault_files` table, the dashboard upload/search surface, and the agent's vault-only search and sync plumbing. `DATA-09` still stands for the rest of the system tables and the Storage-backed filesystem; this PR removes only the vault-specific table and references. This plan assumes vault is truly retired: new `/agent/vault/` reads, writes, edits, deletes, and directory listings are rejected, while historical migrations, reports, and archival docs stay untouched.

**Tech Stack:** Supabase Postgres migrations, Supabase Storage, Next.js App Router, TypeScript, Vitest, React Testing Library

**Implementation Skill:** `@test-driven-development`
- No production code before a failing test or failing executable verification step.
- Prefer one behavior per test.
- Refactor only after green.
- Commit after each parent task.

**Design Doc:** `docs/plans/2026-03-30-vault-teardown-google-drive-design.md`

## Read Before Coding

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
  Read the PR 60 entry only.
- `docs/plans/2026-03-30-vault-teardown-google-drive-design.md`
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`
  Read `SERVICE-02` and `DATA-09`.
- `src/lib/storage/agent-files.ts`
- `src/lib/runner/tools/storage/index.ts`
- `src/components/layout/app-sidebar.tsx`
- `src/lib/ai/system-prompt.ts`

## Assumptions And Non-Goals

- Treat `/agent/vault/` as removed, not merely unindexed.
- Preserve `write_file`'s `path_kind` contract for non-vault paths. After this PR, valid values should remain `"general"` and `"skills"`.
- Do not touch historical migrations, historical QA reports, historical tasklists, handovers, or v1 tooling inventory.
- Update active docs metadata when rows are removed. Do not leave stale counts behind.
- Do not edit `docs/product/plans/2026-03-01-implementation-phasing-plan.json`. PR 60 is already `in_progress` in `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`.

## Relevant Files

**Create**
- `supabase/migrations/<timestamp>_drop_vault_files.sql`

**Modify**
- `src/lib/storage/agent-files.ts`
- `src/lib/storage/__tests__/agent-files.test.ts`
- `src/lib/runner/tools/storage/index.ts`
- `src/lib/runner/tools/storage/__tests__/index.test.ts`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/app-sidebar.test.tsx`
- `src/hooks/use-realtime.ts`
- `src/lib/ai/system-prompt.ts`
- `src/lib/ai/__tests__/system-prompt.test.ts`
- `scripts/qa/scenarios.ts`
- `scripts/qa/README.md`
- `docs/qa/README.md`
- `docs/qa/tracker.json`
- `docs/qa/07-platform-intelligence.md`
- `docs/product/tooling/agent-tools-inventory-v2.md`
- `src/types/database.ts`

**Delete**
- `app/(dashboard)/knowledge/page.tsx`
- `app/(dashboard)/knowledge/__tests__/page.test.tsx`
- `src/components/knowledge/vault-files-table.tsx`
- `src/components/knowledge/__tests__/vault-files-table.test.tsx`
- `src/hooks/use-vault-files.ts`
- `src/hooks/__tests__/use-vault-files.test.tsx`
- `src/lib/knowledge/schemas.ts`
- `src/lib/knowledge/postgrest-filters.ts`
- `src/lib/knowledge/__tests__/schemas.test.ts`
- `src/lib/knowledge/__tests__/postgrest-filters.test.ts`
- `docs/qa/05-knowledge-base.md`

**Leave Alone**
- `supabase/migrations/20260303100000_create_vault_files.sql`
- `supabase/migrations/20260303100001_vault_files_rls_realtime.sql`
- `supabase/migrations/20260305030001_create_sql_helper_functions.sql`
- `src/lib/storage/__tests__/agent-paths.test.ts`
- `src/components/icons/app-icons.tsx`
- `docs/product/tooling/agent-tools-inventory-v1.md`
- `docs/product/tooling/tool-comparison-tasklet-vs-sunder.json`
- `docs/product/tooling/tool-comparison-tasklet-vs-sunder-handover.md`
- `docs/qa/reports/**`
- `docs/qa/phase-1-manual-qa.md`
- `scripts/qa/output/**`

## Task 1: Retire Vault Paths At The Storage Boundary

**Files:**
- Modify: `src/lib/storage/agent-files.ts`
- Test: `src/lib/storage/__tests__/agent-files.test.ts`

**Step 1: Write the failing test for direct text reads**

Add this test to `src/lib/storage/__tests__/agent-files.test.ts`:

```ts
it("rejects direct text reads from removed vault paths", async () => {
  const client = createAgentFileClient(supabase.client, CLIENT_ID);

  await expect(client.downloadFile("vault/legacy.md")).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts -t "rejects direct text reads from removed vault paths" --reporter=verbose
```

Expected: FAIL because `downloadFile("vault/legacy.md")` still reaches storage.

**Step 3: Write the failing test for binary reads**

Add this test:

```ts
it("rejects binary reads from removed vault paths", async () => {
  const client = createAgentFileClient(supabase.client, CLIENT_ID);

  await expect(client.downloadBinary("vault/photo.png")).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});
```

**Step 4: Run the test to verify it fails**

Run:

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts -t "rejects binary reads from removed vault paths" --reporter=verbose
```

Expected: FAIL because `downloadBinary("vault/photo.png")` still succeeds.

**Step 5: Write the failing tests for directory access**

Add these tests:

```ts
it("rejects direct directory listings for removed vault paths", async () => {
  const client = createAgentFileClient(supabase.client, CLIENT_ID);

  await expect(client.listDirectory("vault")).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});

it("hides a legacy vault directory from the workspace root listing", async () => {
  supabase.mockList.mockResolvedValueOnce({
    data: [
      { name: "MEMORY.md", id: "f1" },
      { name: "memory", id: null },
      { name: "vault", id: null },
    ],
    error: null,
  });

  supabase.mockList.mockResolvedValueOnce({
    data: [],
    error: null,
  });

  const client = createAgentFileClient(supabase.client, CLIENT_ID);
  const result = await client.listDirectory("");

  expect(result).toBe(["MEMORY.md", "memory/"].join("\n"));
  expect(result).not.toContain("vault/");
});
```

**Step 6: Run the directory tests to verify they fail**

Run:

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts -t "vault" --reporter=verbose
```

Expected: FAIL because direct `vault` listings still work and root listings still show `vault/`.

**Step 7: Write the failing tests for write, edit, and delete**

Add these tests:

```ts
it("rejects writes to removed vault paths", async () => {
  const client = createAgentFileClient(supabase.client, CLIENT_ID);

  await expect(client.uploadFile("vault/new.md", "x")).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});

it("rejects edits to removed vault paths", async () => {
  const client = createAgentFileClient(supabase.client, CLIENT_ID);

  await expect(client.editFile("vault/existing.md", "a", "b")).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});

it("rejects deletes for removed vault paths", async () => {
  const client = createAgentFileClient(supabase.client, CLIENT_ID);

  await expect(client.deleteFile("vault/obsolete.md")).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});
```

**Step 8: Run the write-path tests to verify they fail**

Run:

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts -t "removed vault paths" --reporter=verbose
```

Expected: FAIL because write/edit/delete are still allowed.

**Step 9: Write the minimal implementation**

In `src/lib/storage/agent-files.ts`, add a single shared guard instead of repeating path checks:

```ts
const VAULT_REMOVED_ERROR =
  'The "vault" directory has been removed. Use Google Drive for document storage instead.';

function assertVaultPathIsAvailable(normalizedPath: string): void {
  if (normalizedPath === "vault" || normalizedPath.startsWith("vault/")) {
    throw new Error(VAULT_REMOVED_ERROR);
  }
}
```

Apply it in these places:

- `downloadObject()` before hitting Storage
- `listDirectory()` before listing any non-root path
- `uploadFile()`
- `editFile()`
- `deleteFile()`

For `listDirectory("")`, filter out a `vault` directory from the root listing before rendering:

```ts
const directories = data
  .filter((item) => item.id === null)
  .filter((item) => !(path === "" && item.name === "vault"))
  .sort((left, right) => left.name.localeCompare(right.name));
```

Keep `uploadArtifact()` untouched. It is not a vault surface.

**Step 10: Run the full storage-helper test file**

Run:

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts --reporter=verbose
```

Expected: PASS.

**Step 11: Commit**

Run:

```bash
git add src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts
git commit -m "test(pr60): retire vault paths at the storage boundary"
```

## Task 2: Remove Vault Search And Sync From Storage Tools

**Files:**
- Modify: `src/lib/runner/tools/storage/index.ts`
- Test: `src/lib/runner/tools/storage/__tests__/index.test.ts`

**Step 1: Write the failing test for the tool registry shape**

Add this test to `src/lib/runner/tools/storage/__tests__/index.test.ts`:

```ts
it("exposes only read_file and write_file storage tools", () => {
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

  expect(tools).toHaveProperty("read_file");
  expect(tools).toHaveProperty("write_file");
  expect(tools).not.toHaveProperty("search_knowledge");
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts -t "exposes only read_file and write_file storage tools" --reporter=verbose
```

Expected: FAIL because `search_knowledge` still exists.

**Step 3: Write the failing test for model-visible path descriptions**

Add this test:

```ts
it("does not mention /agent/vault/ in storage tool path descriptions", () => {
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

  expect(tools.read_file.inputSchema.shape.path.description).toContain("/agent/home/");
  expect(tools.read_file.inputSchema.shape.path.description).not.toContain("/agent/vault/");
  expect(tools.write_file.inputSchema.shape.path.description).toContain("/agent/home/notes.md");
  expect(tools.write_file.inputSchema.shape.path.description).not.toContain("/agent/vault/");
});
```

**Step 4: Run the test to verify it fails**

Run:

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts -t "does not mention /agent/vault/ in storage tool path descriptions" --reporter=verbose
```

Expected: FAIL because both descriptions still include vault examples.

**Step 5: Write the failing tests for tool-level vault rejection**

Add these tests:

```ts
it("rejects read_file for removed vault paths", async () => {
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

  await expect(
    tools.read_file.execute({ path: "/agent/vault/report.pdf" }, EXECUTION_OPTIONS),
  ).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});

it("rejects write_file for removed vault paths", async () => {
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

  await expect(
    tools.write_file.execute(
      { op: "write", path: "/agent/vault/notes.md", content: "x" },
      EXECUTION_OPTIONS,
    ),
  ).rejects.toThrow(
    'The "vault" directory has been removed. Use Google Drive for document storage instead.',
  );
});
```

**Step 6: Run the tool-level vault tests to verify they fail**

Run:

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts -t "removed vault paths" --reporter=verbose
```

Expected: FAIL because `read_file` and `write_file` still allow vault paths.

**Step 7: Write the minimal implementation**

In `src/lib/runner/tools/storage/index.ts`:

- Remove `KNOWLEDGE_SEARCH_MAX_RESULTS`
- Remove `searchKnowledgeInputSchema`
- Remove the `search_knowledge` tool
- Remove `search_knowledge` from the returned object
- Remove vault examples from the `read_file` and `write_file` path descriptions
- Remove all `runPathAwareSync()` calls
- Remove `runPathAwareSync`, `withRetryableVaultSync`, `isRetryableVaultSyncError`, `getFileNameFromPath`, `deriveTitleFromFilename`, and the vault sync constants
- Keep `path_kind`, but shrink `StoragePathKind` to:

```ts
type StoragePathKind = "skills" | "general";
```

- Update `classifyStoragePath()` so only `skills/...` returns `"skills"`; everything else returns `"general"`

Do not change the `read_file` and `write_file` names or signatures.

**Step 8: Run the storage tool tests**

Run:

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: PASS.

**Step 9: Refactor after green**

After the tests are green, delete any now-unreachable imports, types, or helper code in `src/lib/runner/tools/storage/index.ts`. Do not keep dead vault code around "for reference".

**Step 10: Run the storage tests again after refactor**

Run:

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: PASS.

**Step 11: Commit**

Run:

```bash
git add src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "refactor(pr60): remove vault search and sync from storage tools"
```

## Task 3: Drop The Vault Table And Regenerate Types

**Files:**
- Create: `supabase/migrations/<timestamp>_drop_vault_files.sql`
- Reference: `supabase/migrations/20260305030001_create_sql_helper_functions.sql`
- Regenerate: `src/types/database.ts`

**TDD note:** This repo does not have a pgTAP or SQL unit-test harness. For this task, use local Supabase reset and generated-type checks as the executable red/green loop.

**Step 1: Capture the current red state**

Run:

```bash
grep -n "vault_files" src/types/database.ts
```

Expected: One or more hits. This is the red precondition that proves the generated types still include the vault table.

**Step 2: Create the migration with the exact SQL**

Create `supabase/migrations/<timestamp>_drop_vault_files.sql` with this content:

```sql
-- PR60: Remove the Knowledge Base metadata table.
-- Supersedes PR12a. Replaced by Google Drive via Composio.

DROP TABLE IF EXISTS public.vault_files CASCADE;

CREATE OR REPLACE FUNCTION public.get_client_accessible_schema()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'table', c.table_name,
      'row_count', CASE c.table_name
        WHEN 'contacts' THEN (SELECT count(*)::int FROM public.contacts)
        WHEN 'deals' THEN (SELECT count(*)::int FROM public.deals)
        WHEN 'deal_contacts' THEN (SELECT count(*)::int FROM public.deal_contacts)
        WHEN 'interactions' THEN (SELECT count(*)::int FROM public.interactions)
        WHEN 'crm_tasks' THEN (SELECT count(*)::int FROM public.crm_tasks)
        WHEN 'crm_config' THEN (SELECT count(*)::int FROM public.crm_config)
        WHEN 'conversation_threads' THEN (SELECT count(*)::int FROM public.conversation_threads)
        WHEN 'conversation_messages' THEN (SELECT count(*)::int FROM public.conversation_messages)
        WHEN 'agent_todo' THEN (SELECT count(*)::int FROM public.agent_todo)
      END,
      'columns', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', col.column_name,
            'type', col.data_type,
            'nullable', col.is_nullable
          )
          ORDER BY col.ordinal_position
        )
        FROM information_schema.columns AS col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.table_name
      )
    )
    ORDER BY c.table_name
  )
  FROM (
    VALUES
      ('contacts'),
      ('deals'),
      ('deal_contacts'),
      ('interactions'),
      ('crm_tasks'),
      ('crm_config'),
      ('conversation_threads'),
      ('conversation_messages'),
      ('agent_todo')
  ) AS c(table_name);
$$;
```

Do not change the security mode, JSON shape, or remaining table list.

**Step 3: Run the local migration reset**

Run:

```bash
npx supabase db reset --local 2>&1 | tail -20
```

Expected: PASS. No migration errors.

**Step 4: Regenerate database types**

Run:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Expected: command completes with no shell error.

**Step 5: Run the generated-type check**

Run:

```bash
grep -n "vault_files" src/types/database.ts
```

Expected: no output.

**Step 6: Commit**

Run:

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(pr60): drop vault_files and regenerate database types"
```

## Task 4: Delete The Knowledge Surface And Keep Surrounding UI Green

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Test: `src/components/layout/app-sidebar.test.tsx`
- Modify: `src/hooks/use-realtime.ts`
- Delete: `app/(dashboard)/knowledge/page.tsx`
- Delete: `app/(dashboard)/knowledge/__tests__/page.test.tsx`
- Delete: `src/components/knowledge/vault-files-table.tsx`
- Delete: `src/components/knowledge/__tests__/vault-files-table.test.tsx`
- Delete: `src/hooks/use-vault-files.ts`
- Delete: `src/hooks/__tests__/use-vault-files.test.tsx`
- Delete: `src/lib/knowledge/schemas.ts`
- Delete: `src/lib/knowledge/postgrest-filters.ts`
- Delete: `src/lib/knowledge/__tests__/schemas.test.ts`
- Delete: `src/lib/knowledge/__tests__/postgrest-filters.test.ts`

**Step 1: Write the failing sidebar test**

In `src/components/layout/app-sidebar.test.tsx`, replace the current Knowledge assertion with this expectation:

```ts
it("renders customer and database section nav items without Knowledge", () => {
  render(<AppSidebar />, { wrapper });
  expect(screen.getByText("People")).toBeInTheDocument();
  expect(screen.getByText("Companies")).toBeInTheDocument();
  expect(screen.getByText("Deals")).toBeInTheDocument();
  expect(screen.queryByText("Knowledge")).not.toBeInTheDocument();
  expect(screen.getByText("Workspace")).toBeInTheDocument();
  expect(screen.getByText("Channels")).toBeInTheDocument();
});
```

**Step 2: Run the sidebar test to verify it fails**

Run:

```bash
npx vitest run src/components/layout/app-sidebar.test.tsx -t "without Knowledge" --reporter=verbose
```

Expected: FAIL because the sidebar still renders `Knowledge`.

**Step 3: Delete the vault-only UI and hook files**

Run:

```bash
git rm -r 'app/(dashboard)/knowledge' 'src/components/knowledge' 'src/lib/knowledge'
git rm 'src/hooks/use-vault-files.ts' 'src/hooks/__tests__/use-vault-files.test.tsx'
```

Expected: the deleted paths are staged for removal.

**Step 4: Write the minimal implementation around the deleted surface**

In `src/components/layout/app-sidebar.tsx`, remove:

```ts
{ label: "Knowledge", href: "/knowledge", icon: "knowledge" },
```

In `src/hooks/use-realtime.ts`, remove `"vault_files"` from `RealtimeTableName`.

Do not touch `src/components/icons/app-icons.tsx`.

**Step 5: Run the focused UI and hook tests**

Run:

```bash
npx vitest run src/components/layout/app-sidebar.test.tsx src/hooks/__tests__/use-realtime.test.tsx --reporter=verbose
```

Expected: PASS.

**Step 6: Run TypeScript to catch deleted imports**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS. No imports should still reference the deleted knowledge files.

**Step 7: Commit**

Run:

```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/app-sidebar.test.tsx src/hooks/use-realtime.ts
git commit -m "feat(pr60): delete the knowledge surface and sidebar entry"
```

## Task 5: Remove Vault Prompt Guidance And Update Active Docs

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Test: `src/lib/ai/__tests__/system-prompt.test.ts`
- Modify: `scripts/qa/scenarios.ts`
- Modify: `scripts/qa/README.md`
- Modify: `docs/qa/README.md`
- Modify: `docs/qa/tracker.json`
- Modify: `docs/qa/07-platform-intelligence.md`
- Modify: `docs/product/tooling/agent-tools-inventory-v2.md`
- Delete: `docs/qa/05-knowledge-base.md`

**Step 1: Write the failing system prompt test**

Replace the current vault-positive assertions in `src/lib/ai/__tests__/system-prompt.test.ts` with this test:

```ts
it("does not document the removed vault directory", () => {
  expect(SYSTEM_PROMPT).not.toContain("/agent/vault/");
  expect(SYSTEM_PROMPT).not.toContain("Knowledge Base");
});
```

**Step 2: Run the system prompt test to verify it fails**

Run:

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts -t "does not document the removed vault directory" --reporter=verbose
```

Expected: FAIL because the prompt still documents `/agent/vault/`.

**Step 3: Write the minimal prompt change**

In `src/lib/ai/system-prompt.ts`, remove:

```text
├── vault/                   # Read-write: files indexed in the Knowledge Base and searchable by the user
```

and:

```text
- Files under /agent/vault/ are indexed in the Knowledge Base and searchable by the user.
```

Do not rewrite unrelated filesystem copy.

**Step 4: Run the system prompt tests**

Run:

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts --reporter=verbose
```

Expected: PASS.

**Step 5: Update active QA docs and delete the surface doc**

Make these exact doc updates:

- `git rm docs/qa/05-knowledge-base.md`
- `scripts/qa/scenarios.ts`
  Remove Surface 05 and its two scenarios.
- `scripts/qa/README.md`
  Remove the Surface 05 row from the `## Surfaces` table.
- `docs/qa/README.md`
  Remove Surface 05 from the execution-order table.
  Remove `| 5. Knowledge Base | 12a |` from the PR coverage map.
  Update `**Total surfaces:** 28` to `**Total surfaces:** 25`.
- `docs/qa/tracker.json`
  Remove the object with `"id": "05"`.
- `docs/qa/07-platform-intelligence.md`
  Remove `vault_files` from the example table list in Scenario 7.6.
- `docs/product/tooling/agent-tools-inventory-v2.md`
  Update:

```md
**Total: 35 tools** | Read-only: 15 | Write/Mutating: 16 | Approval-gated: 4
```

to:

```md
**Total: 34 tools** | Read-only: 14 | Write/Mutating: 16 | Approval-gated: 4
```

  Update:

```md
## Storage (3 tools)
```

  to:

```md
## Storage (2 tools)
```

  Delete the `search_knowledge` row.
  Renumber all downstream tool rows by `-1`.
  Update the Access Control section to:

```md
| `allowWriteTools` | Gates CRM write tools (#7-12) and delete (#13) |
| `allowDeleteTools` | Additionally gates `delete_records` (#13) |
```

  Update the `run_sql` description so it no longer mentions `vault_files`.

**Step 6: Run the active-doc grep**

Run:

```bash
grep -ri 'vault\|search_knowledge\|Knowledge Base' \
  src/ app/ scripts/ docs/qa/ docs/product/tooling/ supabase/migrations/ \
  --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' --include='*.sql' \
  | grep -v '__tests__' \
  | grep -v '.test.' \
  | grep -v 'docs/qa/reports/' \
  | grep -v 'scripts/qa/output/' \
  | grep -v 'docs/plans/' \
  | grep -v 'docs/product/handovers/' \
  | grep -v 'docs/product/tasks/' \
  | grep -v 'docs/qa/phase-1' \
  | grep -v 'docs/product/tooling/agent-tools-inventory-v1' \
  | grep -v 'docs/product/tooling/tool-comparison-tasklet' \
  | grep -v 'supabase/migrations/2026030'
```

Expected: no output.

**Step 7: Commit**

Run:

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts scripts/qa/scenarios.ts scripts/qa/README.md docs/qa/README.md docs/qa/tracker.json docs/qa/07-platform-intelligence.md docs/product/tooling/agent-tools-inventory-v2.md
git commit -m "docs(pr60): remove vault guidance from prompt and active docs"
```

## Task 6: Full Verification And Smoke Checks

**Files:**
- Verify only. No planned code changes.

**Step 1: Run the full test suite**

Run:

```bash
npx vitest run --reporter=verbose
```

Expected: PASS.

**Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 3: Verify the route is gone**

If a local dev server is not already running, start one in a second terminal:

```bash
npm run dev
```

Then run:

```bash
curl -I http://localhost:3000/knowledge
```

Expected: `404 Not Found`.

**Step 4: Re-run the final active-surface grep**

Run the same command from Task 5, Step 6 again.

Expected: no output.

**Step 5: Verify PR 60 is already marked in progress in the v2 plan**

Run:

```bash
rg -n '"pr": 60|"status": "in_progress"' docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json
```

Expected: the PR 60 block is already `in_progress`. Do not edit the old `2026-03-01` plan.

**Step 6: Commit only if verification changed files**

If verification did not create or modify files, do not create an empty commit.

If you had to change anything during verification, run:

```bash
git add -A
git commit -m "chore(pr60): finish vault teardown verification"
```

## Completion Checklist

- [ ] `/knowledge` returns 404
- [ ] Sidebar has no `Knowledge` link
- [ ] `search_knowledge` is gone from the storage tool factory
- [ ] New `/agent/vault/` reads, writes, edits, deletes, and direct listings are rejected
- [ ] Root workspace listings do not show `vault/`
- [ ] `read_file` and `write_file` still work for memory, skills, subagents, and toolcalls
- [ ] `vault_files` is gone from generated database types
- [ ] Active QA docs and tooling inventory no longer mention the Knowledge Base
- [ ] Historical migrations and historical docs were left untouched
- [ ] PR 60 remains `in_progress` in `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
