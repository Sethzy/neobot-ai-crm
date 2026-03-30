# Vercel Sandbox + `bash-tool` Migration Tasklist

**PR:** Out-of-plan architecture migration for the main App Router runner
**Decisions:** `EXEC-04` (Vercel Sandbox deferred but confirmed), Tasklet flat-tool pattern, 2026-03-28 handover + design doc v2
**Goal:** Replace the remaining Sprites-era sandbox assumptions in the main Sunder runner with a lazy per-run Vercel Sandbox `bash` tool powered by `bash-tool`, while keeping persistent state in Supabase Storage and preserving the existing App Router chat flow.

**Architecture:** The runner keeps its existing `streamText()` loop and flat tool surface. A new first-party `bash` tool is registered at run start, but it initializes lazily on the first call. On first use it:
1. creates an ephemeral Vercel Sandbox from the golden snapshot,
2. preloads attachments, `context.json`, and all user skill files with `sandbox.writeFiles()`,
3. constructs the real `bash-tool` bash tool against that sandbox,
4. delegates the command,
5. uploads any new files found under `/vercel/sandbox/workspace/output/` back to Supabase Storage so the model sees download URLs in the same run.

Cleanup uses runner stream callbacks (`onFinish` + `onError`), not a lexical `finally`, because `runAgent()` returns the streaming result immediately.

**Tech Stack:** `ai` v6, `bash-tool`, `@vercel/sandbox`, Zod 4, Supabase Storage, Vitest

**Design / review inputs:**
- `docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md`
- `roadmap docs/Sunder - Source of Truth/references/vercel-bash/01-vercel-sandbox-reference-repos-analysis.md`
- `docs/product/handovers/2026-03-28-vercel-sandbox-migration-handover.md`
- Official docs:
  - Vercel Sandbox create API + snapshot source
  - Vercel Sandbox auth docs
  - Vercel changelog for `readFileToBuffer()`
  - `bash-tool` local source + integration tests

**Out of scope:**
- Legacy Analyst endpoint: `pages/api/analyst/chat.ts` and `src/server/api/chat.ts`
- Subagent access to the new `bash` tool
- Sandbox preview URLs / long-lived published sites
- Reintroducing the old generic `execute_in_sandbox` API

---

## Review Fixes Applied

These corrections should override the stale parts of the design doc during implementation:

1. **Workspace path:** Use bash-tool's Vercel default path `/vercel/sandbox/workspace`. Do not introduce a custom `/workspace` override.
2. **SDK versions:** Use `bash-tool@^1.3.15` and current stable `@vercel/sandbox@^1.9.0`, not the older versions pinned in the reference apps.
3. **Auth model:** Prefer Vercel OIDC auth (`VERCEL_OIDC_TOKEN` locally, automatic on Vercel). Treat `VERCEL_TOKEN` as fallback only.
4. **Binary preload:** Do **not** rely on `createBashTool({ files })` for `.xlsx` inputs. `files` is text-only. Preload everything through `sandbox.writeFiles()` so binary spreadsheets work.
5. **Artifact delivery timing:** Do **not** wait until end-of-run cleanup to upload output files. Sync `/vercel/sandbox/workspace/output/` after each `bash` call so the model can mention returned download URLs in the same response.
6. **Cleanup hook:** In this codebase, runner lifecycle cleanup must live in stream callbacks (`onFinish` + `onError`), not in a surrounding `finally`.
7. **Skill preload choice:** For v1, preload **all user-authored skills** in `/agent/skills/{slug}/**` except reserved/system/connection directories. Do not try to infer the single “active” skill.
8. **Existing timeout:** `app/api/chat/route.ts` already exports `maxDuration = 300`; no timeout change is required for this migration.
9. **DB work:** The sprite-table cleanup migration already exists at `supabase/migrations/20260328120000_drop_sprite_tables.sql`. Do not create a duplicate migration.

---

## Relevant Files

### Modify
- `package.json`
- `.env.example`
- `src/lib/env.ts`
- `src/lib/__tests__/env.test.ts`
- `src/lib/ai/system-prompt.ts`
- `src/lib/runner/run-agent.ts`
- `src/lib/runner/__tests__/run-agent.test.ts`

### Create
- `src/lib/runner/tools/sandbox/index.ts`
- `src/lib/runner/tools/sandbox/types.ts`
- `src/lib/runner/tools/sandbox/build-preload-files.ts`
- `src/lib/runner/tools/sandbox/build-context-json.ts`
- `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`

