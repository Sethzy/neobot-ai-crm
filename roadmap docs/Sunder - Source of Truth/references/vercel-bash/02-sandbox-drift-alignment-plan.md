# Sandbox Drift Alignment Plan

**Date:** 2026-03-31
**Status:** Proposed
**Purpose:** Line-by-line comparison of Sunder's current sandbox implementation against the three official Vercel reference repos. Identifies every drift, classifies whether drift is justified, and provides exact file-level remediation for unjustified drift.

**Reference repos (local clones):**
- `bash-tool` v1.3.15 — `/Users/sethlim/Documents/bash-tool`
- `call-summary-agent-with-sandbox` — `/Users/sethlim/Documents/call-summary-agent-with-sandbox`
- `oss-data-analyst` — `/Users/sethlim/Documents/oss-data-analyst`

**Sunder files under review:**
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- `src/lib/runner/tools/sandbox/build-preload-files.ts`
- `src/lib/runner/tools/sandbox/build-context-json.ts`
- `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- `src/lib/runner/tools/sandbox/types.ts`
- `src/lib/runner/run-agent.ts` (sandbox wiring, lines 225-420)
- `src/lib/ai/system-prompt.ts` (SANDBOX_PROMPT)
- `src/lib/composio/file-bridge.ts`

---

## 1. Reference Pattern Summary

All three repos follow the same architecture for sandbox + bash-tool:

```
1. Sandbox.create(options)               // @vercel/sandbox
2. buildFiles()                          // app-specific file assembly
3. createBashTool({ sandbox, files })    // bash-tool handles upload + tool creation
4. streamText({ tools: { bash } })       // AI SDK
5. cleanup: sandbox.stop()               // onFinish or finally
```

**bash-tool's contract:**
- Input: `{ sandbox, files, extraInstructions, maxOutputLength, onBeforeBashCall, onAfterBashCall }`
- Output: `{ bash: Tool, tools: { bash, readFile, writeFile }, sandbox: WrappedSandbox }`
- bash-tool handles: file upload (batched, streamed), tool description auto-generation (CLI discovery + format hints), output truncation, working directory management

**What the caller does NOT do in reference repos:**
- Call `sandbox.writeFiles()` directly (bash-tool does this)
- Write a custom tool description (bash-tool auto-generates one)
- Extract `.execute` from the tool and wrap it in a new `tool()` (use the tool directly)

---

## 2. Drift Inventory

### DRIFT-1: File preloading bypasses bash-tool

**Reference pattern (call-summary-agent `lib/tools.ts`):**
```typescript
const { tools } = await createBashTool({
  sandbox,
  files,                     // Record<string, string> — bash-tool uploads
  onBeforeBashCall,
  onAfterBashCall,
});
```

**What Sunder does (create-lazy-bash-tool.ts:139-154):**
```typescript
const preloadFiles = await getPreloadFiles();
// ... builds allFiles array ...
await sandbox.writeFiles(                          // <-- BYPASSES bash-tool
  allFiles.map((f) => ({
    path: `${WORKSPACE}/${f.path}`,
    content: f.content,
  })),
);
// Then creates bash-tool with NO files:
const { bash } = await createBashTool({
  sandbox,
  extraInstructions,
  maxOutputLength: 100_000,
});
```

**Impact:** Sunder duplicates bash-tool's file upload logic. bash-tool internally writes files in batches of 20 with streaming to avoid memory spikes. Sunder does a single bulk `writeFiles()` call.

**Justified drift?** Partially. Sunder's files come from Supabase Storage as `Buffer`, not `string`. bash-tool's `files` param is `Record<string, string>`. However, bash-tool also accepts `Buffer` content via its `writeFiles` adapter — the Vercel wrapper (`src/sandbox/vercel.ts`) converts strings to Buffers anyway. So the type mismatch is not a real blocker.

The actual issue: Sunder's `SandboxPreloadFile` uses `{ path, content: Buffer }` while bash-tool expects `Record<string, string>`. Converting Buffers to strings would corrupt binary files (XLSX, PDF, images).

**Verdict: JUSTIFIED for binary files. FIX for text-only files.**

**Remediation:**
- For text files (skills, context.json): convert to `Record<string, string>` and pass via `files` param
- For binary files (uploads, home): keep using `sandbox.writeFiles()` directly — bash-tool's `files` param only supports `string` values
- This is a partial alignment. File the gap as a bash-tool feature request (support `Buffer` values in `files` param).

---

### DRIFT-2: Custom tool description replaces auto-generated one

**Reference pattern (bash-tool `src/tools/bash.ts`):**
bash-tool auto-generates the tool description by:
1. Running `ls /usr/bin /usr/local/bin /bin /sbin /usr/sbin` in the sandbox
2. Matching against a known tools database (30+ tools with categories)
3. Detecting file formats from uploaded filenames
4. Generating format-specific hints (e.g., "For JSON: jq, grep, sed")
5. Listing first 8 uploaded filenames
6. Including common operations cheatsheet
7. Appending `extraInstructions`

**What Sunder does (create-lazy-bash-tool.ts:189-194):**
```typescript
const bashTool = tool({
  description: [
    "Execute a bash command in an isolated sandbox environment.",
    "The sandbox has Python 3 (pandas, openpyxl, matplotlib, numpy), Node 22, LibreOffice, and standard CLI tools.",
    "User uploads are at agent/uploads/, skill references at skills/, and persistent results belong in agent/home/.",
  ].join(" "),
  // ...
});
```

Sunder defines its own AI SDK `tool()` with a hand-written 3-line description, completely replacing bash-tool's auto-generated description. The bash-tool description is never seen by the LLM.

**Impact:** The LLM loses:
- Auto-discovered available CLI tools (jq, yq, awk, etc.)
- Format-specific tool recommendations
- File listing in the tool description
- Common operations cheatsheet

These are compensated partially by `SANDBOX_PROMPT` in the system prompt and `extraInstructions` passed to bash-tool (but extraInstructions goes into bash-tool's internal description which Sunder discards).

**Justified drift?** Partially. The wrapper itself is justified (needed for lazy init + artifact sync since `onAfterBashCall` is sync-only — see DRIFT-7 blocker). But the hand-written 3-line description is NOT justified — it's strictly less informative than bash-tool's auto-generated description.

**Verdict: PARTIAL FIX.**

**Remediation:**
- Keep the outer `tool()` wrapper (required for lazy init + artifact sync)
- Move Sunder-specific filesystem guidance into `extraInstructions` so bash-tool's auto-generated description includes it (working directory, available files, format hints, common operations, PLUS Sunder paths)
- Update the wrapper's description to be minimal (e.g., "Execute a bash command in the sandbox.") since the LLM also sees the fuller detail via bash-tool's internal description in `extraInstructions`. Alternatively, capture bash-tool's generated description and forward it to the wrapper.

---

### DRIFT-3: Only `bash.execute` extracted — readFile/writeFile discarded

**Reference pattern (oss-data-analyst `src/lib/agent.ts`):**
```typescript
const { tools: bashTools } = await createSemanticBashTools(sandbox);
// tools = { bash, readFile, writeFile }

