# Sandbox Workspace Preload Implementation Plan

**PR:** PR 64: Sandbox workspace preload
**Decisions:** EXEC-04 (Vercel Sandbox), TASKLET-01 (default patterns)
**Goal:** Preload the full agent workspace (uploads/ + home/) into the sandbox at boot so bash can process any file the agent can see via read_file.

**Architecture:** Extract a generic recursive `downloadStorageDirectory()` helper from the existing skill-specific `downloadSkillDirectory()`. Use it for skills/, uploads/, and home/. Remove the redundant per-message attachment preload (`fileParts`). Export a `getSandbox` getter from `createLazyBashTool` for PR 65. Replace `generateFileTree` with a compact `generateFileSummary` in `extraInstructions` to keep prompt size constant.

**Tech Stack:** Vitest, Supabase Storage, Vercel Sandbox (`sandbox.mkDir()`), bash-tool

**Design doc:** `docs/plans/2026-03-30-sandbox-workspace-preload-design.md`

**Depends on:** PR 63 (unified agent filesystem) must be merged first. Uploads must be in `agent-files/{clientId}/uploads/` and the attachment preload via `fileParts` must still exist but be redundant.

---

## Relevant Files

- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Modify: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Test: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- Test: `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`

---

## Task 1: Extract generic recursive downloadStorageDirectory helper

The existing `downloadSkillDirectory()` in `build-preload-files.ts:28-68` recursively walks a Supabase Storage prefix and downloads all files. Extract this into a generic helper that works for any directory, then reuse it for skills/, uploads/, and home/.

**Files:**
- Test: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`

### Step 1: Write failing test — downloadStorageDirectory downloads recursively

```typescript
// Add to build-preload-files.test.ts. Import the new helper:
// import { downloadStorageDirectory } from "../build-preload-files";

