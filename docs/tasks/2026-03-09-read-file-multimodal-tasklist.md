# read_file Multimodal Support (Images + PDFs) + Negative Line Indices Tasklist

**PR:** 22d

**Goal:** Extend `read_file` so the agent can "see" images and PDFs stored in the client workspace. Add negative `start_line` / `end_line` support.

**Key discovery:** AI SDK v6 has a `file-data` content part type. Both Anthropic and Gemini support native PDF input — the model reads the raw PDF bytes directly. No rendering library needed. PDFs use the same pattern as images: `downloadBinary()` → base64 → `file-data` content part via `toModelOutput`.

**Scope:**
- Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) — resize with `sharp`, return as `image-data`
- PDFs (`.pdf`) — pass raw bytes as `file-data` with `mediaType: "application/pdf"`. No rendering. File size guard (10MB max).
- Animated GIF/WebP are first-frame-only
- `toModelOutput` uses AI SDK v6 `image-data` for images, `file-data` for PDFs, explicit `json` for text/directory
- Existing text/directory `read_file` result shapes stay unchanged
- Negative line indices for text files

**Non-goals:**
- No PDF rendering library (`pdfjs-dist`, `pdf-to-img`, etc.)
- No `pdf_start_page` / `pdf_end_page` / `pdf_format` params (model handles the full PDF natively)
- No result-shape churn for text or directory reads
- No `@types/sharp`
- No `git add -A`

## Relevant Files

| File | Action |
|---|---|
| `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` | Modify: formalize PR 22d scope exception |
| `package.json` | Modify: add `sharp` dependency |
| `pnpm-lock.yaml` | Modify: lockfile update from `pnpm add sharp` |
| `src/lib/storage/agent-files.ts` | Modify: add `downloadBinary()` and shared download helper |
| `src/lib/storage/__tests__/agent-files.test.ts` | Modify: add focused `downloadBinary()` tests |
| `src/lib/runner/tools/storage/index.ts` | Modify: image + PDF branches, `resizeForModel()`, `toModelOutput`, negative line indices |
| `src/lib/runner/tools/storage/__tests__/index.test.ts` | Modify: add image, PDF, `toModelOutput`, and negative-index tests |

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

## Task 2: `downloadBinary()` — ALREADY DONE

`downloadBinary()` is already implemented in `src/lib/storage/agent-files.ts:109` and tested in `src/lib/storage/__tests__/agent-files.test.ts:95-120`. Skip to Task 3.

---

## Task 3: Image reads + `toModelOutput`

**Files:**
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/storage/index.ts`

### Step 1: Add test fixtures and extend mock

In `src/lib/runner/tools/storage/__tests__/index.test.ts`:

Add image fixtures at the top (after imports, before the describe block). These are the smallest valid images `sharp` will accept:

```typescript
/** 1×1 red PNG (67 bytes). Valid input for sharp. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const TINY_PNG_BUFFER = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0)).buffer;

/** 1×1 white JPEG (631 bytes). Valid input for sharp. */
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM" +
  "DhEQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU" +
  "FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQ" +
  "UBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
  "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNk" +
  "ZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT" +
  "1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8" +
  "QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl" +
  "8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOU" +
  "lZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6" +
  "/9oADAMBAAIRAxEAPwD9U6KKKAPyD//Z";
