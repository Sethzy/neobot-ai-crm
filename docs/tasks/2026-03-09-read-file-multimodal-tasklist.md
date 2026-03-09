# read_file Multimodal Support (Phase 1: Images) Implementation Plan

**Goal:** Make Sunder's `read_file` tool handle image files natively — the agent can "see" images stored in the client workspace via Supabase Storage.

**Architecture:** Detect file type by extension → for images, download as binary blob → resize to max 1568px with `sharp` → compress to JPEG (or keep PNG if transparent) → base64-encode → return via AI SDK `toModelOutput` so the model receives an image content part. Text and directory paths remain unchanged. Negative line indices added to `applyLineRange()`.

**Tech Stack:** AI SDK v6 `tool()` with `toModelOutput`, `sharp` (image resize/compress), Supabase Storage `.download()` (returns Blob), Vitest for tests.

**Design doc:** `docs/designs/read-file-multimodal.md`

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Relevant Files

| File | Action |
|---|---|
| `package.json` | Modify: add `sharp` dependency |
| `src/lib/storage/agent-files.ts` | Modify: add `downloadBinary()` method |
| `src/lib/runner/tools/storage/index.ts` | Modify: file type detection, image branch in execute, `toModelOutput`, updated description, negative indices |
| `src/lib/runner/tools/storage/__tests__/index.test.ts` | Modify: add tests for images, negative indices, toModelOutput |

---

## Task 1: Install `sharp` dependency

**Files:**
- Modify: `package.json`

**Step 1: Install sharp**

```bash
npm install sharp
```

**Step 2: Install sharp types**

```bash
npm install -D @types/sharp
```

> `sharp` is used by Vercel internally for `next/image`. No native binary issues on Vercel.

**Step 3: Verify installation**

```bash
npx vitest run --reporter=verbose 2>&1 | head -5
```

Expected: No import errors. Tests still pass.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(read-file): add sharp dependency for image resize"
```

---

## Task 2: Add `downloadBinary()` to agent-files.ts

**Files:**
- Modify: `src/lib/storage/agent-files.ts:220-226` (add to returned object)

The existing `downloadFile()` always text-decodes. We need a parallel method that returns the raw `ArrayBuffer` for binary files (images).

**Step 1: Write the failing test**

Add this test block to the bottom of `src/lib/runner/tools/storage/__tests__/index.test.ts`, inside the existing `describe("createStorageTools", ...)` block. But first — the test needs the mock to expose `downloadBinary`. Update the hoisted mock at the top of the test file:

In `src/lib/runner/tools/storage/__tests__/index.test.ts`, update the `mockFileClient` (around line 18-24) to add:

```typescript
mockFileClient: {
  downloadFile: vi.fn(),
  downloadBinary: vi.fn(),
  listDirectory: vi.fn(),
  uploadFile: vi.fn(),
  editFile: vi.fn(),
  deleteFile: vi.fn(),
},
```

Then add a test at the bottom of the describe block:

```typescript
it("downloadBinary is available on the file client", () => {
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
  expect(tools).toBeDefined();
  expect(mockFileClient.downloadBinary).toBeDefined();
});
```

**Step 2: Run test to verify it passes (mock already has it)**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: PASS — this just verifies the mock is wired up.

**Step 3: Implement `downloadBinary()` in agent-files.ts**

In `src/lib/storage/agent-files.ts`, add this method inside `createAgentFileClient()`, after the `downloadFile()` function (after line 91):

```typescript
/**
 * Downloads a binary file from the client workspace.
 * Returns the raw ArrayBuffer and detected MIME type.
 *
 * @param path - Relative workspace file path.
 */
async function downloadBinary(path: string): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const storagePath = resolveStoragePath(clientId, path);
  const { data, error } = await supabase.storage.from(BUCKET_ID).download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download file "${path}": ${error?.message ?? "unknown error"}`);
  }

  const buffer = await (data as Blob).arrayBuffer();
  return { buffer, mimeType: (data as Blob).type || "application/octet-stream" };
}
```