describe("downloadStorageDirectory", () => {
  it("downloads files recursively from a storage prefix", async () => {
    const { bucket } = createMockSupabase({
      "client-1/home/report.csv": "a,b\n1,2",
      "client-1/home/scripts/clean.py": "import pandas",
      "client-1/home/scripts/utils/helpers.py": "def helper(): pass",
    });

    const result = await downloadStorageDirectory(bucket, "client-1/home", "agent/home");

    const paths = result.map((f) => f.path).sort();
    expect(paths).toEqual([
      "agent/home/report.csv",
      "agent/home/scripts/clean.py",
      "agent/home/scripts/utils/helpers.py",
    ]);
  });

  it("returns empty array when directory does not exist", async () => {
    const { bucket } = createMockSupabase({});

    const result = await downloadStorageDirectory(bucket, "client-1/nonexistent", "agent/nonexistent");

    expect(result).toEqual([]);
  });

  it("downloads files concurrently within a directory", async () => {
    const files: Record<string, string | null> = {};
    for (let i = 0; i < 10; i++) {
      files[`client-1/uploads/file-${i}.csv`] = `data-${i}`;
    }

    const downloadOrder: string[] = [];
    const bucket = createMockBucket(files);
    const originalDownload = bucket.download;
    let concurrentCount = 0;
    let maxConcurrent = 0;

    bucket.download = vi.fn(async (path: string) => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      const result = await originalDownload(path);
      downloadOrder.push(path);
      concurrentCount--;
      return result;
    });

    await downloadStorageDirectory(bucket, "client-1/uploads", "agent/uploads");

    // Promise.all means all downloads should be in-flight at once
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts -t "downloadStorageDirectory"
```

Expected: FAIL — `downloadStorageDirectory` is not exported.

### Step 3: Implement downloadStorageDirectory

In `build-preload-files.ts`, replace `downloadSkillDirectory` (lines 28-68) with a generic helper:

```typescript
/**
 * Recursively downloads all files under a Supabase Storage prefix.
 *
 * @param bucket - Supabase Storage bucket reference.
 * @param storagePrefix - Full storage path prefix (e.g., "client-1/uploads").
 * @param outputPrefix - Sandbox-relative path prefix (e.g., "agent/uploads").
 */
export async function downloadStorageDirectory(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  storagePrefix: string,
  outputPrefix: string,
): Promise<SandboxPreloadFile[]> {
  async function walk(
    currentPrefix: string,
    relativePath: string,
  ): Promise<SandboxPreloadFile[]> {
    const { data: entries } = await bucket.list(currentPrefix);
    if (!entries) return [];

    const results = await Promise.all(
      entries.map(async (entry: { name: string; id: string | null }) => {
        const fullPath = `${currentPrefix}/${entry.name}`;
        const relPath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        if (entry.id === null) {
          return walk(fullPath, relPath);
        }

        const { data } = await bucket.download(fullPath);
        if (!data) return [];

        const buffer = Buffer.from(await data.arrayBuffer());
        return [{ path: `${outputPrefix}/${relPath}`, content: buffer }];
      }),
    );

    return results.flat();
  }

  return walk(storagePrefix, "");
}
```

Update the skill download section in `buildPreloadFiles` to use the new helper:

```typescript
  // 1. Download all user skill directories
  const { data: skillDirs } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);
  if (skillDirs) {
    const slugs = skillDirs
      .filter((e: { id: string | null }) => e.id === null)
      .map((e: { name: string }) => e.name)
      .filter((name: string) => !EXCLUDED_SKILL_DIRS.has(name));

    const skillFiles = await Promise.all(
      slugs.map((slug: string) =>
        downloadStorageDirectory(bucket, `${clientId}/${SKILLS_DIRECTORY}/${slug}`, `${SKILLS_DIRECTORY}/${slug}`),
      ),
    );
    files.push(...skillFiles.flat());
  }
```

Delete the old `downloadSkillDirectory` function entirely.

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: All tests pass — both new `downloadStorageDirectory` tests and existing skill preload tests (which now use the generic helper under the hood).

### Step 5: Commit

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
git commit -m "refactor(pr64): extract generic downloadStorageDirectory helper"
```

---

## Task 2: Preload uploads/ and home/ into sandbox

**Files:**
- Test: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`

### Step 1: Write failing test — uploads/ files preloaded recursively

```typescript
it("preloads uploads/ files into agent/uploads/", async () => {
  const { client } = createMockSupabase({
    "client-1/uploads/1711792800-deals.csv": "a,b\n1,2",
    "client-1/uploads/1711793000-listing.pdf": "fake-pdf-bytes",
  });

  const result = await buildPreloadFiles({
    supabase: client as any,
    clientId: "client-1",
    fileParts: [],
  });

  const paths = result.map((f) => f.path);
  expect(paths).toContain("agent/uploads/1711792800-deals.csv");
  expect(paths).toContain("agent/uploads/1711793000-listing.pdf");
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts -t "preloads uploads"
```

Expected: FAIL — no `agent/uploads/` paths in result.

### Step 3: Write failing test — home/ files preloaded recursively (including nested)

```typescript
it("preloads home/ files recursively into agent/home/", async () => {
  const { client } = createMockSupabase({
    "client-1/home/report.csv": "x,y\n3,4",
    "client-1/home/scripts/clean.py": "import pandas",
  });

  const result = await buildPreloadFiles({
    supabase: client as any,
    clientId: "client-1",
    fileParts: [],
  });

  const paths = result.map((f) => f.path);
  expect(paths).toContain("agent/home/report.csv");
  expect(paths).toContain("agent/home/scripts/clean.py");
});
```

### Step 4: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts -t "preloads home"
```

### Step 5: Write failing test — empty directories produce no errors

```typescript
it("handles empty uploads/ and home/ gracefully", async () => {
  const { client } = createMockSupabase({});

  const result = await buildPreloadFiles({
    supabase: client as any,
    clientId: "client-1",
    fileParts: [],
  });

  expect(result).toEqual([]);
});
```

### Step 6: Implement uploads/ and home/ preload

In `buildPreloadFiles`, add after the skill download block (before the attachment loop):

```typescript
  // 2. Download all files from uploads/
  const uploadFiles = await downloadStorageDirectory(
    bucket, `${clientId}/uploads`, "agent/uploads",
  );
  files.push(...uploadFiles);

  // 3. Download all files from home/
  const homeFiles = await downloadStorageDirectory(
    bucket, `${clientId}/home`, "agent/home",
  );
  files.push(...homeFiles);
```

### Step 7: Run all tests

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
```

Expected: All pass.

### Step 8: Commit

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
git commit -m "feat(pr64): preload uploads/ and home/ into sandbox at boot"
```

---

## Task 3: Remove redundant attachment preload and fileParts parameter

**Files:**
- Test: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Modify: `src/lib/runner/run-agent.ts`

### Step 1: Write failing test — no input/ files from attachments

```typescript
it("does not produce input/ files from fileParts (attachment preload removed)", async () => {
  const { client } = createMockSupabase({
    "client-1/uploads/1711792800-deals.csv": "data",
  });

  const result = await buildPreloadFiles({
    supabase: client as any,
    clientId: "client-1",
  });

  const inputFiles = result.filter((f) => f.path.startsWith("input/"));
  expect(inputFiles).toHaveLength(0);
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts -t "does not produce input"
```

Expected: FAIL — `fileParts` is still a required parameter.

### Step 3: Remove fileParts from interface, delete attachment loop

In `build-preload-files.ts`:

**a)** Update `BuildPreloadFilesOptions` — remove `fileParts`:

```typescript
export interface BuildPreloadFilesOptions {
  supabase: SupabaseClient;
  clientId: string;
}
```

**b)** Remove `import type { RunnerFilePart }` (line 12).

**c)** Update function signature — remove `fileParts` from destructuring:

```typescript
export async function buildPreloadFiles(
  options: BuildPreloadFilesOptions,
): Promise<SandboxPreloadFile[]> {
  const { supabase, clientId } = options;
```

**d)** Delete the entire "Download chat file attachments" section (lines 101-131) — the `usedNames` set, the `for (const part of fileParts)` loop, and all related code.