const TINY_JPEG_BUFFER = Uint8Array.from(atob(TINY_JPEG_BASE64), (c) => c.charCodeAt(0)).buffer;
```

Add `downloadBinary: vi.fn()` to the hoisted `mockFileClient` (around line 18):

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

### Step 2: Add failing image-read tests

Add a new describe block at the end of the file:

```typescript
describe("read_file image support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("returns image result for .png files", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: TINY_PNG_BUFFER,
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

  it("returns image result for .jpg files", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: TINY_JPEG_BUFFER,
      mimeType: "image/jpeg",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/photo.jpg" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });

  it("handles case-insensitive extensions", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: TINY_PNG_BUFFER,
      mimeType: "image/png",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/PHOTO.PNG" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "image" });
  });

  it("preserves text result shape unchanged", async () => {
    mockFileClient.downloadFile.mockResolvedValue("# Hello");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "MEMORY.md" }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, path: "MEMORY.md", content: "# Hello" });
  });

  it("preserves directory result shape unchanged", async () => {
    mockFileClient.listDirectory.mockResolvedValue("file1.md\nfile2.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "memory/" }, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, path: "memory/", content: "file1.md\nfile2.md" });
  });
});
```

### Step 3: Add failing `toModelOutput` tests

Add another describe block:

```typescript
describe("read_file toModelOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("converts image result to image-data content part", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const imageOutput = {
      success: true,
      type: "image" as const,
      path: "vault/photo.png",
      data: "base64data",
      mediaType: "image/jpeg",
    };

    const result = await toModelOutput({
      toolCallId: "call-1",
      input: { path: "vault/photo.png" },
      output: imageOutput,
    });

    expect(result).toEqual({
      type: "content",
      value: [{ type: "image-data", data: "base64data", mediaType: "image/jpeg" }],
    });
  });

  it("returns explicit json for text results", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const textOutput = { success: true, path: "MEMORY.md", content: "hello" };

    const result = await toModelOutput({
      toolCallId: "call-2",
      input: { path: "MEMORY.md" },
      output: textOutput,
    });

    expect(result).toEqual({ type: "json", value: textOutput });
  });

  it("returns explicit json for directory results", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const dirOutput = { success: true, path: "memory/", content: "file.md" };

    const result = await toModelOutput({
      toolCallId: "call-3",
      input: { path: "memory/" },
      output: dirOutput,
    });

    expect(result).toEqual({ type: "json", value: dirOutput });
  });
});
```

### Step 4: Run and confirm failure

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: image tests fail (no image branch), toModelOutput tests fail (not defined).

### Step 5: Implement production code

In `src/lib/runner/tools/storage/index.ts`:

Add import at top:

```typescript
import sharp from "sharp";
```

Add constants and helpers after the existing imports (before `KNOWLEDGE_SEARCH_MAX_RESULTS`):

```typescript
/** Image file extensions the agent can "see" via toModelOutput. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

/** Max pixel dimension on the longest side for images sent to the model. */
const IMAGE_MAX_DIMENSION = 1568;

/**
 * Extracts the lowercase file extension from a path.
 * Returns empty string if no extension found.
 */
function getFileExtension(path: string): string {
  const dotIndex = path.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === path.length - 1) return "";
  return path.slice(dotIndex + 1).toLowerCase();
}

/**
 * Returns true if the path has an image extension we support.
 */
function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(path));
}