Then add `downloadBinary` to the returned object (around line 220):

```typescript
return {
  downloadFile,
  downloadBinary,
  listDirectory,
  uploadFile,
  editFile,
  deleteFile,
};
```

**Step 4: Run tests to verify nothing broke**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: All existing tests PASS. The mock already has `downloadBinary` so nothing breaks.

**Step 5: Commit**

```bash
git add src/lib/storage/agent-files.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(read-file): add downloadBinary() to agent file client"
```

---

## Task 3: Add file type detection utilities

**Files:**
- Modify: `src/lib/runner/tools/storage/index.ts:1-12` (add constants and helpers at top)
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts` (add detection tests)

**Step 1: Write the failing tests for file type classification**

Add a new `describe` block at the bottom of `src/lib/runner/tools/storage/__tests__/index.test.ts` (after the closing `});` of the `createStorageTools` describe):

```typescript
/**
 * We test classifyFileType indirectly through read_file behavior.
 * These tests verify the detection logic drives the correct branch.
 */
describe("file type detection via read_file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("treats .png files as images and returns image result", async () => {
    const pngBuffer = new ArrayBuffer(8);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: pngBuffer,
      mimeType: "image/png",
    });

    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const result = await tools.read_file.execute({ path: "vault/photo.png" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/photo.png");
    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "vault/photo.png",
    });
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("mediaType");
  });

  it("treats .jpg files as images", async () => {
    const jpgBuffer = new ArrayBuffer(8);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: jpgBuffer,
      mimeType: "image/jpeg",
    });

    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const result = await tools.read_file.execute({ path: "vault/photo.jpg" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });

  it("treats .jpeg files as images", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: new ArrayBuffer(8),
      mimeType: "image/jpeg",
    });

    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const result = await tools.read_file.execute({ path: "vault/photo.jpeg" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });

  it("treats .gif files as images", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: new ArrayBuffer(8),
      mimeType: "image/gif",
    });

    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const result = await tools.read_file.execute({ path: "vault/anim.gif" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });

  it("treats .webp files as images", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: new ArrayBuffer(8),
      mimeType: "image/webp",
    });

    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const result = await tools.read_file.execute({ path: "vault/photo.webp" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });

  it("treats .md files as text (existing behavior)", async () => {
    mockFileClient.downloadFile.mockResolvedValue("# Hello");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "MEMORY.md" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("MEMORY.md");
    expect(result).toEqual({ success: true, path: "MEMORY.md", content: "# Hello" });
  });

  it("treats .pdf files as text for now (Phase 2 deferred)", async () => {
    mockFileClient.downloadFile.mockResolvedValue("%PDF-1.4 ...");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/doc.pdf" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("vault/doc.pdf");
    expect(result).toMatchObject({ success: true, path: "vault/doc.pdf" });
  });

  it("treats directory paths with trailing / as directories (unchanged)", async () => {
    mockFileClient.listDirectory.mockResolvedValue("file1.md\nfile2.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "memory/" }, EXECUTION_OPTIONS);

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toMatchObject({ success: true, path: "memory/" });
  });

  it("image extensions are case-insensitive", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: new ArrayBuffer(8),
      mimeType: "image/png",
    });

    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const result = await tools.read_file.execute({ path: "vault/PHOTO.PNG" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: FAIL — `read_file` doesn't call `downloadBinary` yet, it calls `downloadFile` for everything. Tests expecting `type: "image"` in the result will fail.

**Step 3: Add file type detection constants and helpers**

In `src/lib/runner/tools/storage/index.ts`, add these constants after the existing imports (after line 10, before `KNOWLEDGE_SEARCH_MAX_RESULTS`):

```typescript
/** Image file extensions the agent can "see" via toModelOutput. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

/**
 * Extracts the file extension from a path (lowercase).
 * Returns empty string if no extension found.
 */
function getFileExtension(path: string): string {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === path.length - 1) return "";
  return path.slice(dotIndex + 1).toLowerCase();
}

/**
 * Classifies a workspace path by its content type.
 * Used to determine the download strategy and toModelOutput behavior.
 */
function classifyFileType(path: string): "image" | "text" | "directory" {
  if (path === "" || path.endsWith("/")) return "directory";
  const ext = getFileExtension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return "text";
}
```

> Note: We classify PDFs as "text" for now. Phase 2 will add the "pdf" branch.

**Step 4: Run tests — still failing (execute not updated yet)**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: FAIL — the execute function doesn't use `classifyFileType` yet.

> This is expected. We'll wire it up in Task 4. Leave the failing tests for now — TDD means we write tests first, then make them pass.

**Step 5: Commit the test + detection utilities**

```bash
git add src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(read-file): add file type detection utilities and image tests (red)"
```

---

## Task 4: Add image resize/compress helper

**Files:**
- Modify: `src/lib/runner/tools/storage/index.ts` (add `resizeForModel()` function)

This function takes a raw `ArrayBuffer` from Supabase Storage and returns a resized, compressed base64 string ready for the model. Cap at 1568px longest side. Non-transparent images → JPEG 85%. Transparent → PNG.

**Step 1: Add the `resizeForModel()` function**

In `src/lib/runner/tools/storage/index.ts`, add this import at the top (after the existing imports, around line 5):

```typescript
import sharp from "sharp";
```

Then add this function after the `classifyFileType()` function (before `createStorageTools`):

```typescript
/** Max pixel dimension on the longest side for images sent to the model. */
const IMAGE_MAX_DIMENSION = 1568;

/**
 * Resizes and compresses an image for model consumption.
 *
 * - Caps longest side at 1568px (Anthropic's recommended max for vision).
 * - Non-transparent images → JPEG at 85% quality (smaller base64).
 * - Transparent images (alpha channel) → PNG (preserves transparency).
 *
 * @param buffer - Raw image bytes from Supabase Storage.
 * @returns Base64-encoded image string and its MIME type.
 */
async function resizeForModel(buffer: ArrayBuffer): Promise<{ data: string; mediaType: string }> {
  const input = Buffer.from(buffer);
  const metadata = await sharp(input).metadata();
  const hasAlpha = metadata.hasAlpha ?? false;

  const resized = sharp(input).resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
    fit: "inside",
    withoutEnlargement: true,
  });

  if (hasAlpha) {
    const output = await resized.png().toBuffer();
    return { data: output.toString("base64"), mediaType: "image/png" };
  }

  const output = await resized.jpeg({ quality: 85 }).toBuffer();
  return { data: output.toString("base64"), mediaType: "image/jpeg" };
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new type errors related to sharp.

**Step 3: Commit**

```bash
git add src/lib/runner/tools/storage/index.ts
git commit -m "feat(read-file): add resizeForModel() image helper"
```

---

## Task 5: Update `read_file` execute to handle images

**Files:**
- Modify: `src/lib/runner/tools/storage/index.ts:47-78` (replace `read_file` tool definition)

This is the core change. The execute function branches on file type:
- **directory** → existing `listDirectory()` path (unchanged)
- **image** → `downloadBinary()` → `resizeForModel()` → return typed result
- **text** → existing `downloadFile()` path (unchanged)

**Step 1: Update the `read_file` tool description**

In `src/lib/runner/tools/storage/index.ts`, replace the current description (line 48-49):

Old:
```typescript
    description:
      "Read file content or list a directory tree. Use directory paths (e.g. memory/) for discovery.",
```

New:
```typescript
    description:
      "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files are displayed directly. Specify optional start_line/end_line for large text files. Use negative indices to count from the end (e.g., start_line: -10, end_line: -1 reads the last 10 lines).",
```

**Step 2: Update the input schema to allow negative line indices**

Replace `readFileInputSchema` (lines 18-22):

Old:
```typescript
const readFileInputSchema = z.object({
  path: z.string().describe("Relative file or directory path in the client workspace."),
  start_line: z.number().int().min(1).optional().describe("Optional 1-indexed start line."),
  end_line: z.number().int().min(1).optional().describe("Optional 1-indexed end line (inclusive)."),
});
```

New:
```typescript
const readFileInputSchema = z.object({
  path: z.string().describe("Relative file or directory path in the client workspace."),
  start_line: z
    .number()
    .int()
    .optional()
    .describe(
      "Optional 1-indexed start line for text files. Use negative values to count from end (-1 = last line).",
    ),
  end_line: z
    .number()
    .int()
    .optional()
    .describe(
      "Optional 1-indexed end line (inclusive) for text files. Use negative values to count from end.",
    ),
});
```

**Step 3: Replace the execute function body**

Replace the entire `execute` function inside `read_file` (lines 51-77) with:

```typescript
    execute: async ({ path, start_line, end_line }) => {
      const fileType = classifyFileType(path);

      if (fileType === "directory") {
        const directoryPath = path.replace(/\/+$/, "");
        const content = await fileClient.listDirectory(directoryPath);
        return { success: true as const, type: "directory" as const, path, content };
      }

      if (fileType === "image") {
        const { buffer } = await fileClient.downloadBinary(path);
        const { data, mediaType } = await resizeForModel(buffer);
        return { success: true as const, type: "image" as const, path, data, mediaType };
      }

      // Text files (including PDFs for now — Phase 2 will add PDF branch)
      try {
        const rawContent = await fileClient.downloadFile(path);
        const slicedContent = applyLineRange(rawContent, start_line, end_line);
        return { success: true as const, type: "text" as const, path, content: slicedContent };
      } catch (fileError) {
        if (!shouldFallbackToDirectory(fileError)) {
          throw fileError;
        }

        try {
          const content = await fileClient.listDirectory(path);
          return { success: true as const, type: "directory" as const, path, content };
        } catch {
          throw fileError;
        }
      }
    },
```

> **Important:** The existing text results now include `type: "text"` and directory results include `type: "directory"`. This is needed for `toModelOutput` to branch on the result type.

**Step 4: Run image detection tests**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: The new image tests from Task 3 should now PASS. But some **existing tests will FAIL** because the result shape changed — they expect `{ success, path, content }` but now get `{ success, type, path, content }`. We'll fix those next.

**Step 5: Fix existing tests to match new result shape**

In `src/lib/runner/tools/storage/__tests__/index.test.ts`, update these existing test assertions:

1. **"read_file reads file content by default"** (around line 79):
```typescript
expect(result).toEqual({ success: true, type: "text", path: "MEMORY.md", content: "line1\nline2\nline3" });
```

2. **"read_file reads directory tree for paths ending with /"** (around line 89-93):
```typescript
expect(result).toEqual({
  success: true,
  type: "directory",
  path: "memory/",
  content: "preferences.md\npatterns.md",
});
```

3. **"read_file supports start_line and end_line slicing"** (around line 105):
```typescript
expect(result).toEqual({ success: true, type: "text", path: "MEMORY.md", content: "b\nc" });
```

4. **"read_file falls back to directory listing for bare directory paths"** (around line 126-131):
```typescript
expect(result).toEqual({
  success: true,
  type: "directory",
  path: "memory",
  content: "preferences.md\npatterns.md",
});
```

5. **"treats .md files as text" test** in the new describe block:
```typescript
expect(result).toEqual({ success: true, type: "text", path: "MEMORY.md", content: "# Hello" });
```

6. **"treats .pdf files as text for now"** test — update assertion:
```typescript
expect(result).toMatchObject({ success: true, type: "text", path: "vault/doc.pdf" });
```

**Step 6: Run all tests**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: ALL tests PASS.

**Step 7: Commit**

```bash
git add src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(read-file): add image branch to read_file execute"
```

---

## Task 6: Add `toModelOutput` to read_file

**Files:**
- Modify: `src/lib/runner/tools/storage/index.ts` (add `toModelOutput` to the `tool()` call)
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts` (add toModelOutput tests)

`toModelOutput` converts the raw execute result into AI SDK content parts that the model can consume. For images, this means returning `{ type: "media", mediaType, data }` parts. For text/directory, return `undefined` (AI SDK default JSON serialization).

**Step 1: Write failing tests for toModelOutput**

Add a new describe block in `src/lib/runner/tools/storage/__tests__/index.test.ts`:

```typescript
describe("read_file toModelOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("converts image results to media content parts", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const result = await toModelOutput({
      toolCallId: "call-1",
      input: { path: "vault/photo.png" },
      output: {
        success: true,
        type: "image",
        path: "vault/photo.png",
        data: "base64encodeddata",
        mediaType: "image/jpeg",
      },
    });

    expect(result).toEqual({
      type: "content",
      value: [
        {
          type: "media",
          mediaType: "image/jpeg",
          data: "base64encodeddata",
        },
      ],
    });
  });

  it("returns undefined for text results (default JSON serialization)", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const result = await toModelOutput({
      toolCallId: "call-2",
      input: { path: "MEMORY.md" },
      output: {
        success: true,
        type: "text",
        path: "MEMORY.md",
        content: "hello",
      },
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined for directory results", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const result = await toModelOutput({
      toolCallId: "call-3",
      input: { path: "memory/" },
      output: {
        success: true,
        type: "directory",
        path: "memory/",
        content: "file.md",
      },
    });

    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: FAIL — `tools.read_file.toModelOutput` is `undefined` because we haven't added it yet.

**Step 3: Add `toModelOutput` to the read_file tool**

In `src/lib/runner/tools/storage/index.ts`, add `toModelOutput` to the `tool()` call, right after the `execute` function's closing brace (before the tool's closing `})`):

```typescript
    toModelOutput({ output }) {
      const result = output as { type?: string; data?: string; mediaType?: string };

      if (result.type === "image") {
        return {
          type: "content" as const,
          value: [{ type: "media" as const, mediaType: result.mediaType!, data: result.data! }],
        };
      }

      // Text and directory: let AI SDK use default JSON serialization
      return undefined;
    },
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: ALL tests PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(read-file): add toModelOutput for image content parts"
```

---

## Task 7: Support negative line indices in `applyLineRange()`

**Files:**
- Modify: `src/lib/runner/tools/storage/index.ts:175-204` (rewrite `applyLineRange`)
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts` (add negative index tests)