### Step 4: Delete old attachment tests

Remove these tests (they test the removed feature):
- `"sanitizes attachment filenames"`
- `"renames attachment named context.json to avoid overwriting generated context"`
- `"deduplicates attachment filenames on collision"`

### Step 5: Update all remaining test calls to remove fileParts

Every `buildPreloadFiles` call in the test file that passes `fileParts: []` — remove the parameter:

```typescript
// Before:
const result = await buildPreloadFiles({
  supabase: client as any,
  clientId: "client-1",
  fileParts: [],
});

// After:
const result = await buildPreloadFiles({
  supabase: client as any,
  clientId: "client-1",
});
```

### Step 6: Update run-agent.ts call site

In `src/lib/runner/run-agent.ts`, update the `getPreloadFiles` callback (around line 328-333):

```typescript
// Before:
getPreloadFiles: () =>
  buildPreloadFiles({
    supabase,
    clientId,
    fileParts: payload.fileParts ?? [],
  }),

// After:
getPreloadFiles: () =>
  buildPreloadFiles({
    supabase,
    clientId,
  }),
```

### Step 7: Run all tests

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: All pass.

### Step 8: Verify no stale references

```bash
grep -rn "fileParts" src/lib/runner/tools/sandbox/
```

Expected: Zero hits.

