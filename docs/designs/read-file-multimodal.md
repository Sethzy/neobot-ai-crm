# Design: read_file multimodal support (images + PDFs)

## Goal

Make Sunder's `read_file` tool handle images and PDFs natively, matching Tasklet's behavior. Today `read_file` only returns text content. After this change, the agent can "see" images and PDFs stored in the client workspace — no sandbox required.

## Tasklet behavior (reference)

Tasklet's `read_file` is a single built-in tool. No sandbox. Behavior by file type:

| File type | What happens |
|---|---|
| Text (.md, .txt, .csv, code) | Returns text content |
| Directory | Returns recursive tree listing |
| Image (.png, .jpg, .jpeg, .gif, .webp) | Returns image directly to the model (model "sees" it) |
| PDF | Default: renders each page as an image. Optional `pdf_format="text"` extracts raw text |

Tasklet params:
- `path` (required)
- `start_line`, `end_line` — for text files. Supports negative indices (-1 = last line)
- `pdf_start_page`, `pdf_end_page` — for PDFs (1-indexed, supports negative)
- `pdf_format` — `"image"` (default) or `"text"`

## Current Sunder state

**What exists:**
- `read_file` in `src/lib/runner/tools/storage/index.ts` — text files + directory listings
- `downloadFile()` in `src/lib/storage/agent-files.ts` — downloads from Supabase Storage, always decodes as text
- `start_line` / `end_line` params — positive indices only (min 1)
- Chat-level multimodal (PR 22a) — users can upload images in chat, model sees them. Separate from `read_file`.

**What's missing:**
- No file type detection in `read_file`
- No binary download path (always text-decodes)
- No `toModelOutput` on the tool (AI SDK v6 feature for returning images from tools)
- No PDF params or rendering
- No negative line indices

## Architecture

### How it works end-to-end

```
Agent calls read_file({ path: "vault/floor-plan.png" })
  ↓
1. Detect file type from extension
  ↓
2a. TEXT: existing path — downloadFile() → text → applyLineRange() → return text
2b. IMAGE: downloadBinary() → Blob → resize (cap 1568px longest side) → compress → base64 → return
2c. PDF: downloadBinary() → Blob → base64 → return (model reads raw PDF natively via file-data)
2d. DIRECTORY: existing path — listDirectory()
  ↓
3. toModelOutput() converts tool result into AI SDK content parts
  ↓
4. Model receives image-data / file-data content parts and can "see" the file
```

### Key mechanism: AI SDK `toModelOutput`

AI SDK v6 `tool()` supports a `toModelOutput` function. It transforms the raw `execute()` return value into content parts the model can consume. This is the standard way to return images from tools.

```typescript
const read_file = tool({
  description: "...",
  inputSchema: readFileInputSchema,
  execute: async ({ path, ... }) => {
    // returns { success, type: "image", data: base64, mediaType: "image/png" }
    // OR { success, type: "pdf", data: base64, mediaType: "application/pdf" }
    // OR { success, path, content: "..." } for text/directory reads
  },
  toModelOutput: ({ output }) => {
    if (output.type === "image") {
      return {
        type: "content",
        value: [{ type: "image-data", mediaType: output.mediaType, data: output.data }],
      };
    }
    if (output.type === "pdf") {
      return {
        type: "content",
        value: [{ type: "file-data", mediaType: output.mediaType, data: output.data }],
      };
    }
    return { type: "json", value: output };
  },
});
```

### Image resize and compression

Large images blow up context. Before base64-encoding, resize and compress:

- **Max resolution:** 1568px on the longest side (matches Anthropic's recommended max for vision).
- **Compression:** If the image has no alpha channel (JPEG, non-transparent PNG), convert to JPEG at ~85% quality. If it has transparency (PNG with alpha, WebP with alpha), keep as PNG.
- **Library:** `sharp` — already battle-tested for serverless Node.js (Vercel uses it internally for `next/image`). Single dependency, no native binaries needed on Vercel.

```typescript
import sharp from "sharp";

async function resizeForModel(buffer: ArrayBuffer, mimeType: string): Promise<{ data: string; mediaType: string }> {
  let pipeline = sharp(Buffer.from(buffer)).resize(1568, 1568, { fit: "inside", withoutEnlargement: true });

  const metadata = await sharp(Buffer.from(buffer)).metadata();
  const hasAlpha = metadata.hasAlpha;

  if (hasAlpha) {
    pipeline = pipeline.png();
    const output = await pipeline.toBuffer();
    return { data: output.toString("base64"), mediaType: "image/png" };
  } else {
    pipeline = pipeline.jpeg({ quality: 85 });
    const output = await pipeline.toBuffer();
    return { data: output.toString("base64"), mediaType: "image/jpeg" };
  }
}
```

### Binary download path

`agent-files.ts` currently has `downloadFile()` which always decodes to text. We need a parallel `downloadBinary()`:

```typescript
async function downloadBinary(path: string): Promise<{ blob: Blob; mimeType: string }> {
  const storagePath = resolveStoragePath(clientId, path);
  const { data, error } = await supabase.storage.from(BUCKET_ID).download(storagePath);
  // Supabase download() returns a Blob
  if (error || !data) {
    throw new Error(`Failed to download "${path}": ${error?.message ?? "unknown"}`);
  }
  return { blob: data, mimeType: data.type };
}
```

### File type detection

Simple extension-based detection. No need for magic bytes — workspace files have known extensions.

```typescript
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function classifyFileType(path: string): "image" | "pdf" | "text" | "directory" {
  if (path === "" || path.endsWith("/")) return "directory";
  const ext = getFileExtension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return "text";
}
```

## Scope (single PR — PR 22d)

**Key discovery:** AI SDK v6 has a `file-data` content part type. Both Anthropic and Gemini support native PDF input — the model reads raw PDF bytes directly. No rendering library needed. This collapsed the original Phase 2 into Phase 1.

1. **Add `downloadBinary()`** to `agent-files.ts`
2. **Add file type detection** — extension-based classification (image, pdf, text, directory)
3. **Add image resize/compress** — cap 1568px longest side, JPEG compression for non-transparent images (using `sharp`)
4. **Add PDF branch** — `downloadBinary()` → base64 → `file-data` content part. 10 MB size guard. No rendering library.
5. **Update `read_file` execute** — branch on file type, return typed result
6. **Add `toModelOutput`** — `image-data` for images, `file-data` for PDFs, explicit `json` for text/directory
7. **Update description** — mention both images and PDFs
8. **Update `applyLineRange()`** — support negative indices
9. **Tests** — unit tests for all branches, resize, binary download, toModelOutput, negative indices, PDF size guard

Description:
> "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files and PDFs are displayed directly. Specify optional start_line/end_line for large text files. Use negative indices to count from the end."

Params:
- `path` (required) — no change
- `start_line` — allows negative values (-1 = last line)
- `end_line` — allows negative values

**Non-goals (intentionally deferred or dropped):**
- No PDF rendering library (`pdfjs-dist`, etc.) — models handle raw PDF bytes natively
- No `pdf_start_page` / `pdf_end_page` / `pdf_format` params — not needed when model reads the full PDF
- No page cap — the 10 MB file size guard is sufficient

## Files changed

| File | Change |
|---|---|
| `package.json` | Add `sharp` dependency (image resize/compression) |
| `src/lib/storage/agent-files.ts` | Add `downloadBinary()` method |
| `src/lib/runner/tools/storage/index.ts` | Update `read_file`: file type detection, image + PDF branches, resize/compress, `toModelOutput`, negative indices |
| `src/lib/runner/tools/storage/__tests__/` | Tests for image, PDF, toModelOutput, negative indices |

## Resolved questions (from Tasklet dev review)

1. **Image size limits** — Yes: cap at **1568px longest side**. Compress non-transparent images to JPEG. ✅ Done.
2. **Base64 vs URL** — Base64 data (via `toModelOutput` image-data/file-data parts). ✅ Done.
3. **MIME type source** — Extension-based detection is fine. No magic bytes needed. ✅ Done.
4. **PDF library** — **Not needed.** AI SDK v6 `file-data` content part lets models read raw PDF bytes natively. Both Anthropic and Gemini support it. No rendering library required. ✅ Resolved.
5. **PDF page limit** — **Replaced by 10 MB file size guard.** Since the model reads the full PDF natively, page-level params aren't needed. ✅ Resolved.
6. **Unsupported binary files** — Falls back to text decode (garbled for true binary). Can add explicit error for known binary extensions later.

## Constraints

- **Supabase Storage** — Files are in a remote bucket, not a local filesystem. Every read is a network call.
- **Serverless** — Runs in Vercel Functions. No persistent filesystem. Image resize uses `sharp` (works on Vercel). PDF needs no server-side processing.
- **Context window** — Images mitigated by resize cap (1568px) + JPEG compression (~100-300KB base64). PDFs mitigated by 10 MB file size guard.
- **AI SDK v6** — We're on `ai@^6.0.111`. `toModelOutput` is stable (not experimental). `file-data` content part is supported by Anthropic and Google providers.
- **Directory detection** — Supabase Storage (S3-backed) has no real directories. Sunder already handles this via `shouldFallbackToDirectory` + `listDirectory()` in the existing `read_file` flow — no changes needed.
