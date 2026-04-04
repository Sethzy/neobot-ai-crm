# Sandbox Preload Fixes — Parallel Artifact Sync & Download Warnings

**Goal:** Fix two issues in the sandbox preload system: artifact sync is sequential (slow with many output files) and failed file downloads are silently swallowed.

**Architecture:** Two isolated changes to existing modules. No new files, no API changes, no schema changes. Pure internal improvements with full test coverage.

**Tech Stack:** Vitest, Supabase Storage SDK, Vercel Sandbox SDK

---

## Task 1: Parallelize Artifact Sync

Currently `syncOutputArtifacts` processes files sequentially — each file is downloaded from the sandbox, hashed, and uploaded to Supabase one at a time. With 10+ output files this adds noticeable latency after every bash command.

**Key design constraints (from adversarial review):**
- Must use `Promise.allSettled` (not `Promise.all`) — one failed upload must not kill the whole batch
- Must only update `priorHashes` AFTER successful upload — otherwise a cached hash prevents retry on next sync
- Must cap concurrency at 5 — unbounded `Promise.all` holds every artifact buffer in memory at once

**Files:**
- Modify: `src/lib/runner/tools/sandbox/sync-output-artifacts.ts:64-116`
- Test: `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`

### Step 1: Write failing test — concurrent uploads

Add a test that proves uploads happen concurrently, not sequentially. This uses direct in-flight instrumentation (not wall-clock timing) to avoid brittle tests.

```typescript
// In sync-output-artifacts.test.ts, add to the describe block:

it("uploads multiple files concurrently", async () => {
  const sandbox = createMockSandbox({
    "chart-1.png": "png-data-1",
    "chart-2.png": "png-data-2",
    "chart-3.png": "png-data-3",
    "report.csv": "csv-data",
    "summary.xlsx": "xlsx-data",
  });

  let concurrentUploads = 0;
  let maxConcurrent = 0;

  const fileClient = {
    uploadArtifact: vi.fn(async ({ path }: { path: string }) => {
      concurrentUploads++;
      maxConcurrent = Math.max(maxConcurrent, concurrentUploads);
      // Simulate upload latency
      await new Promise((r) => setTimeout(r, 50));
      concurrentUploads--;
      return {
        storagePath: path,
        downloadUrl: `https://storage.example.com/${path}`,
      };
    }),
  };

  const artifacts = await syncOutputArtifacts({
    sandbox,
    fileClient,
    runId: "run-1",
    priorHashes: new Map(),
  });

  expect(artifacts).toHaveLength(5);
  // Sequential would be max 1. Parallel should be > 1.
  expect(maxConcurrent).toBeGreaterThan(1);
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts --reporter=verbose`

Expected: FAIL — `maxConcurrent` is 1 because the current `for...of` loop is sequential.

### Step 3: Write failing test — one upload failure doesn't break the batch

```typescript
it("continues syncing other files when one upload fails", async () => {
  const sandbox = createMockSandbox({
    "good-1.csv": "data-1",
    "bad.csv": "data-bad",
    "good-2.csv": "data-2",
  });

  const fileClient = {
    uploadArtifact: vi.fn(async ({ path }: { path: string }) => {
      if (path.includes("bad")) {
        throw new Error("Upload failed");
      }
      return {
        storagePath: path,
        downloadUrl: `https://storage.example.com/${path}`,
      };
    }),
  };

  const priorHashes = new Map<string, string>();
  const artifacts = await syncOutputArtifacts({
    sandbox,
    fileClient,
    runId: "run-1",
    priorHashes,
  });

  // Should return the 2 successful artifacts, not fail entirely
  expect(artifacts).toHaveLength(2);
  expect(artifacts.map((a) => a.relativePath).sort()).toEqual(["good-1.csv", "good-2.csv"]);

  // Hash for bad.csv should NOT be cached (upload failed)
  expect(priorHashes.has("bad.csv")).toBe(false);
  // Hashes for good files should be cached
  expect(priorHashes.has("good-1.csv")).toBe(true);
  expect(priorHashes.has("good-2.csv")).toBe(true);
});
```

### Step 4: Run test to verify it fails

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts --reporter=verbose`

Expected: FAIL — current `Promise.all` would reject on the first error (or the sequential loop would throw).

### Step 5: Implement parallel artifact sync with `Promise.allSettled` and concurrency cap

In `sync-output-artifacts.ts`, replace the sequential `for...of` loop (lines 83-113) with:

```typescript
  // Process files in batches of CONCURRENCY_LIMIT to bound peak memory
  const CONCURRENCY_LIMIT = 5;
  const artifacts: SyncedArtifact[] = [];

  for (let i = 0; i < filePaths.length; i += CONCURRENCY_LIMIT) {
    const batch = filePaths.slice(i, i + CONCURRENCY_LIMIT);

    const results = await Promise.allSettled(
      batch.map(async (absolutePath) => {
        const relativePath = absolutePath.replace(`${HOME_DIR}/`, "");

        const buffer = await sandbox.readFileToBuffer({ path: absolutePath });
        if (!buffer) return null;

        const hash = createHash("sha256").update(buffer).digest("hex");
        if (priorHashes.get(relativePath) === hash) return null;

        const contentType = inferContentType(relativePath);
        const artifactPath = `home/${relativePath}`;

        const { downloadUrl } = await fileClient.uploadArtifact({
          path: artifactPath,
          content: buffer,
          contentType,
          expiresInSeconds: 7 * 24 * 60 * 60,
          downloadFilename: relativePath.split("/").pop(),
        });

        // Only cache hash AFTER successful upload
        priorHashes.set(relativePath, hash);

        return {
          relativePath,
          downloadUrl,
          contentType,
          sizeBytes: buffer.length,
        } satisfies SyncedArtifact;
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        artifacts.push(result.value);
      } else if (result.status === "rejected") {
        console.warn("[sandbox] Artifact upload failed (non-fatal):", result.reason);
      }
    }
  }

  return artifacts;
```