/**
 * Resizes and compresses an image for model consumption.
 *
 * - Caps longest side at 1568px (Anthropic recommended max for vision).
 * - Non-transparent images → JPEG at 85% quality (smaller base64).
 * - Transparent images (alpha channel) → PNG.
 * - Animated GIF/WebP → first frame only.
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

Update the `read_file` description (replace line 48-49):

```typescript
    description:
      "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files are displayed directly. Specify optional start_line/end_line for large text files. Use negative indices to count from the end (e.g., start_line: -10, end_line: -1 reads the last 10 lines).",
```

Replace the `execute` function body. **Key: text and directory result shapes stay exactly `{ success, path, content }`.**

```typescript
    execute: async ({ path, start_line, end_line }) => {
      const isDirectoryPath = path === "" || path.endsWith("/");

      if (isDirectoryPath) {
        const directoryPath = path.replace(/\/+$/, "");
        const content = await fileClient.listDirectory(directoryPath);
        return { success: true as const, path, content };
      }

      if (isImagePath(path)) {
        const { buffer } = await fileClient.downloadBinary(path);
        const { data, mediaType } = await resizeForModel(buffer);
        return { success: true as const, type: "image" as const, path, data, mediaType };
      }

      // Text files (PDF branch added in Task 4)
      try {
        const rawContent = await fileClient.downloadFile(path);
        const slicedContent = applyLineRange(rawContent, start_line, end_line);
        return { success: true as const, path, content: slicedContent };
      } catch (fileError) {
        if (!shouldFallbackToDirectory(fileError)) {
          throw fileError;
        }

        try {
          const content = await fileClient.listDirectory(path);
          return { success: true as const, path, content };
        } catch {
          throw fileError;
        }
      }
    },
```

Add `toModelOutput` right after the `execute` closing brace (before the tool's closing `})`):

```typescript
    toModelOutput({ output }) {
      const result = output as Record<string, unknown>;
      if (result.type === "image") {
        return {
          type: "content" as const,
          value: [
            {
              type: "image-data" as const,
              data: result.data as string,
              mediaType: result.mediaType as string,
            },
          ],
        };
      }
      // Text and directory: explicit JSON serialization
      return { type: "json" as const, value: output as import("@ai-sdk/provider").JSONValue };
    },
```

### Step 6: Re-run tests

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: all image and toModelOutput tests pass, existing tests pass.

---

## Task 4: PDF reads via `file-data`

**Files:**
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/storage/index.ts`

### Step 1: Add failing PDF tests

In `src/lib/runner/tools/storage/__tests__/index.test.ts`, add a new describe block after the existing `read_file toModelOutput` describe:

```typescript
describe("read_file PDF support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("returns pdf result for .pdf files", async () => {
    const pdfBuffer = new ArrayBuffer(64);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: pdfBuffer,
      mimeType: "application/pdf",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/report.pdf" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/report.pdf");
    expect(result).toMatchObject({
      success: true,
      type: "pdf",
      path: "/agent/vault/report.pdf",
      mediaType: "application/pdf",
    });
    expect(result).toHaveProperty("data");
    expect(typeof result.data).toBe("string");
  });

  it("detects .pdf extension case-insensitively", async () => {
    const pdfBuffer = new ArrayBuffer(64);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: pdfBuffer,
      mimeType: "application/pdf",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/Report.PDF" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "pdf" });
  });

  it("rejects PDFs over 10 MB", async () => {
    const oversizedBuffer = new ArrayBuffer(11 * 1024 * 1024);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: oversizedBuffer,
      mimeType: "application/pdf",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "vault/huge.pdf" }, EXECUTION_OPTIONS),
    ).rejects.toThrow("10 MB");
  });

  it("allows PDFs exactly at 10 MB", async () => {
    const exactBuffer = new ArrayBuffer(10 * 1024 * 1024);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: exactBuffer,
      mimeType: "application/pdf",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/exact.pdf" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({ success: true, type: "pdf" });
  });

  it("strips /agent/ prefix for PDF paths", async () => {
    const pdfBuffer = new ArrayBuffer(64);
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: pdfBuffer,
      mimeType: "application/pdf",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/vault/report.pdf" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/report.pdf");
    expect(result).toMatchObject({
      success: true,
      type: "pdf",
      path: "/agent/vault/report.pdf",
    });
  });
});

describe("read_file toModelOutput for PDFs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("converts pdf result to file-data content part", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);
    const toModelOutput = tools.read_file.toModelOutput!;

    const pdfOutput = {
      success: true,
      type: "pdf" as const,
      path: "/agent/vault/report.pdf",
      data: "base64pdfdata",
      mediaType: "application/pdf",
    };

    const result = await toModelOutput({
      toolCallId: "call-pdf",
      input: { path: "vault/report.pdf" },
      output: pdfOutput,
    });

    expect(result).toEqual({
      type: "content",
      value: [{ type: "file-data", data: "base64pdfdata", mediaType: "application/pdf" }],
    });
  });
});
```

### Step 2: Run and confirm failure

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: PDF tests fail (no pdf branch in `classifyFileType`, no pdf handling in execute or toModelOutput).

### Step 3: Implement production code

In `src/lib/runner/tools/storage/index.ts`:

Add constant after `IMAGE_MAX_DIMENSION`:

```typescript
const PDF_EXTENSIONS = new Set(["pdf"]);
const PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;
```

Update `classifyFileType` to include PDF:

```typescript
function classifyFileType(path: string): "directory" | "image" | "pdf" | "text" {
  if (path === "" || path.endsWith("/")) {
    return "directory";
  }

  const ext = getFileExtension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return "text";
}
```

Add the PDF branch in the `execute` function, right after the image branch:

```typescript
      if (fileType === "pdf") {
        const { buffer } = await fileClient.downloadBinary(internalPath);
        if (buffer.byteLength > PDF_MAX_SIZE_BYTES) {
          const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1);
          throw new Error(
            `PDF "${internalPath}" exceeds 10 MB size limit (${sizeMb} MB). ` +
            "Ask the user for a smaller file or a specific section.",
          );
        }
        const data = Buffer.from(buffer).toString("base64");
        return { success: true as const, path: modelPath, type: "pdf" as const, data, mediaType: "application/pdf" as const };
      }
```

Add `isPdfReadResult` type guard (after `isImageReadResult`):

```typescript
/**
 * Narrows a `read_file` output to the PDF result variant used by `toModelOutput`.
 */