const result = streamText({
  tools: {
    bash: bashTools.bash,      // AI SDK Tool object used directly
    ExecuteSQL,
    FinalizeReport,
  },
});
```

**What Sunder does (create-lazy-bash-tool.ts:178-184):**
```typescript
const { bash } = await createBashTool({
  sandbox,
  extraInstructions,
  maxOutputLength: 100_000,
});
bashExecute = bash.execute;   // Extract raw execute function only
```

Then wraps it in a custom `tool()` at line 189. The `readFile` and `writeFile` tools from bash-tool are never accessed.

**Impact:**
- `readFile` — cleaner file reads than `cat`. The LLM must use `bash({ command: "cat file.txt" })` for all reads. bash-tool's `readFile` handles path resolution and returns clean content.
- `writeFile` — cleaner file writes than `echo >`. Auto-creates parent directories.

However, Sunder already has its own `read_file` and `write_file` tools for Supabase Storage. Exposing bash-tool's versions would create naming confusion (two `readFile` tools with different behaviors — one reads from sandbox filesystem, one from Supabase Storage).

**Justified drift?** Yes. Sunder's existing `read_file`/`write_file` tools cover the Supabase Storage use case. Adding sandbox-specific `readFile`/`writeFile` would confuse the LLM with two similar-named tools that target different filesystems. The agent can use `bash({ command: "cat ..." })` for sandbox reads, which is what both reference repos' agents actually do in practice anyway.

**Verdict: KEEP current behavior. No change needed.**

---

### DRIFT-4: Logging hooks not used

**Reference pattern (call-summary-agent `lib/tools.ts`):**
```typescript
const { tools } = await createBashTool({
  sandbox,
  files,
  onBeforeBashCall: ({ command }) => {
    log("info", "bash", `$ ${command}`);
    return undefined;
  },
  onAfterBashCall: ({ result }) => {
    const lines = result.stdout.split("\n");
    const preview = lines.slice(0, 8).join("\n");
    log("info", "bash-output", preview + (lines.length > 8 ? `\n... (${lines.length} lines)` : ""));
    if (result.stderr) log("warn", "bash", result.stderr.slice(0, 500));
    if (result.exitCode !== 0) log("warn", "bash", `Exit code: ${result.exitCode}`);
    return undefined;
  },
});
```

**What Sunder does:** No hooks. No structured logging of sandbox commands.

**Impact:** No Langfuse visibility into what bash commands the agent runs, their output, or errors. This is a significant observability gap.

**Justified drift?** No.

**Verdict: FIX.**

**Remediation:**
- Add `onBeforeBashCall` and `onAfterBashCall` to the `createBashTool` call
- Log to `console.log`/`console.warn` with `[sandbox]` prefix (these are captured by Langfuse via AI SDK telemetry)
- Copy the call-summary-agent pattern exactly (8-line preview, stderr warning, exit code warning)

---

### DRIFT-5: Lazy initialization (sandbox boots on first bash call)

**Reference pattern (both repos):**
```typescript
// Sandbox created eagerly before streamText
const { sandbox, stop } = await createSandbox();
const { tools } = await createBashTool({ sandbox, files });