### Reference Only
- `app/api/chat/route.ts`
- `src/lib/runner/tool-registry.ts`
- `src/lib/runner/context.ts`
- `src/lib/runner/skills/discover-skills.ts`
- `src/lib/runner/skills/skill-bootstrap.ts`
- `src/lib/storage/agent-files.ts`
- `src/lib/storage/agent-paths.ts`
- `/Users/sethlim/Documents/bash-tool/src/tool.ts`
- `/Users/sethlim/Documents/bash-tool/src/tool.vercel.integration.test.ts`
- `/Users/sethlim/Documents/call-summary-agent-with-sandbox/lib/tools.ts`
- `/Users/sethlim/Documents/oss-data-analyst/src/lib/tools/sandbox.ts`

---

## Task 1: Add Dependencies and Env Validation

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/__tests__/env.test.ts`

**Goal:** Install the current supported packages and validate the env contract the runner will use.

### Step 1: Add the failing env tests

In `src/lib/__tests__/env.test.ts`, add coverage for:
- optional `VERCEL_OIDC_TOKEN`
- optional `VERCEL_TOKEN`
- optional `SANDBOX_GOLDEN_SNAPSHOT_ID`
- trimming behavior
- local fallback precedence: OIDC token preferred over access token when both are set

Expected failure: `getServerEnv()` does not expose these keys yet.

### Step 2: Extend env validation

Update `src/lib/env.ts`:
- Add optional `VERCEL_OIDC_TOKEN`
- Add optional `VERCEL_TOKEN`
- Add optional `SANDBOX_GOLDEN_SNAPSHOT_ID`

Notes:
- `SANDBOX_GOLDEN_SNAPSHOT_ID` should stay optional at app boot because most runs never use sandbox.
- The sandbox tool should throw a targeted runtime error on first `bash` call if the snapshot ID is missing.

### Step 3: Update `.env.example`

Remove stale primary guidance around `SPRITES_TOKEN` for the main runner path and add:
- `SANDBOX_GOLDEN_SNAPSHOT_ID=`
- `VERCEL_OIDC_TOKEN=`
- `VERCEL_TOKEN=`

Comment guidance:
- OIDC token is the primary auth path
- `VERCEL_TOKEN` is fallback for non-Vercel environments
- snapshot ID is required only when sandbox features are used

### Step 4: Install the dependencies

Add:
- `bash-tool@^1.3.15`
- `@vercel/sandbox@^1.9.0`

Do not pin to `1.0.x` or `1.1.x` from the reference apps.

### Step 5: Verify

Run:

```bash
pnpm install
pnpm vitest run src/lib/__tests__/env.test.ts
```

### Step 6: Commit

```bash
git add package.json pnpm-lock.yaml .env.example src/lib/env.ts src/lib/__tests__/env.test.ts
git commit -m "feat(sandbox): add Vercel Sandbox deps and env validation"
```

---

## Task 2: Build Sandbox Context + Preload File Assembly

**Files:**
- Create: `src/lib/runner/tools/sandbox/types.ts`
- Create: `src/lib/runner/tools/sandbox/build-context-json.ts`
- Create: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`

**Goal:** Convert current-run state into concrete files that can be written into a sandbox before the first `bash` execution.

### Step 1: Define the preload types

In `types.ts`, create small boring types:

```ts
export interface SandboxPreloadFile {
  path: string;
  content: Buffer;
}

export interface SandboxContextEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}
```

Keep the module narrow. No classes.

### Step 2: Write the failing `context.json` tests

Cover:
- accepts accumulated tool results and serializes them in a stable order
- excludes `bash`
- excludes operational tools that are not useful in scripts (`write_file`, `rename_chat`, connection mutations, trigger mutations, `send_message`, `run_subagent`)
- excludes multimodal `read_file` payloads (image/pdf data blobs)
- marks truncation if the serialized payload exceeds a fixed ceiling

Concrete structure:

```json
{
  "generatedAt": "...",
  "tools": [
    {
      "toolCallId": "call-1",
      "toolName": "search_contacts",
      "input": { ... },
      "output": { ... }
    }
  ]
}
```

Use a fixed total budget, e.g. `500_000` bytes. If exceeded, drop oldest low-value entries and set `_truncated: true`.

### Step 3: Implement `buildContextJson`

Use an explicit denylist plus simple guards:
- denylist operational tools
- exclude `bash`
- exclude read results with `type: "image"` or `type: "pdf"`
- include only results gathered **before** first sandbox initialization