function isPdfReadResult(
  value: unknown,
): value is { type: "pdf"; data: string; mediaType: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "data" in value &&
    "mediaType" in value &&
    (value as { type?: unknown }).type === "pdf" &&
    typeof (value as { data?: unknown }).data === "string" &&
    typeof (value as { mediaType?: unknown }).mediaType === "string"
  );
}
```

Update `toModelOutput` to handle PDFs (add after the image check, before the json fallback):

```typescript
    toModelOutput({ output }) {
      if (isImageReadResult(output)) {
        return {
          type: "content" as const,
          value: [{ type: "image-data" as const, data: output.data, mediaType: output.mediaType }],
        };
      }

      if (isPdfReadResult(output)) {
        return {
          type: "content" as const,
          value: [{ type: "file-data" as const, data: output.data, mediaType: output.mediaType }],
        };
      }

      return {
        type: "json" as const,
        value: output,
      };
    },
```

Update the `read_file` description to mention PDFs:

```typescript
    description:
      "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files and PDFs are displayed directly. Specify optional start_line/end_line for large text files. Use negative indices to count from the end.",
```

### Step 4: Re-run tests

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: all PDF tests pass, existing image/text/directory tests pass.

---

## Task 5: Negative line indices

**Files:**
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/storage/index.ts`

### Step 1: Add failing tests

Add a new describe block:

```typescript
describe("read_file negative line indices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("start_line: -3 returns last 3 lines", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: -3 },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ content: "c\nd\ne" });
  });

  it("start_line: 2, end_line: -1 returns line 2 through last", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: 2, end_line: -1 },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ content: "b\nc\nd\ne" });
  });

  it("start_line: -1, end_line: -1 returns only last line", async () => {
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

  it("rejects normalized end < start", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    // start_line: -1 = line 5, end_line: -3 = line 3 → invalid range
    await expect(
      tools.read_file.execute({ path: "file.txt", start_line: -1, end_line: -3 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("end_line must be >= start_line");
  });
});
```

Also update the existing `start_line: 0` test (around line 108) to expect the new error message:

```typescript
it("read_file rejects start_line: 0", async () => {
  mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd");
  const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

  await expect(
    tools.read_file.execute({ path: "MEMORY.md", start_line: 0 }, EXECUTION_OPTIONS),
  ).rejects.toThrow("start_line cannot be 0");
});
```

### Step 2: Run and confirm failure

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: negative-index tests fail (Zod `.min(1)` rejects negatives, `applyLineRange` doesn't handle them).

### Step 3: Implement production code

Update `readFileInputSchema` — remove `.min(1)` from both fields:

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

Replace the entire `applyLineRange` function:

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
    return Math.max(0, totalLines + value);
  };

  const startIndex = startLine === undefined ? 0 : toZeroIndex(startLine);
  const endIndex = endLine === undefined ? totalLines - 1 : toZeroIndex(endLine);

  if (endIndex < startIndex) {
    throw new Error("end_line must be >= start_line after resolving negative indices.");
  }

  return lines.slice(startIndex, endIndex + 1).join("\n");
}
```

### Step 4: Re-run tests

```bash
pnpm vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: all tests pass.

---

## Task 6: Update design doc

**Files:**
- Modify: `docs/designs/read-file-multimodal.md`

Update the `toModelOutput` code block to use `image-data` instead of `media`, and explicit `{ type: "json", value: output }` instead of `undefined`. This keeps the design doc accurate to what we actually built.

---

## Task 7: Full verification

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
git add docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json docs/designs/read-file-multimodal.md docs/tasks/2026-03-09-read-file-multimodal-tasklist.md package.json pnpm-lock.yaml src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(pr22d): add read_file image + PDF support and negative line indices"
```

If unrelated staged-file risk remains high, stop and report instead of forcing a commit.

## Expected End State

- `read_file("vault/photo.png")` returns image data to the model via `image-data` content part
- `read_file("vault/report.pdf")` returns raw PDF bytes to the model via `file-data` content part (no rendering library)
- PDFs over 10 MB are rejected with a clear error message
- text and directory `read_file` outputs remain contract-compatible
- `toModelOutput` is explicit and type-correct for all cases (image → `image-data`, pdf → `file-data`, text/dir → `json`)
- negative line indices work
- animated GIF/WebP are treated as first-frame-only and documented as such