const result = streamText({ tools: { bash: tools.bash } });
```

**What Sunder does:**
Sandbox is NOT created until the LLM first calls the `bash` tool. `createLazyBashTool()` returns a tool stub that triggers `initialize()` on first execution. This includes concurrency-safe promise memoization and error retry.

**Impact:** Saves sandbox cost + boot time when the agent doesn't need bash. Sunder's agent often handles simple CRM queries that never touch the sandbox.

**Justified drift?** Yes. Sunder is a multi-tool agent where bash is one of 30+ tools. Reference repos are single-purpose apps where bash is always used. Lazy boot is a meaningful cost optimization.

**Verdict: KEEP. This is strictly better for Sunder's use case.**

---

### DRIFT-6: Golden snapshot for sandbox creation

**Reference pattern:**
```typescript
const sandbox = await Sandbox.create({
  resources: { vcpus: 4 },
  timeout: ms("45m"),
});
```

**What Sunder does:**
```typescript
const sandbox = await Sandbox.create({
  source: { type: "snapshot", snapshotId },
  timeout: SANDBOX_TIMEOUT_MS,
});
```

Uses a pre-built snapshot with all packages pre-installed for faster cold start.

**Justified drift?** Yes. Golden snapshots reduce sandbox boot time from ~10s to ~2s. The reference repos don't need this because they're demos, not production SaaS. The `source` option is an official `@vercel/sandbox` feature.

**Verdict: KEEP.**

---

### DRIFT-7: Artifact sync after every bash command

**Reference pattern:** Neither reference repo syncs files out of the sandbox. They're analysis-only — the agent reads files in, processes them, and returns text.

**What Sunder does (sync-output-artifacts.ts):**
After every bash command, scans `agent/home/` for new/changed files, uploads to Supabase Storage, generates 7-day signed download URLs, returns artifacts array to the LLM.

**Justified drift?** Yes. Sunder's agent generates deliverables (XLSX reports, PDF docs, charts) that users download. The reference repos don't have this requirement.

**Verdict: KEEP. This is Sunder-specific value-add.**

The ideal implementation would use `onAfterBashCall` to run artifact sync. However, **bash-tool's hooks are sync-only** (verified — see Task 4 blocker). Since `syncOutputArtifacts` is async (sandbox I/O + Supabase upload), it cannot run inside the hook.

**Current approach is correct:** The outer `tool()` wrapper calls `bashExecute()` then `syncOutputArtifacts()` sequentially. This is the only viable architecture until bash-tool adds async hook support.

---

### DRIFT-8: context.json — accumulated tool results serialized to sandbox

**Reference pattern:** All input data is known before sandbox creation. Files are static (transcripts, YAML schemas).

**What Sunder does (build-context-json.ts):**
Accumulates tool results during the agent run via `onStepFinish`. When the sandbox boots, serializes them to `input/context.json` inside the sandbox. This allows Python/Node scripts in the sandbox to read CRM data, market data, etc. gathered by earlier tool calls.

**Justified drift?** Yes. Sunder's agent gathers data dynamically via tool calls before the sandbox is used. Reference repos have static input.

**Verdict: KEEP. Pass context.json via the `files` param to align with how bash-tool expects files.**

---

### DRIFT-9: Composio file bridge

**Reference pattern:** N/A — no OAuth integrations in reference repos.

**What Sunder does (file-bridge.ts):**
Bidirectional bridge: Composio downloads → Supabase Storage + sandbox. Agent storage files → temp disk for Composio uploads. Uses `getSandbox()` getter to push files into live sandbox.

**Justified drift?** Yes. Sunder-specific feature.

**Verdict: KEEP.**

---

### DRIFT-10: Sandbox cleanup in both onError and onFinish

**Reference pattern:**
- oss-data-analyst: `onFinish: () => stop()` only
- call-summary-agent: No explicit cleanup (relies on timeout)

**What Sunder does:**
```typescript
onError: async ({ error }) => {
  if (sandboxCleanup) await sandboxCleanup();
  await recordFailedRun(error, "stream");
},
onFinish: async ({ text, steps, totalUsage }) => {
  if (sandboxCleanup) await sandboxCleanup();
  await finalizeRun({ ... });
},
```

**Justified drift?** Yes — this is strictly better. Reference repos leak sandboxes on error.

**Verdict: KEEP.**

---

## 3. Drift Summary

| # | Drift | Verdict | Effort |
|---|---|---|---|
| 1 | File preloading bypasses bash-tool | **PARTIAL FIX** — use `files` for text, keep `writeFiles` for binary | Medium |
| 2 | Custom tool description replaces auto-generated | **PARTIAL FIX** — keep wrapper (needed for lazy+sync), but use `extraInstructions` for richer description | Medium |
| 3 | readFile/writeFile discarded | **KEEP** — naming conflict with existing tools | — |
| 4 | Logging hooks not used | **FIX** — add `onBeforeBashCall` (sync, works now) | Small |
| 5 | Lazy initialization | **KEEP** — cost optimization | — |
| 6 | Golden snapshot | **KEEP** — faster boot | — |
| 7 | Artifact sync in wrapper | **KEEP** — `onAfterBashCall` is sync-only, cannot host async artifact sync | — |
| 8 | context.json | **KEEP** — pass via `files` param | Small |
| 9 | Composio file bridge | **KEEP** — Sunder-specific | — |
| 10 | Dual cleanup (onError + onFinish) | **KEEP** — strictly better | — |

---

## 4. Remediation Plan — File-by-File

### Task 1: Use bash-tool's `files` param for text files

**Files to change:**
- `src/lib/runner/tools/sandbox/build-preload-files.ts` — add a `toFilesRecord()` export that converts `SandboxPreloadFile[]` to `Record<string, string>` for text files, keeps `SandboxPreloadFile[]` for binary
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — split preload into text files (→ `files` param) and binary files (→ `sandbox.writeFiles()`)

**Reference code:**
- `call-summary-agent/lib/sandbox-context.ts` → `generateFilesForSandbox()` returns `Record<string, string>`
- `bash-tool/src/tool.ts` lines 80-120 → how `files` param is processed (batched writes of 20)

**Tests to update:**
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`
- `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`

