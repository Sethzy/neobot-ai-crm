# PR 7: File Tools (Supabase Storage) — Corrected Tasklist

## Scope

Implement PR7 from `docs/product/plans/2026-03-01-implementation-phasing-plan.json`:

- `PR7-1` per-client storage layout
- `PR7-2` `read_file` tool
- `PR7-3` `write_file` tool
- `PR7-4` `agent-files` bucket migration
- `PR7-5` storage RLS by client prefix
- `PR7-6` no file versioning in v1

## Important Architecture Correction

This PR **must not** move orchestration back into `app/api/chat/route.ts`.

- Keep the route thin (auth/validation + `runAgent()` call).
- Register new file tools inside the runner tool layer.
- Preserve single-runner architecture (`RUNNER-01`, `EXEC-01`, `RUNNER-02`).

## Decisions

- `DATA-02` Supabase Storage as file store
- `DATA-04` per-client file layout (`/{clientId}/...`)
- `DATA-05` no versioning in v1
- `TOOL-03` dual-purpose `read_file`, path-aware `write_file`

## Files

### Create

- `src/lib/storage/agent-files.ts`
- `src/lib/storage/__tests__/agent-files.test.ts`
- `src/lib/runner/tools/storage/index.ts`
- `src/lib/runner/tools/storage/__tests__/index.test.ts`
- `supabase/migrations/20260302130000_create_agent_files_bucket.sql`

### Modify

- `src/lib/runner/tools/index.ts`
- `src/lib/runner/run-agent.ts`
- `src/lib/runner/__tests__/run-agent.test.ts`
- `src/lib/runner/__tests__/serialization.test.ts`
- `src/lib/runner/__tests__/stale-cleanup.test.ts`

## TDD Rules (Mandatory)

For every behavior:

1. Write/extend one failing test.
2. Run targeted test and confirm failure for expected reason.
3. Implement minimum code to pass.
4. Re-run targeted tests.
5. Continue to next behavior.
6. Run full `vitest` suite at end.

Do not write production code before a failing test exists.

---

## Task 1 — Storage Helper (`PR7-1`)

### Goal

Implement a client-scoped storage helper that:

- normalizes and validates relative paths
- blocks traversal (`..`)
- blocks writes to root `SOUL.md`
- supports file read/write/edit/delete
- supports recursive directory listing

### TDD Steps

1. Add failing tests in `src/lib/storage/__tests__/agent-files.test.ts` for:
- `resolvePath` scopes under `{clientId}/`
- traversal rejection
- read root file
- list root directory recursively
- upload overwrite
- single-replace edit
- replace-all edit
- delete
- root `SOUL.md` write protection

2. Run:
```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts
```

3. Implement `src/lib/storage/agent-files.ts` with:
- `createAgentFileClient(supabase, clientId)`
- methods:
  - `downloadFile(path)`
  - `listDirectory(path)`
  - `uploadFile(path, content)`
  - `editFile(path, oldString, newString, replaceAll?)`
  - `deleteFile(path)`
- shared path sanitizer + guard helpers

4. Re-run targeted tests until all green.

---

## Task 2 — Runner File Tools (`PR7-2`, `PR7-3`)

### Goal

Define file tools in runner tool layer (not route) with existing tool conventions.

Tool names:

- `read_file`
- `write_file`

### Behavior

`read_file`
- path points to file → return content
- path points to directory or ends with `/` → return recursive tree
- optional `start_line` / `end_line` slicing for file reads

`write_file`
- `op = "write"` create/overwrite content
- `op = "edit"` exact find/replace (`replace_all` optional)
- `op = "delete"` remove file

### TDD Steps

1. Add failing tests in `src/lib/runner/tools/storage/__tests__/index.test.ts` for:
- `read_file` file read path
- `read_file` directory listing path
- `read_file` line range slicing
- `write_file` write op
- `write_file` edit op
- `write_file` delete op
- write protection bubble-up for `SOUL.md`

2. Run:
```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

3. Implement `src/lib/runner/tools/storage/index.ts`:
- `createStorageTools(supabase, clientId)`
- construct helper via `createAgentFileClient(...)`
- return object containing `read_file` and `write_file` via `tool({ inputSchema, ... })`

4. Re-run targeted tests until green.

---

## Task 3 — Runner Registration (`PR7-2`, `PR7-3`)

### Goal

Register storage tools in `runAgent()` alongside CRM tools.

### TDD Steps

1. Add failing assertions in runner tests:
- `src/lib/runner/__tests__/run-agent.test.ts`
- verify `streamText` receives both CRM + file tools

2. Run targeted runner tests:
```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

3. Implement:
- export `createStorageTools` from `src/lib/runner/tools/index.ts`
- update `src/lib/runner/run-agent.ts` to merge:
  - `createCrmTools(...)`
  - `createStorageTools(...)`

4. Re-run runner tests:
```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/serialization.test.ts src/lib/runner/__tests__/stale-cleanup.test.ts
```

---

## Task 4 — Storage Migration (`PR7-4`, `PR7-5`, `PR7-6`)

### Goal

Create `agent-files` bucket and RLS policies scoped by first folder segment (`client_id`).

### SQL Requirements

File: `supabase/migrations/20260302130000_create_agent_files_bucket.sql`

1. Create bucket:
- `id = 'agent-files'`
- `public = false`
- idempotent (`ON CONFLICT DO NOTHING`)

2. Create policies on `storage.objects` for bucket:
- select
- insert
- update
- delete

3. Each policy enforces:
- `bucket_id = 'agent-files'`
- `(storage.foldername(name))[1] = public.get_my_client_id()::text`

4. Do **not** create duplicate auth→client helper functions in `storage` schema.
Reuse existing canonical `public.get_my_client_id()`.

5. Add comments clarifying no file versioning in v1 (`DATA-05`).

### Validation

If local Supabase is configured:
```bash
npx supabase db lint
```

If not configured, run SQL review + keep migration syntax conservative and idempotent.

---

## Task 5 — Verification

Run all relevant tests:

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
npx vitest run src/lib/runner/__tests__/run-agent.test.ts src/lib/runner/__tests__/serialization.test.ts src/lib/runner/__tests__/stale-cleanup.test.ts
npx vitest run
```

Manual checks:

- route still calls `runAgent()` (no direct `streamText` in route)
- file tools are present in runner `streamText({ tools })` payload
- migration file is idempotent and tenant-scoped

---

## Commit Guidance

Keep commits focused and small:

1. storage helper + tests
2. storage runner tools + tests
3. runner wiring + runner tests
4. migration
5. final polish (if needed)

No unrelated refactors.

---

## Done Criteria

PR7 is complete when:

- file operations work under per-client storage prefix
- route architecture remains thin + runner-based
- file tools are available through runner tool registration
- `agent-files` migration exists with tenant-safe RLS
- tests are green