Tasklet supports negative indices: `-1` = last line, `-10` = 10th from end. We need to update `applyLineRange()` and remove the `.min(1)` constraint from the schema.

**Step 1: Write failing tests for negative indices**

Add a new describe block in `src/lib/runner/tools/storage/__tests__/index.test.ts`:

```typescript
describe("read_file negative line indices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("start_line: -3 reads last 3 lines", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: -3 },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ content: "c\nd\ne" });
  });

  it("end_line: -1 reads up to last line", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: 2, end_line: -1 },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ content: "b\nc\nd\ne" });
  });

  it("start_line: -10, end_line: -1 reads last 10 lines", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    mockFileClient.downloadFile.mockResolvedValue(lines.join("\n"));
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: -10, end_line: -1 },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      content: "line11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20",
    });
  });

  it("start_line: -1 reads only the last line", async () => {
    mockFileClient.downloadFile.mockResolvedValue("first\nsecond\nthird");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: -1, end_line: -1 },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ content: "third" });
  });

  it("rejects start_line: 0", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "file.txt", start_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("start_line cannot be 0");
  });

  it("rejects end_line: 0", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "file.txt", end_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("end_line cannot be 0");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: FAIL — negative values are rejected by the current `.min(1)` Zod constraint and `applyLineRange()` doesn't handle negatives.

**Step 3: Rewrite `applyLineRange()` to support negatives**

In `src/lib/runner/tools/storage/index.ts`, replace the entire `applyLineRange` function (lines 175-204):

```typescript
/**
 * Applies optional line slicing to text content.
 *
 * Positive indices are 1-based (1 = first line).
 * Negative indices count from the end (-1 = last line, -2 = second-to-last).
 * Zero is invalid (there is no "line 0").
 * Range is inclusive on both ends.
 */