---

### Task 2: Use bash-tool's tool directly (drop custom tool wrapper)

**Files to change:**
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — remove the custom `tool()` definition (lines 189-231). Instead, use `tools.bash` from `createBashTool` directly. Move Sunder-specific filesystem guidance into `extraInstructions`.

**Before (current):**
```typescript
// Extract execute function, wrap in custom tool()
bashExecute = bash.execute;

const bashTool = tool({
  description: "Execute a bash command...",  // hand-written
  inputSchema: z.object({ command: z.string() }),
  execute: async ({ command }) => {
    await initialize();
    const result = await bashExecute!({ command });
    const artifacts = await syncOutputArtifacts(...);
    return { ...result, artifacts };
  },
});
```

**After (aligned with references):**
```typescript
const extraInstructions = [
  "User uploads are at agent/uploads/, skill references at skills/.",
  "Write final output files to agent/home/ — only this directory persists.",
  fileSummary,
].join("\n");

const { tools, bash } = await createBashTool({
  sandbox,
  files: textFiles,
  extraInstructions,
  maxOutputLength: 100_000,
  onBeforeBashCall: ({ command }) => {
    console.log(`[sandbox] $ ${command}`);
    return undefined;
  },
  onAfterBashCall: async ({ result }) => {
    const artifacts = await syncOutputArtifacts({ sandbox, fileClient, runId, priorHashes });
    console.log(`[sandbox] exit=${result.exitCode} artifacts=${artifacts.length}`);
    return { result: { ...result, artifacts } };
  },
});

// Use tools.bash directly — auto-generated description + artifact sync via hook
```