The output should be JSON text, not a JS object, because it will be written directly into `input/context.json`.

### Step 4: Write the failing preload file tests

Cover:
- public chat attachment URLs are downloaded and turned into `input/{filename}`
- CSV and XLSX both work
- all user skill directories are included under `skills/{slug}/...`
- system / connection / reserved directories stay excluded
- `input/context.json` is included
- duplicate filenames are normalized safely

### Step 5: Implement `buildPreloadFiles`

Build a single `SandboxPreloadFile[]` using:
- current run file attachments from `payload.fileParts`
- all user-authored skills from Supabase Storage
- `buildContextJson()` output

Guidance:
- Download attachments by URL because chat uploads currently persist only public URLs, not agent bucket paths.
- Preserve relative skill paths under `skills/{slug}/...`.
- Normalize filenames to avoid empty names and directory traversal.
- Write everything relative to `/vercel/sandbox/workspace`.

### Step 6: Verify

Run:

```bash
pnpm vitest run \
  src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts \
  src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

### Step 7: Commit

```bash
git add src/lib/runner/tools/sandbox/types.ts \
  src/lib/runner/tools/sandbox/build-context-json.ts \
  src/lib/runner/tools/sandbox/build-preload-files.ts \
  src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts \
  src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
git commit -m "feat(sandbox): build preload files and context json"
```

---

## Task 3: Implement Artifact Sync and the Lazy `bash` Tool Wrapper

**Files:**
- Create: `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- Create: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- Create: `src/lib/runner/tools/sandbox/index.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`

**Goal:** Create one model-facing `bash` tool that lazily boots the sandbox, reuses it across calls, and returns uploaded artifact URLs in-band.

### Step 1: Write failing artifact-sync tests

Cover:
- scans `/vercel/sandbox/workspace/output` for files
- uploads newly created files through `createAgentFileClient().uploadArtifact()`
- preserves relative subpaths under `artifacts/sandbox/{runId}/...`
- infers content type from filename extension
- skips unchanged files across repeated `bash` calls
- re-uploads changed content when filename is reused

Implementation hint:
- use `sandbox.runCommand("bash", ["-lc", "find /vercel/sandbox/workspace/output -type f | sort"])`
- use `sandbox.readFileToBuffer({ path })`
- compute `sha256(buffer)` to detect change

Return shape:

```ts
export interface SyncedSandboxArtifact {
  relativePath: string;
  downloadUrl: string;
  contentType: string;
  sizeBytes: number;
}
```

### Step 2: Implement `syncOutputArtifacts`

Keep it stateless from the caller’s perspective, but allow the caller to pass a mutable `Map<string, string>` of prior hashes.

Do not shell out through the model-facing bash tool for cleanup work. Use the raw sandbox SDK directly.

### Step 3: Write failing lazy-tool tests

Cover:
- no sandbox is created until the first `bash.execute`
- first call creates sandbox from snapshot and writes preload files
- `createBashTool()` is called once and reused across subsequent commands
- wrapper returns `stdout`, `stderr`, `exitCode`, and `artifacts`
- `artifacts` includes uploaded URLs after a command generates files
- cleanup is idempotent and safe when sandbox was never created
- missing snapshot ID throws a targeted error when `bash` is invoked

### Step 4: Implement `createLazyBashTool`

Implementation shape:

```ts
createLazyBashTool({
  supabase,
  clientId,
  threadId,
  runId,
  fileParts,
  getContextEntries,
})
```

Responsibilities:
- read env on first use
- `Sandbox.create({ source: { type: "snapshot", snapshotId }, timeout: 5 * 60 * 1000 })`
- preload files with `sandbox.writeFiles(...)`
- call `createBashTool({ sandbox, extraInstructions, maxOutputLength: 100_000 })`
- wrap the returned `bash.execute` so each command is followed by `syncOutputArtifacts(...)`
- expose:
  - `tool` for the runner `tools` object
  - `cleanup()` for `onFinish` / `onError`
  - optional `hasInitialized()` for tests

Important:
- Do not use `createBashTool({ files })` for spreadsheet inputs.
- Use `extraInstructions` to append a generated file tree / location summary so the model still sees the preloaded files in the tool description.
- Keep the tool name exactly `bash`.

### Step 5: Verify

Run:

```bash
pnpm vitest run \
  src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts \
  src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

### Step 6: Commit

```bash
git add src/lib/runner/tools/sandbox/index.ts \
  src/lib/runner/tools/sandbox/sync-output-artifacts.ts \
  src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts \
  src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts \
  src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
