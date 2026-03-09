# read_file Image Support + Negative Line Indices Tasklist

**PR:** 22d

**Goal:** Extend `read_file` so it can return image files to the model while preserving the existing text and directory response shapes. Add negative `start_line` / `end_line` support with explicit validation.

**Approved scope after review:**
- Images only in this PR (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`)
- Animated GIF/WebP are first-frame-only
- `toModelOutput` uses AI SDK v6 `image-data` for images and explicit `json` for text/directory
- Existing text/directory `read_file` result shapes stay unchanged
- PDFs remain deferred to the separate document-processing track

**Non-goals:**
- No PDF support
- No result-shape churn for text or directory reads
- No `@types/sharp`
- No `git add -A`
- No intermediate red commits required by the tasklist

## Relevant Files

| File | Action |
|---|---|
| `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` | Modify: formalize PR 22d scope exception |
| `package.json` | Modify: add `sharp` dependency |
| `pnpm-lock.yaml` | Modify: lockfile update from `pnpm add sharp` |
| `src/lib/storage/agent-files.ts` | Modify: add `downloadBinary()` and shared download helper |
| `src/lib/storage/__tests__/agent-files.test.ts` | Modify: add focused `downloadBinary()` tests |
| `src/lib/runner/tools/storage/index.ts` | Modify: image branch, `resizeForModel()`, `toModelOutput`, negative line indices |
| `src/lib/runner/tools/storage/__tests__/index.test.ts` | Modify: add image-path, `toModelOutput`, and negative-index tests |

## Implementation Rules

1. Use `pnpm`, not `npm`.
2. Follow strict TDD:
   - write a failing test
   - run it and confirm the expected failure
   - implement the minimum code to pass
   - re-run the focused tests
3. Preserve the existing `{ success, path, content }` contract for text and directory reads.
4. `toModelOutput` must always return a valid AI SDK `ToolResultOutput`.
5. Stage only touched files if committing. Never use `git add -A` in this repo.

## Task 1: Add `sharp`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install sharp with pnpm**

```bash
pnpm add sharp
```

**Step 2: Verify package manager output**

Expected:
- `package.json` contains `sharp`
- `pnpm-lock.yaml` updates
- No `@types/sharp` added

**Step 3: Do not commit yet**

We keep one green commit at the end of the PR.

---

## Task 2: Add failing tests for `downloadBinary()`

**Files:**
- Modify: `src/lib/storage/__tests__/agent-files.test.ts`

**Step 1: Add a failing binary download test**

Add a test that:
- mocks Supabase Storage `download()` returning a Blob-like payload with `arrayBuffer()`
- calls `client.downloadBinary("vault/photo.png")`
- expects:
  - client-scoped path resolution
  - returned `buffer` to match the binary payload
  - returned `mimeType` to equal `"image/png"`

Use a real tiny binary payload, not a placeholder mock shape assertion.

**Step 2: Add an error-path test**

Add a test that verifies `downloadBinary()` throws the same style of read error as `downloadFile()` when Supabase returns an error.

**Step 3: Run the focused test file and confirm failure**

```bash
pnpm vitest run src/lib/storage/__tests__/agent-files.test.ts
```

Expected:
- tests fail because `downloadBinary()` does not exist yet

**Step 4: Implement the minimum production code**

In `src/lib/storage/agent-files.ts`:
- extract a tiny private helper for the shared Supabase `download()` + error handling path
- keep `downloadFile()` behavior unchanged
- add `downloadBinary(path)` that returns `{ buffer, mimeType }`
- expose `downloadBinary` from `createAgentFileClient()`

**Step 5: Re-run the focused tests**

```bash
pnpm vitest run src/lib/storage/__tests__/agent-files.test.ts
```

Expected:
- new `downloadBinary()` tests pass
- existing `agent-files` tests stay green

---

## Task 3: Add failing tests for image reads and explicit `toModelOutput`

**Files:**
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts`

**Step 1: Add test fixtures/helpers**

Add tiny valid image fixtures inline in the test file:
- 1x1 PNG base64
- 1x1 JPEG base64

Decode them to `Uint8Array` / `ArrayBuffer` in tests so `sharp` receives valid input.

**Step 2: Extend the mocked file client**

Add `downloadBinary: vi.fn()` to the hoisted `mockFileClient`.

**Step 3: Add failing image-read tests**

Add tests that verify:
- `.png` paths use `downloadBinary()` and return an image result variant
- `.PNG` extension detection is case-insensitive
- text file reads still return exactly `{ success, path, content }`
- directory reads still return exactly `{ success, path, content }`

The image result variant should include:
- `success: true`
- `path`
- `type: "image"`
- `data`
- `mediaType`

**Step 4: Add failing `toModelOutput` tests**

Add tests that verify:
- image outputs map to:

```typescript
{
  type: "content",
  value: [{ type: "image-data", data, mediaType }],
}
```

- text outputs map to:

```typescript
{
  type: "json",
  value: output,
}
```

- directory outputs map to:

```typescript
{
  type: "json",
  value: output,
}
```

**Step 5: Run the focused test file and confirm failure**

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected:
- image-read tests fail because `read_file` has no image branch
- `toModelOutput` tests fail because the tool does not define it yet

**Step 6: Implement the minimum production code**

In `src/lib/runner/tools/storage/index.ts`:
- add `sharp` import
- add image extension helpers
- add `resizeForModel()`:
  - cap longest side at `1568`
  - preserve alpha images as PNG
  - convert non-alpha images to JPEG at `quality: 85`
- update `read_file.execute()`:
  - directory: unchanged output shape
  - image: `downloadBinary()` -> `resizeForModel()` -> image result variant
  - text: unchanged output shape
  - bare directory fallback: unchanged output shape
- add `toModelOutput()`:
  - image output -> `content` with `image-data`
  - everything else -> explicit `json`

**Step 7: Re-run the focused test file**

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected:
- image-read tests pass
- `toModelOutput` tests pass
- existing storage-tool tests still pass except the upcoming negative-index coverage

---

## Task 4: Add failing tests for negative line indices

**Files:**
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts`

**Step 1: Add failing negative-index tests**

Add tests that verify:
- `start_line: -3` returns the last 3 lines
- `start_line: 2, end_line: -1` returns from line 2 through the last line
- `start_line: -1, end_line: -1` returns only the last line
- `start_line: 0` throws
- `end_line: 0` throws
- normalized `end_line < start_line` still throws after converting negative indices

**Step 2: Run the focused test file and confirm failure**

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected:
- negative-index tests fail against current `applyLineRange()` behavior

**Step 3: Implement the minimum production code**

In `src/lib/runner/tools/storage/index.ts`:
- update `readFileInputSchema` to allow negative integers
- keep `0` invalid
- normalize negative indices against total line count
- preserve explicit invalid-range validation after normalization

**Step 4: Re-run the focused test file**

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected:
- all storage tool tests pass

---

## Task 5: Full verification

**Step 1: Run both focused suites**

```bash
pnpm vitest run src/lib/storage/__tests__/agent-files.test.ts src/lib/runner/tools/storage/__tests__/index.test.ts
```

**Step 2: Type check**

```bash
pnpm exec tsc --noEmit
```

**Step 3: Run the full test suite if practical**

```bash
pnpm vitest run
```

If the full suite is too slow or unrelated failures already exist, capture that explicitly in the implementation note.

**Step 4: Commit green-only if the worktree is safe**

Only stage the touched files:

```bash
git add docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json docs/tasks/2026-03-09-read-file-multimodal-tasklist.md package.json pnpm-lock.yaml src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(pr22d): add read_file image support and negative line indices"
```

If unrelated staged-file risk remains high, stop and report instead of forcing a commit.

## Expected End State

- `read_file("vault/photo.png")` can return image data to the model
- text and directory `read_file` outputs remain contract-compatible
- `toModelOutput` is explicit and type-correct for all cases
- negative line indices work
- animated GIF/WebP are treated as first-frame-only and documented as such