**Reference code:**
- `call-summary-agent/lib/tools.ts` → exact `createBashTool` call pattern with hooks
- `oss-data-analyst/src/lib/tools/shell.ts` → `createSemanticBashTools` pattern
- `bash-tool/src/tools/bash.ts` → see what the auto-generated description contains

**Note:** The lazy initialization wrapper still sits on top. The change is: inside `doInitialize()`, use bash-tool's tool directly instead of extracting `.execute` and re-wrapping. The outer lazy tool stub still handles the "not yet booted" case.

**Tests to update:**
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts` — update assertions for tool description, hook behavior
- `src/lib/runner/__tests__/run-agent.test.ts` — verify bash tool registration

---

### Task 3: Add logging hooks

**Files to change:**
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — add `onBeforeBashCall` and `onAfterBashCall` to the `createBashTool` call

**Reference code (copy exactly from call-summary-agent `lib/tools.ts`):**
```typescript
onBeforeBashCall: ({ command }) => {
  log("info", "bash", `$ ${command}`);
  return undefined;
},
onAfterBashCall: ({ result }) => {
  const lines = result.stdout.split("\n");
  const preview = lines.slice(0, 8).join("\n");
  const suffix = lines.length > 8 ? `\n... (${lines.length} lines)` : "";
  log("info", "bash-output", preview + suffix);
  if (result.stderr) log("warn", "bash", result.stderr.slice(0, 500));
  if (result.exitCode !== 0) log("warn", "bash", `Exit code: ${result.exitCode}`);
  return undefined;
},
```

Adapt `log()` to `console.log("[sandbox]", ...)` / `console.warn("[sandbox]", ...)` for Langfuse capture.

**Tests to add:**
- Verify hooks fire on each bash call
- Verify hook output is logged (mock console.log/warn)

---

### Task 4: Move artifact sync into onAfterBashCall

**Files to change:**
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — move `syncOutputArtifacts` call from the custom tool execute into `onAfterBashCall`

**Reference pattern:** `onAfterBashCall` can modify the result:
```typescript
// bash-tool types.ts
onAfterBashCall?: (input: AfterBashCallInput) => AfterBashCallOutput | undefined;