git commit -m "feat(sandbox): add lazy bash tool with artifact syncing"
```

---

## Task 4: Wire the Tool into the Runner and Prompt

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`

**Goal:** Make the main runner aware of sandbox behavior without changing the rest of the tool surface.

### Step 1: Add the failing runner tests

Add coverage for:
- `bash` is present in the top-level tool map for normal chat runs
- sandbox is still lazy: `runAgent()` startup does not create it
- `onStepFinish` accumulates tool results for later `context.json` assembly
- `cleanup()` is invoked from `onFinish`
- `cleanup()` is also invoked from `onError`
- subagent tool registry remains unchanged (no `bash` added through `createRunnerTools`)

### Step 2: Update the system prompt

Append a `<sandbox>` block to `src/lib/ai/system-prompt.ts` using the reviewed filesystem contract:
- `/vercel/sandbox/workspace/input/`
- `/vercel/sandbox/workspace/skills/{slug}/`
- `/vercel/sandbox/workspace/output/`

Prompt rules:
- use sandbox for scripting / data processing / conversions
- do not use it for browser work
- do not hard-code data from prior tool results; read `input/context.json`
- write final deliverables to `output/`

Do not mention `/workspace`.

### Step 3: Wire lazy sandbox state into `run-agent.ts`

Inside `runAgent()`:
- create an in-memory accumulator for current-run tool results
- instantiate `createLazyBashTool(...)`
- merge `bash` into the `tools` object alongside existing runner tools and activated connection tools
- add `onStepFinish` to capture tool results from completed steps into the accumulator before any later sandbox use
- call sandbox cleanup in both `onFinish` and `onError`

Keep `createRunnerTools()` pure. Do **not** thread sandbox-specific run state through `tool-registry.ts`.

### Step 4: Preserve current run finalization

Do not move assistant persistence out of `finalizeRun()`.

The only runner lifecycle change here is:
- add `onStepFinish`
- add `bash`
- add cleanup callbacks

Everything else should stay boring.

### Step 5: Verify

Run:

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Then run a focused typecheck:

```bash
pnpm exec tsc --noEmit
```

### Step 6: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(sandbox): wire lazy bash tool into runner"
```

---

## Task 5: End-to-End Verification and Cutover Notes

**Files:**
- Modify if needed: `docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md`
- Modify if needed: `docs/product/handovers/2026-03-28-vercel-sandbox-migration-handover.md`

**Goal:** Prove the migration works in the main runner and document any final spec corrections discovered during implementation.

### Step 1: Manual smoke tests

Run the app locally with valid sandbox auth and snapshot env:

1. attachment-only chat turn with `.csv`
2. attachment-only chat turn with `.xlsx`
3. multi-step gather flow:
   - user asks for analysis
   - agent calls non-sandbox tools first
   - first `bash` call creates sandbox
   - command writes into `output/`
   - tool result includes returned artifact URLs
4. second `bash` call in the same run reuses the sandbox
5. run without `SANDBOX_GOLDEN_SNAPSHOT_ID` and confirm the tool fails with a clear targeted message

### Step 2: Regression checks

Run:

```bash
pnpm vitest run \
  src/lib/runner/__tests__/run-agent.test.ts \
  src/lib/__tests__/env.test.ts \
  src/lib/runner/tools/sandbox/__tests__/
```

If time permits, also smoke the chat route end to end.

### Step 3: Update the docs only if implementation disproves the current spec

If implementation confirms the reviewed decisions above, patch the design doc / handover so future work no longer references:
- `/workspace`
- `files Record` for binary spreadsheet preload
- `finally` cleanup for the main streaming runner
- `VERCEL_TOKEN` as the primary auth path

### Step 4: Commit

```bash
git add docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md docs/product/handovers/2026-03-28-vercel-sandbox-migration-handover.md
git commit -m "docs(sandbox): align reviewed migration docs with shipped runner behavior"
```

If no doc changes are needed after verification, skip this commit.

---

## Exit Criteria

- Main App Router runner exposes a `bash` tool that boots Vercel Sandbox lazily on first use
- Sandbox path contract is consistently `/vercel/sandbox/workspace`
- Binary spreadsheet attachments preload correctly
- `context.json` is assembled from prior in-run tool results before first `bash` execution
- Output artifacts are uploaded and returned to the model in the same run
- Cleanup is reliable through `onFinish` and `onError`
- No new sprite migration is added
- Legacy Analyst path remains explicitly out of scope