### Step 6: Write failing test — concurrency is capped at 5

```typescript
it("caps concurrency at 5 even with many files", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 12; i++) {
    files[`file-${i}.csv`] = `data-${i}`;
  }
  const sandbox = createMockSandbox(files);

  let concurrentUploads = 0;
  let maxConcurrent = 0;

  const fileClient = {
    uploadArtifact: vi.fn(async ({ path }: { path: string }) => {
      concurrentUploads++;
      maxConcurrent = Math.max(maxConcurrent, concurrentUploads);
      await new Promise((r) => setTimeout(r, 20));
      concurrentUploads--;
      return {
        storagePath: path,
        downloadUrl: `https://storage.example.com/${path}`,
      };
    }),
  };

  const artifacts = await syncOutputArtifacts({
    sandbox,
    fileClient,
    runId: "run-1",
    priorHashes: new Map(),
  });

  expect(artifacts).toHaveLength(12);
  expect(maxConcurrent).toBeLessThanOrEqual(5);
  expect(maxConcurrent).toBeGreaterThan(1);
});
```

### Step 7: Run all sync tests to verify they pass

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts --reporter=verbose`

Expected: ALL PASS (3 existing + 3 new = 6 tests)

### Step 8: Commit

```bash
git add src/lib/runner/tools/sandbox/sync-output-artifacts.ts src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
git commit -m "perf(sandbox): parallelize artifact sync with concurrency cap

Sequential file-by-file sync added noticeable latency when skills
produced multiple output files. Now uses batched Promise.allSettled
(cap 5) for concurrent download + hash + upload. Hash is only cached
after successful upload to prevent skipping failed files on retry."
```

---

## Task 2: Log Warnings on Failed File Downloads

Currently `downloadStorageDirectory` silently returns `[]` when a file download fails. Missing skill files or uploads cause confusing agent behavior with no diagnostic trail.

**Files:**
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts:51-86`
- Test: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`

### Step 1: Write failing test — warns on download failure with error message

```typescript
// In build-preload-files.test.ts, add a new describe block:

describe("downloadStorageDirectory error handling", () => {
  it("logs a warning with error detail when a file download returns null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Bucket where one file returns null data (simulates download failure)
    const bucket = {
      list: vi.fn(async () => ({
        data: [{ name: "good.md", id: "file-id" }, { name: "broken.md", id: "file-id" }],
        error: null,
      })),
      download: vi.fn(async (path: string) => {
        if (path.includes("broken.md")) {
          return { data: null, error: { message: "Storage error" } };
        }
        const buf = Buffer.from("good content");
        return {
          data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
          error: null,
        };
      }),
    };

    const result = await downloadStorageDirectory(bucket as any, "client-1/skills/test", "skills/test");

    // Should still return the good file
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("skills/test/good.md");

    // Should have warned about the broken file with the error message
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("broken.md"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Storage error"),
    );

    warnSpy.mockRestore();
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts --reporter=verbose`

Expected: FAIL — `console.warn` is never called because the current code silently returns `[]`.

### Step 3: Implement the warning with error detail

In `build-preload-files.ts`, in the `walk` function (line 74-75), replace:

```typescript
        const { data } = await bucket.download(fullPath);
        if (!data) return [];
```

With:

```typescript
        const { data, error } = await bucket.download(fullPath);
        if (!data) {
          console.warn(`[sandbox] Failed to download file: ${fullPath} — ${error?.message ?? "unknown error"} — skipping`);
          return [];
        }
```

### Step 4: Run all preload tests to verify they pass

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts --reporter=verbose`

Expected: ALL PASS (existing tests unaffected, new test passes)

### Step 5: Commit

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
git commit -m "fix(sandbox): log warning with error detail when preload file download fails

Previously silent — missing skill files or uploads caused confusing
agent behavior with no diagnostic trail. Now logs the failed path
and error message to console.warn for observability."
```

---

## Final Verification

### Step 1: Run the full sandbox test suite

Run: `npx vitest run src/lib/runner/tools/sandbox/__tests__/ --reporter=verbose`

Expected: ALL PASS across all 4 test files.

---

## Relevant Files

| File | Action | Purpose |
|---|---|---|
| `src/lib/runner/tools/sandbox/sync-output-artifacts.ts` | Modify | Replace sequential for-loop with batched `Promise.allSettled` (cap 5) |
| `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts` | Modify | Add concurrency, error isolation, and cap tests |
| `src/lib/runner/tools/sandbox/build-preload-files.ts` | Modify | Add `console.warn` with error detail on failed download |
| `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts` | Modify | Add download failure warning test |
| `src/lib/runner/tools/sandbox/types.ts` | Read-only | Reference for `SyncedArtifact` type |

---

## Codex Review Fixes Applied

1. **`Promise.allSettled` instead of `Promise.all`** — one failed upload no longer kills the batch
2. **Hash cached only after successful upload** — failed files will be retried on next sync
3. **Concurrency capped at 5** — batched processing bounds peak memory from large artifact sets
4. **Removed brittle wall-clock timing test** — replaced with direct in-flight concurrency instrumentation
5. **Warning includes `error?.message`** — download failure log now includes the Supabase error detail