function applyLineRange(content: string, startLine?: number, endLine?: number): string {
  if (startLine === undefined && endLine === undefined) {
    return content;
  }

  if (startLine === 0) {
    throw new Error("start_line cannot be 0. Use 1 for the first line or -1 for the last.");
  }

  if (endLine === 0) {
    throw new Error("end_line cannot be 0. Use 1 for the first line or -1 for the last.");
  }

  const lines = content.split("\n");
  const totalLines = lines.length;

  /** Converts a 1-based or negative index to a 0-based array index. */
  const toZeroIndex = (value: number): number => {
    if (value > 0) return value - 1;
    // Negative: -1 → totalLines - 1 (last line)
    return Math.max(0, totalLines + value);
  };

  const startIndex = startLine === undefined ? 0 : toZeroIndex(startLine);
  const endIndex = endLine === undefined ? totalLines - 1 : toZeroIndex(endLine);

  return lines.slice(startIndex, endIndex + 1).join("\n");
}
```

**Step 4: Fix existing test for `start_line: 0` error message**

The existing test (around line 108-115) expects `"start_line must be >= 1"`. Update it to match the new message:

```typescript
it("read_file rejects start_line: 0", async () => {
  mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd");
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

  await expect(
    tools.read_file.execute({ path: "MEMORY.md", start_line: 0 }, EXECUTION_OPTIONS),
  ).rejects.toThrow("start_line cannot be 0");
});
```

**Step 5: Run all tests**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: ALL tests PASS.

**Step 6: Commit**

```bash
git add src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(read-file): support negative line indices in applyLineRange"
```

---

## Task 8: Run full test suite and final verification

**Files:**
- No new files

**Step 1: Run the full storage test suite**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts --reporter=verbose
```