### Step 9: Commit

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts src/lib/runner/run-agent.ts
git commit -m "refactor(pr64): remove redundant attachment preload, drop fileParts param"
```

---

## Task 4: Replace generateFileTree with generateFileSummary

**Files:**
- Test: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Modify: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

### Step 1: Write failing test — precise contract for generateFileSummary

```typescript
describe("generateFileSummary", () => {
  it("shows agent directories with file counts and skills by directory count", () => {
    const files: SandboxPreloadFile[] = [
      { path: "agent/uploads/deals.csv", content: Buffer.from("") },
      { path: "agent/uploads/listing.pdf", content: Buffer.from("") },
      { path: "agent/uploads/photo.jpg", content: Buffer.from("") },
      { path: "agent/home/report.xlsx", content: Buffer.from("") },
      { path: "agent/home/scripts/clean.py", content: Buffer.from("") },
      { path: "skills/re-analyst/SKILL.md", content: Buffer.from("") },
      { path: "skills/re-analyst/references/taxes.md", content: Buffer.from("") },
      { path: "skills/market-report/SKILL.md", content: Buffer.from("") },
      { path: "input/context.json", content: Buffer.from("") },
    ];
    const summary = generateFileSummary(files);
    expect(summary).toContain("agent/uploads/ (3 files)");
    expect(summary).toContain("agent/home/ (2 files)");
    expect(summary).toContain("skills/ (2 skills)");
    expect(summary).toContain("input/context.json");
    // Must NOT list individual filenames for agent/ directories
    expect(summary).not.toContain("deals.csv");
    expect(summary).not.toContain("report.xlsx");
    expect(summary).not.toContain("SKILL.md");
  });

  it("uses singular 'file' for count of 1", () => {
    const files: SandboxPreloadFile[] = [
      { path: "agent/home/report.xlsx", content: Buffer.from("") },
    ];
    const summary = generateFileSummary(files);
    expect(summary).toContain("agent/home/ (1 file)");
    expect(summary).not.toContain("1 files");
  });

  it("omits empty directories", () => {
    const files: SandboxPreloadFile[] = [
      { path: "input/context.json", content: Buffer.from("") },
    ];
    const summary = generateFileSummary(files);
    expect(summary).not.toContain("agent/uploads/");
    expect(summary).not.toContain("agent/home/");
    expect(summary).toContain("input/context.json");
  });

  it("returns '(no files)' for empty list", () => {
    expect(generateFileSummary([])).toBe("(no files)");
  });
});
```

Update import at top of test file:

```typescript
import { buildPreloadFiles, downloadStorageDirectory, generateFileTree, generateFileSummary } from "../build-preload-files";
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts -t "generateFileSummary"
```

Expected: FAIL — `generateFileSummary` not exported.

### Step 3: Implement generateFileSummary

Add to `build-preload-files.ts`:

```typescript
/**
 * Generates a compact directory summary for extraInstructions.
 *
 * Contract:
 * - agent/uploads/ (N files) — total files under agent/uploads/
 * - agent/home/ (N files) — total files under agent/home/
 * - skills/ (N skills) — count of top-level skill directories
 * - input/context.json — listed explicitly
 * - Empty directories omitted
 * - Individual filenames never listed
 */