interface AfterBashCallInput {
  command: string;
  result: CommandResult;
}

interface AfterBashCallOutput {
  result: CommandResult;
}
```

**Implementation:**
```typescript
onAfterBashCall: async ({ command, result }) => {
  // Logging (from Task 3)
  // ...

  // Artifact sync (Sunder-specific)
  let artifacts: SyncedArtifact[] = [];
  try {
    artifacts = await syncOutputArtifacts({ sandbox: sandbox!, fileClient, runId, priorHashes });
  } catch (error) {
    console.warn("[sandbox] Artifact sync failed (non-fatal):", error);
  }

  return { result: { ...result, artifacts } };
},
```

**BLOCKER FINDING: `onAfterBashCall` does NOT support async.**

Verified in `bash-tool/src/tools/bash.ts` line 192-197:
```typescript
if (onAfterBashCall) {
  const afterResult = onAfterBashCall({ command, result });  // NOT awaited
  if (afterResult?.result !== undefined) {
    result = afterResult.result;
  }
}
```

The callback return type is `AfterBashCallOutput | undefined` (not `Promise<...>`). The call site does NOT `await` the result. This means `syncOutputArtifacts()` (which is async — it calls `sandbox.runCommand`, `sandbox.readFileToBuffer`, and `fileClient.uploadArtifact`) **cannot run inside `onAfterBashCall`**.

**Consequence:** Task 4 is blocked. Artifact sync cannot move into the hook. The current wrapper approach (custom `tool()` that calls `bashExecute` then `syncOutputArtifacts`) is the correct architecture given bash-tool's current API.

**Alternative:** File a PR against `vercel-labs/bash-tool` to support async hooks. Until then, keep the wrapper.

**Updated approach for Task 2:** Since we must keep the wrapper for artifact sync, we can still improve alignment:
- Use bash-tool's auto-generated description via `extraInstructions` (don't re-wrap the tool description)
- Use `onBeforeBashCall` for logging (this is sync, works fine)
- Keep the outer `tool()` wrapper for lazy init + artifact sync only

**Tests to update:**
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts` — verify artifacts appear in tool result
- `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts` — no change needed (unit tests are standalone)

---

### Task 5: Pass context.json via `files` param

**Files to change:**
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — include `"input/context.json": contextJsonString` in the `files` Record passed to `createBashTool`

**Before:**
```typescript
const allFiles = [
  ...preloadFiles,
  { path: "input/context.json", content: Buffer.from(contextJson, "utf-8") },
];
await sandbox.writeFiles(allFiles.map(...));
```

**After:**
```typescript
const textFiles: Record<string, string> = {
  "input/context.json": contextJson,
  // ... other text files converted from preloadFiles
};

const { tools } = await createBashTool({
  sandbox,
  files: textFiles,
  // ...
});
```

---

## 5. Files in Reference Repos to Copy/Consult

### Must-copy patterns