Expected: ALL tests PASS.

**Step 2: Run the full project test suite**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: No new failures introduced by our changes.

**Step 3: Type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No type errors.

**Step 4: Final commit (squash-ready)**

```bash
git add -A
git commit -m "feat(read-file): Phase 1 — image support with toModelOutput, resize, negative indices

- Add downloadBinary() to agent-files.ts for binary file downloads
- Add file type detection (extension-based: png, jpg, jpeg, gif, webp)
- Add resizeForModel() via sharp (1568px cap, JPEG compression)
- Add toModelOutput to read_file for AI SDK media content parts
- Update description to match Tasklet wording
- Support negative line indices in applyLineRange()
- Tests for all new behavior"
```

---

## Summary of changes

After all tasks are complete, the codebase will have:

| What | Where |
|---|---|
| `sharp` dependency | `package.json` |
| `downloadBinary()` method | `src/lib/storage/agent-files.ts` |
| `IMAGE_EXTENSIONS`, `getFileExtension()`, `classifyFileType()` | `src/lib/runner/tools/storage/index.ts` |
| `resizeForModel()` (1568px cap, JPEG/PNG) | `src/lib/runner/tools/storage/index.ts` |
| Updated `read_file.execute()` with image branch | `src/lib/runner/tools/storage/index.ts` |
| `read_file.toModelOutput()` for image content parts | `src/lib/runner/tools/storage/index.ts` |
| Updated description + negative line index support | `src/lib/runner/tools/storage/index.ts` |
| ~20 new test cases | `src/lib/runner/tools/storage/__tests__/index.test.ts` |