export function generateFileSummary(files: SandboxPreloadFile[]): string {
  if (files.length === 0) return "(no files)";

  let uploadCount = 0;
  let homeCount = 0;
  const skillSlugs = new Set<string>();
  const explicitFiles: string[] = [];

  for (const file of files) {
    if (file.path.startsWith("agent/uploads/")) {
      uploadCount++;
    } else if (file.path.startsWith("agent/home/")) {
      homeCount++;
    } else if (file.path.startsWith("skills/")) {
      // Extract skill slug: skills/{slug}/...
      const slug = file.path.split("/")[1];
      if (slug) skillSlugs.add(slug);
    } else {
      // Top-level files like input/context.json
      explicitFiles.push(file.path);
    }
  }

  const lines: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (uploadCount > 0) lines.push(`  agent/uploads/ (${plural(uploadCount, "file")})`);
  if (homeCount > 0) lines.push(`  agent/home/ (${plural(homeCount, "file")})`);
  if (skillSlugs.size > 0) lines.push(`  skills/ (${plural(skillSlugs.size, "skill")})`);
  for (const f of explicitFiles.sort()) lines.push(`  ${f}`);

  return lines.join("\n");
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts -t "generateFileSummary"
```

### Step 5: Wire generateFileSummary into createLazyBashTool

In `create-lazy-bash-tool.ts`, add the import (line 15):

```typescript
import { generateFileTree, generateFileSummary } from "./build-preload-files";
```

Note: `generateFileTree` is **retained** — it's still exported from `build-preload-files.ts` and re-exported from `sandbox/index.ts`. Don't remove it. It may be used elsewhere or cleaned up in a later PR.

Replace the `extraInstructions` block (lines 124-129) to use `generateFileSummary` instead of `generateFileTree`:

```typescript
    const fileSummary = generateFileSummary(allFiles);
    const extraInstructions = [
      `\nFiles preloaded in workspace:`,
      fileSummary,
      `\nUse \`ls\` to discover individual files.`,
    ].join("\n");
```

**Do NOT change the tool description or add path guidance like `agent/home/` or `agent/uploads/` here.** PR 63 owns all model-facing path contract changes (system prompt, sandbox prompt, bash tool description). PR 64 only swaps the file listing format from full tree to compact summary.

### Step 6: Run all sandbox tests

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/
```

### Step 7: Commit

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts
git commit -m "feat(pr64): replace generateFileTree with compact generateFileSummary"
```

---

## Task 5: Ensure agent/home/ directory exists via sandbox.mkDir()

**Files:**
- Test: `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`
- Modify: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

### Step 1: Update sandbox mock to use a shared stub with mkDir

The current mock at the top of `create-lazy-bash-tool.test.ts` returns a fresh object on each `Sandbox.create()` call. We need a **shared** mock instance so tests can assert against the same object the production code uses.

Replace the entire `vi.mock("@vercel/sandbox", ...)` block at the top of the test file:

```typescript
// Shared mock sandbox — same instance returned by every Sandbox.create() call
const sharedMockSandbox = {
  sandboxId: "sbx_test",
  runCommand: vi.fn(async () => ({
    exitCode: 0,
    stdout: vi.fn(async () => ""),
    stderr: vi.fn(async () => ""),
  })),
  readFile: vi.fn(async () => null),
  readFileToBuffer: vi.fn(async () => null),
  writeFiles: vi.fn(async () => {}),
  mkDir: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
};

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn(async () => sharedMockSandbox),
  },
}));
```

Also add a `beforeEach` to reset mock call state between tests:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

### Step 2: Write failing test — mkDir called for agent/home/

```typescript
it("creates agent/home/ directory in sandbox via mkDir at boot", async () => {
  const { tool: bashTool, cleanup } = createLazyBashTool({
    snapshotId: "snap_test",
    getPreloadFiles: async () => [],
    getContextEntries: () => [],
    fileClient: {
      uploadArtifact: vi.fn(async () => ({ storagePath: "p", downloadUrl: "u" })),
    } as any,
    runId: "run-1",
  });

  // Trigger sandbox boot
  await (bashTool as any).execute({ command: "echo hi" }, {} as any);

  // Assert mkDir was called on the actual sandbox instance with agent/home path
  expect(sharedMockSandbox.mkDir).toHaveBeenCalledWith(
    expect.stringContaining("agent/home"),
  );

  await cleanup();
});
```

This works because `Sandbox.create()` returns `sharedMockSandbox`, which is the same object the production code calls `.mkDir()` on.

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts -t "creates agent/home"
```

### Step 3: Add mkDir call in doInitialize

In `create-lazy-bash-tool.ts`, add after `sandbox.writeFiles(...)` (line 121) and before creating the bash-tool instance:

```typescript
    // 2b. Ensure agent/home/ directory exists for artifact sync target
    await sandbox.mkDir(`${WORKSPACE}/agent/home`);
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

### Step 5: Commit

```bash
git add src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
git commit -m "feat(pr64): create agent/home/ dir via mkDir at sandbox boot"
```

---

## Task 6: Export getSandbox getter from createLazyBashTool

**Files:**
- Test: `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`
- Modify: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

### Step 1: Write failing test — getSandbox returns null before init

```typescript
it("getSandbox returns null before sandbox is initialized", () => {
  const { getSandbox } = createLazyBashTool({
    snapshotId: "snap_test",
    getPreloadFiles: async () => [],
    getContextEntries: () => [],
    fileClient: {} as any,
    runId: "run-1",
  });

  expect(getSandbox()).toBeNull();
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts -t "getSandbox returns null"
```

Expected: FAIL — `getSandbox` not in return value.

### Step 3: Write failing test — getSandbox returns shared sandbox after execute

```typescript
it("getSandbox returns live sandbox instance after first execute", async () => {
  const { tool: bashTool, getSandbox, cleanup } = createLazyBashTool({
    snapshotId: "snap_test",
    getPreloadFiles: async () => [],
    getContextEntries: () => [],
    fileClient: {
      uploadArtifact: vi.fn(async () => ({ storagePath: "p", downloadUrl: "u" })),
    } as any,
    runId: "run-1",
  });

  expect(getSandbox()).toBeNull();

  await (bashTool as any).execute({ command: "echo hi" }, {} as any);

  // Returns the same shared mock sandbox instance
  expect(getSandbox()).toBe(sharedMockSandbox);

  await cleanup();
});
```

### Step 4: Write failing test — getSandbox returns null after cleanup

```typescript
it("getSandbox returns null after cleanup", async () => {
  const { tool: bashTool, getSandbox, cleanup } = createLazyBashTool({
    snapshotId: "snap_test",
    getPreloadFiles: async () => [],
    getContextEntries: () => [],
    fileClient: {
      uploadArtifact: vi.fn(async () => ({ storagePath: "p", downloadUrl: "u" })),
    } as any,
    runId: "run-1",
  });

  await (bashTool as any).execute({ command: "echo hi" }, {} as any);
  expect(getSandbox()).not.toBeNull();

  await cleanup();
  expect(getSandbox()).toBeNull();
});
```

### Step 5: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts -t "getSandbox"
```

### Step 6: Add getSandbox to interface and return value

In `create-lazy-bash-tool.ts`:

**a)** Update `LazyBashToolResult` (line 43):

```typescript
export interface LazyBashToolResult {
  tool: Tool<{ command: string }, any>;
  cleanup: () => Promise<void>;
  hasInitialized: () => boolean;
  /** Returns the live Vercel Sandbox instance, or null if not yet booted. */
  getSandbox: () => Sandbox | null;
}
```

**b)** Add to return object (line 199):

```typescript
  return {
    tool: bashTool,
    cleanup,
    hasInitialized: () => initialized,
    getSandbox: () => sandbox,
  };
```

### Step 7: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```

### Step 8: Commit

```bash
git add src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
git commit -m "feat(pr64): export getSandbox getter for PR 65 composio bridge"
```

---

## Task 7: Final integration verification

### Step 1: Run all sandbox tests

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/
```

Expected: All pass.

### Step 2: Run run-agent tests

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: All pass. Update any calls that still reference `fileParts` in the preload callback.

### Step 3: Run full test suite

```bash
npx vitest run
```

Expected: All pass.

### Step 4: Verify stale references removed

```bash
grep -rn "fileParts" src/lib/runner/tools/sandbox/
grep -rn "downloadSkillDirectory" src/lib/runner/tools/sandbox/
grep -rn "generateFileTree" src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts
```

Expected:
- `fileParts` — zero hits in sandbox/
- `downloadSkillDirectory` — zero hits (replaced by `downloadStorageDirectory`)
- `generateFileTree` — zero hits in create-lazy-bash-tool.ts (replaced by `generateFileSummary`)

Note: `generateFileTree` is **intentionally retained** in `build-preload-files.ts` and re-exported from `sandbox/index.ts`. Do not delete it in this PR — it may be used by other code or cleaned up in a later pass.

### Step 5: Final commit

```bash
git add -A
git commit -m "feat(pr64): sandbox workspace preload — uploads/ + home/ preloaded at boot

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