| Reference file | Sunder target | What to copy |
|---|---|---|
| `call-summary-agent/lib/tools.ts` | `create-lazy-bash-tool.ts` | `createBashTool()` call with `files`, `onBeforeBashCall`, `onAfterBashCall` — copy the hook implementations verbatim |
| `oss-data-analyst/src/lib/tools/sandbox.ts` | `create-lazy-bash-tool.ts` | `Sandbox.create()` → `{ sandbox, stop }` return shape |
| `oss-data-analyst/src/lib/agent.ts` | `run-agent.ts` | Tool wiring: `bash: bashTools.bash` alongside custom tools in `streamText` |

### Must-consult (understand before changing)

| Reference file | Why |
|---|---|
| `bash-tool/src/tool.ts` | Understand full `createBashTool()` flow — what it does with `files`, how it creates tools |
| `bash-tool/src/tools/bash.ts` | Understand auto-generated description — what the LLM will see |
| `bash-tool/src/sandbox/vercel.ts` | Understand how Vercel Sandbox is wrapped — path resolution, command execution |
| `bash-tool/src/types.ts` | All interfaces — `CommandResult`, `CreateBashToolOptions`, `BashToolkit`, callback types |
| `bash-tool/src/tools-prompt.ts` | Tool discovery logic — what CLI tools are detected and how format hints work |

### Must-check (testing)

| Reference file | What to verify |
|---|---|
| `bash-tool/src/tools/bash.ts` line ~45 | Is `onAfterBashCall` awaited? (async support check for Task 4) |
| `bash-tool/src/tool.ts` line ~80 | Does `files` param accept `Buffer` values? (binary file check for Task 1) |
| `bash-tool/src/files/loader.ts` | Batch size (20) and streaming behavior — understand perf implications |

---

## 6. What We Keep (Sunder-specific, no alignment needed)

| Feature | Why it stays |
|---|---|
| **Lazy initialization** (DRIFT-5) | Cost optimization for multi-tool agent — references are single-purpose |
| **Golden snapshot** (DRIFT-6) | Production boot time optimization |
| **Artifact sync** (DRIFT-7) | User-facing file delivery — references are analysis-only |
| **context.json** (DRIFT-8) | Dynamic tool result passing — references have static input |
| **Composio file bridge** (DRIFT-9) | OAuth integration — Sunder-specific |
| **Dual cleanup** (DRIFT-10) | Strictly better error handling |
| **Discard readFile/writeFile** (DRIFT-3) | Naming conflict with Sunder's existing file tools |
| **build-preload-files.ts** | Supabase Storage download logic — references use local filesystem |
| **sync-output-artifacts.ts** | Entire module is Sunder-specific |
| **build-context-json.ts** | Entire module is Sunder-specific |

---

## 7. Execution Order

**Task 4 is BLOCKED** — `onAfterBashCall` is sync-only (verified). Artifact sync must stay in the wrapper. This cascades: Task 2 (use bash-tool's tool directly) cannot fully eliminate the wrapper.

**Revised order:**

1. **Task 3** — Add `onBeforeBashCall` logging hook (sync, no blocker). Small, standalone win.
2. **Task 1** — Split preload into text files (→ `files` param) and binary (→ `writeFiles`). Aligns with how bash-tool expects to receive files.
3. **Task 5** — Pass context.json via `files` param (depends on Task 1).
4. **Task 2 (partial)** — Keep wrapper for lazy init + artifact sync, but:
   - Move Sunder-specific filesystem guidance into `extraInstructions` so bash-tool includes it in the auto-generated description
   - Use the auto-generated description from bash-tool as a base (visible via `extraInstructions`)
   - Stop hand-writing the 3-line tool description
5. **Task 4** — Deferred. File feature request on `vercel-labs/bash-tool` for async hook support. Revisit when shipped.

**Net result after all tasks:** The wrapper stays (for lazy boot + artifact sync), but bash-tool handles file upload, description generation, and pre-call logging — matching the reference repos on everything that's possible today.
