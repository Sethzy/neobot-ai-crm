# Unified Agent Filesystem Implementation Plan

**PR:** PR 63: Unified Agent Filesystem
**Decisions:** DATA-02, DATA-09, EXEC-04
**Goal:** Route all file storage into one bucket (`agent-files`) so the agent can find everything, and adopt Tasklet's explicit sandbox persistence model.

**Architecture:** Three disconnected buckets (`chat-attachments`, `client-files`, `agent-files`) collapse into one (`agent-files`). Uploads land in `/agent/uploads/` (read-only), agent outputs in `/agent/home/`. Sandbox switches from auto-syncing `output/` to explicit persist via `/workspace/agent/home/`. A `storagePath` field in message parts + `/api/files/download` endpoint solves signed URL expiry. `sunder://` protocol gives the agent download links.

**Tech Stack:** Next.js 15, Supabase Storage, Vercel Sandbox, Vitest, Zod

**Design doc:** `docs/plans/2026-03-30-unified-agent-filesystem-design.md`

**Review corrections applied:** This tasklist incorporates 7 corrections from code review. See review notes at bottom.

---

## Important: Verify Before Implementing

This tasklist is **advisory**. Before implementing each task:
1. **Verify file paths** — grep the codebase to find exact files. Paths here may be slightly off.
2. **Match repo conventions** — use existing route helpers (`src/lib/api/route-helpers.ts`), test patterns, and component structures. Don't invent new patterns.
3. **Find the real renderer** — chat markdown uses Streamdown at `src/components/ai-elements/message.tsx`, NOT ReactMarkdown. Verify by grepping.
4. **Check schema strictness** — Zod schemas may strip unknown fields. Test whether `storagePath` survives parsing before assuming it flows through.

---

## Relevant Files

**Create:**
- `app/api/files/download/route.ts`
- `app/api/files/download/__tests__/route.test.ts`

**Modify:**
- `src/lib/storage/agent-files.ts` (assertWritable — add uploads/ check)
- `src/lib/storage/__tests__/agent-files.test.ts`
- `app/api/files/upload/route.ts` (bucket, path format, storagePath in response)
- `app/api/files/upload/__tests__/route.test.ts`
- `app/api/chat/schema.ts` (add storagePath to file part schema — **CRITICAL: without this, storagePath dies at the API boundary**)
- `app/api/chat/route.ts` (pass storagePath through when building RunnerFilePart)
- `src/lib/runner/schemas.ts` (storagePath field)
- `src/lib/chat/schemas.ts` (storagePath field)
- `src/components/chat/chat-composer.tsx` (parse storagePath from upload response)
- `src/components/chat/chat-composer.test.tsx`
- `src/lib/channels/telegram/media.ts` (bucket, path, storagePath)
- `src/lib/channels/telegram/webhook.ts` (include storagePath in runner payload at ~line 263)
- `app/api/webhook/telegram/__tests__/route.test.ts`
- `src/components/chat/preview-attachment.tsx` (storagePath resolution — renders attachment previews)
- `src/components/chat/message-bubble.tsx` (shared resolver for user AND assistant file parts)
- `src/components/ai-elements/message.tsx` (sunder:// link rewriting — this is the real markdown renderer, uses Streamdown)
- `src/lib/runner/tools/sandbox/sync-output-artifacts.ts` (OUTPUT_DIR, artifactPath)
- `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` (instructions, description, mkdir agent/home)
- `src/lib/runner/tools/sandbox/build-preload-files.ts` (storagePath fetch with URL fallback)
- `src/lib/ai/system-prompt.ts` (filesystem, tool-usage, sandbox prompt, sunder://)
- `src/lib/ai/__tests__/system-prompt.test.ts`

---

### Task 1: Upload write protection

Add `uploads/` to the read-only paths in `assertWritable()` so the agent cannot write/edit/delete user-uploaded files.

**Files:**
- Modify: `src/lib/storage/agent-files.ts` — `assertWritable()` function
- Test: `src/lib/storage/__tests__/agent-files.test.ts`

**Step 1: Write failing tests for uploads write protection**

Add tests next to the existing `assertWritable` test block:

```typescript
it("blocks writes to uploads/", () => {
  expect(() => fileClient.uploadFile("uploads/photo.png", "content"))
    .rejects.toThrow("read-only");
});

it("blocks writes to uploads/ nested paths", () => {
  expect(() => fileClient.uploadFile("uploads/2026/photo.png", "content"))
    .rejects.toThrow("read-only");
});

it("blocks edits to uploads/", () => {
  expect(() => fileClient.editFile("uploads/notes.md", "old", "new"))
    .rejects.toThrow("read-only");
});

it("blocks deletes to uploads/", () => {
  expect(() => fileClient.deleteFile("uploads/photo.png"))
    .rejects.toThrow("read-only");
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts --reporter=verbose
```

Expected: FAIL — uploads writes are currently allowed.

**Step 3: Add uploads check to assertWritable**

In `src/lib/storage/agent-files.ts`, add to `assertWritable()` after `assertRemovedDocumentsPathIsAvailable`:

```typescript
// uploads/ is read-only — only the upload API route writes here
if (segments[0] === "uploads") {
  throw new Error(`Path "${normalizedPath}" is read-only and cannot be modified by the agent.`);
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts
git commit -m "feat(pr63): add uploads/ write protection to assertWritable"
```

---

### Task 2: Upload route — change bucket, path format, add storagePath

Move uploads from `chat-attachments` to `agent-files`. Change path to `{clientId}/uploads/{timestamp}-{shortUuid}-{sanitizedFilename}`. Add `storagePath` to response. Switch from public URL to signed URL.

**Files:**
- Modify: `app/api/files/upload/route.ts`
- Test: `app/api/files/upload/__tests__/route.test.ts`

**Step 1: Write/update failing tests**

```typescript
it("uploads to agent-files bucket with uploads/ prefix", async () => {
  const response = await POST(mockRequest);
  expect(supabase.mockFrom).toHaveBeenCalledWith("agent-files");
  const uploadPath = supabase.mockUpload.mock.calls[0][0];
  expect(uploadPath).toMatch(/^client-1\/uploads\/\d+-[a-z0-9]+-/);
});

it("preserves original filename with short uuid for collision safety", async () => {
  const response = await POST(mockRequestWithFilename("deals report.csv"));
  const uploadPath = supabase.mockUpload.mock.calls[0][0];
  // Format: {clientId}/uploads/{timestamp}-{shortUuid}-{sanitized}.csv
  expect(uploadPath).toMatch(/^client-1\/uploads\/\d+-[a-z0-9]+-deals_report\.csv$/);
});

it("includes storagePath in response", async () => {
  const response = await POST(mockRequest);
  const body = await response.json();
  expect(body.storagePath).toMatch(/^uploads\/\d+-[a-z0-9]+-/);
  expect(body.url).toBeDefined();
  expect(body.pathname).toBeDefined();
  expect(body.contentType).toBeDefined();
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/files/upload --reporter=verbose
```

**Step 3: Update the upload route**

a) Change bucket constant:
```typescript
const BUCKET_ID = "agent-files";
```

b) Change path format — keep short UUID for collision safety, add original filename for browsability:
```typescript
const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
const shortUuid = crypto.randomUUID().slice(0, 8);
const storageFilename = `${Date.now()}-${shortUuid}-${sanitizedFilename}`;
const storagePath = `${clientId}/uploads/${storageFilename}`;
```

c) Switch from public URL to signed URL (replace `getPublicUrl` with `createSignedUrl`).

d) Add storagePath to response:
```typescript
return Response.json({
  url: signedData.signedUrl,
  storagePath: `uploads/${storageFilename}`,
  pathname: filename,
  contentType: fileEntry.type,
});
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/files/upload --reporter=verbose
```

**Step 5: Commit**

```bash
git add app/api/files/upload/
git commit -m "feat(pr63): route uploads to agent-files bucket with storagePath"
```

---

### Task 3: storagePath through the full transport chain

Add `storagePath` to every schema and boundary that file parts pass through. **Without this, storagePath dies at the chat API boundary and never reaches persistence or the runner.**

**Files:**
- Modify: `src/lib/runner/schemas.ts` — add storagePath to runnerFilePartSchema
- Modify: `src/lib/chat/schemas.ts` — add storagePath to filePartSchema
- Modify: `app/api/chat/schema.ts` — add storagePath to chat API file part schema (**CRITICAL**)
- Modify: `app/api/chat/route.ts` — pass storagePath when building RunnerFilePart
- Modify: `src/components/chat/chat-composer.tsx` — parse storagePath from upload response, include in toFilePart
- Test: existing schema/route tests + `src/lib/ai/__tests__/chat-route.test.ts`

**Step 1: Write failing test that storagePath survives the chat API round-trip**

In `src/lib/ai/__tests__/chat-route.test.ts` (or equivalent), add a test that sends a message with storagePath and verifies it reaches the runner:

```typescript
it("preserves storagePath in file parts through chat API", async () => {
  const response = await POST(createChatRequest({
    messages: [{
      role: "user",
      content: "analyze this",
      parts: [{
        type: "file",
        url: "https://storage.example.com/agent-files/client-1/uploads/1711792800-a3f2-deals.csv",
        mediaType: "text/csv",
        filename: "deals.csv",
        storagePath: "uploads/1711792800-a3f2-deals.csv",
      }],
    }],
  }));
  // Verify storagePath reached the runner payload
  const runAgentCall = vi.mocked(runAgent).mock.calls[0][0];
  expect(runAgentCall.fileParts[0].storagePath).toBe("uploads/1711792800-a3f2-deals.csv");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts --reporter=verbose
```

Expected: FAIL — storagePath stripped by schema or not passed through.

**Step 3: Add storagePath to all schemas**

In `src/lib/runner/schemas.ts`:
```typescript
export const runnerFilePartSchema = z.object({
  type: z.literal("file"),
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1),
  url: z.string().min(1),
  storagePath: z.string().min(1).optional(),
});
```

In `src/lib/chat/schemas.ts`:
```typescript
const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().min(1),
  url: z.string().min(1),
  filename: z.string().optional(),
  storagePath: z.string().optional(),
});
```

In `app/api/chat/schema.ts` — find the file part schema and add storagePath. **Check the exact field name and shape by reading the file first.**

In `app/api/chat/route.ts` — where RunnerFilePart is built from the chat payload (~line 60), ensure storagePath is included. **Read the file to find the exact construction site.**

In `src/components/chat/chat-composer.tsx` — update `uploadFile` response type to include `storagePath?: string`, and update `toFilePart` to pass it through.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts src/lib/runner/__tests__ src/lib/chat/__tests__ --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/runner/schemas.ts src/lib/chat/schemas.ts app/api/chat/ src/components/chat/chat-composer.tsx
git commit -m "feat(pr63): wire storagePath through full transport chain"
```

---

### Task 4: Telegram — bucket change + storagePath in webhook payload

**Both** `media.ts` (storage) and `webhook.ts` (runner payload) need updating. Without the webhook change, Telegram uploads still produce file parts without storagePath.

**Files:**
- Modify: `src/lib/channels/telegram/media.ts` — bucket + path
- Modify: `src/lib/channels/telegram/webhook.ts` — include storagePath in file part (~line 263)
- Test: `app/api/webhook/telegram/__tests__/route.test.ts`

**Step 1: Write failing test**

```typescript
it("uploads to agent-files bucket with uploads/telegram/ prefix", async () => {
  // ... trigger Telegram webhook with photo
  expect(supabase.mockFrom).toHaveBeenCalledWith("agent-files");
  const uploadPath = supabase.mockUpload.mock.calls[0][0];
  expect(uploadPath).toContain("/uploads/telegram/");
});

it("includes storagePath in runner file part", async () => {
  // ... trigger Telegram webhook with photo
  const runAgentCall = vi.mocked(runAgent).mock.calls[0][0];
  expect(runAgentCall.fileParts[0].storagePath).toMatch(/^uploads\/telegram\//);
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/webhook/telegram/__tests__/route.test.ts --reporter=verbose
```

**Step 3: Update media.ts and webhook.ts**

In `media.ts`:
- Change bucket from `"chat-attachments"` to `"agent-files"`
- Change path to include `uploads/`: `${clientId}/uploads/telegram/${timestamp}_${uniqueId}.${ext}`
- Return storagePath alongside URL from the download function

In `webhook.ts` (~line 263):
- Include `storagePath` in the file part object that gets passed to the runner

**Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/webhook/telegram/__tests__/route.test.ts --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/channels/telegram/ app/api/webhook/telegram/
git commit -m "feat(pr63): route Telegram uploads to agent-files with storagePath"
```

---

### Task 5: File download API endpoint

New endpoint that generates fresh signed URLs on demand. Solves signed URL expiry for chat history and enables `sunder://` links.

**Files:**
- Create: `app/api/files/download/route.ts`
- Create: `app/api/files/download/__tests__/route.test.ts`

**Step 1: Write failing tests**

Use existing route helper patterns from `src/lib/api/route-helpers.ts`. Key tests:

```typescript
it("returns 307 redirect with signed URL for valid path", async () => {
  const response = await GET(mockAuthenticatedRequest("?path=uploads/1711792800-deals.csv"));
  expect(response.status).toBe(307);
  expect(response.headers.get("Location")).toContain("signedUrl");
});

it("returns 400 when path is missing", async () => {
  const response = await GET(mockAuthenticatedRequest(""));
  expect(response.status).toBe(400);
});

it("returns 400 for directory traversal", async () => {
  const response = await GET(mockAuthenticatedRequest("?path=../other-client/secrets"));
  expect(response.status).toBe(400);
});

it("returns 401 when unauthenticated", async () => {
  const response = await GET(mockUnauthenticatedRequest("?path=uploads/file.csv"));
  expect(response.status).toBe(401);
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/files/download --reporter=verbose
```

**Step 3: Create the download route**

Use `normalizeWorkspacePath` for path validation (catches `..` traversal). Use existing auth patterns from other API routes in this codebase. Generate short-lived signed URL and redirect.

```typescript
export async function GET(request: NextRequest) {
  // Auth + clientId extraction (match existing route patterns)
  // Parse and validate path param
  // normalizeWorkspacePath catches traversal
  // createSignedUrl with short expiry
  // Return 307 redirect
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/files/download --reporter=verbose
```

**Step 5: Commit**

```bash
git add app/api/files/download/
git commit -m "feat(pr63): add /api/files/download endpoint for on-demand signed URLs"
```

---

### Task 6: Chat attachment rendering — shared storagePath resolver

Create one shared resolver function used by **both** user and assistant file parts. Update `preview-attachment.tsx` (renders the actual preview) and `message-bubble.tsx` (passes file data).

**Important:** `preview-attachment.tsx` renders a `<div>`, not a `<link>`. If we want attachments to be downloadable, the component may need a wrapper link or the URL needs to be resolved before passing to it. Verify by reading the component first.

**Files:**
- Modify: `src/components/chat/preview-attachment.tsx`
- Modify: `src/components/chat/message-bubble.tsx`
- Test: component test files

**Step 1: Write failing tests**

```typescript
it("resolves storagePath to download URL for user file parts", () => {
  const message = createUserMessage({
    parts: [{ type: "file", url: "https://expired.com/f.pdf", mediaType: "application/pdf", filename: "report.pdf", storagePath: "uploads/1711792800-report.pdf" }],
  });
  render(<MessageBubble message={message} />);
  // Verify the resolved URL, not the expired one
  expect(screen.getByText("report.pdf").closest("a")?.href).toContain("/api/files/download");
});

it("resolves storagePath for assistant file parts too", () => {
  const message = createAssistantMessage({
    parts: [{ type: "file", url: "https://expired.com/f.csv", mediaType: "text/csv", filename: "output.csv", storagePath: "home/output.csv" }],
  });
  render(<MessageBubble message={message} />);
  expect(screen.getByText("output.csv").closest("a")?.href).toContain("/api/files/download");
});

it("falls back to url when storagePath is missing", () => {
  const message = createUserMessage({
    parts: [{ type: "file", url: "https://old-public.com/f.pdf", mediaType: "application/pdf", filename: "legacy.pdf" }],
  });
  render(<MessageBubble message={message} />);
  expect(screen.getByText("legacy.pdf").closest("a")?.href).toContain("old-public.com");
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/chat/ --reporter=verbose
```

**Step 3: Create shared resolver and update components**

Create a resolver helper (in message-bubble.tsx or a shared util):
```typescript
function resolveFileUrl(part: { url: string; storagePath?: string }): string {
  if (part.storagePath) {
    return `/api/files/download?path=${encodeURIComponent(part.storagePath)}`;
  }
  return part.url;
}
```

Apply it to both user and assistant file rendering paths in message-bubble.tsx. Update preview-attachment.tsx if it needs a download URL prop.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/chat/ --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/components/chat/
git commit -m "feat(pr63): shared storagePath resolver for chat attachment previews"
```

---

### Task 7: sunder:// markdown link rewriting

When the agent outputs `[Report](sunder:///agent/home/report.pdf)`, rewrite to `/api/files/download?path=home/report.pdf`.

**Important:** Chat markdown is rendered by Streamdown at `src/components/ai-elements/message.tsx`, NOT ReactMarkdown. Verify by grepping: `grep -r "Streamdown\|react-markdown\|ReactMarkdown" src/components/`.

**Files:**
- Modify: `src/components/ai-elements/message.tsx` (or wherever Streamdown's link rendering is configured)
- Test: component or unit test

**Step 1: Write failing test**

```typescript
it("rewrites sunder:// links to download endpoint", () => {
  render(<ChatMessage content="Download [Report](sunder:///agent/home/q1-report.pdf)" />);
  const link = screen.getByRole("link", { name: "Report" });
  expect(link.getAttribute("href")).toBe("/api/files/download?path=home%2Fq1-report.pdf");
});

it("leaves non-sunder links unchanged", () => {
  render(<ChatMessage content="Visit [Google](https://google.com)" />);
  const link = screen.getByRole("link", { name: "Google" });
  expect(link.getAttribute("href")).toBe("https://google.com");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/ai-elements/ --reporter=verbose
```

**Step 3: Add sunder:// rewriting**

Find where links are rendered in the Streamdown/markdown component. Add a rewrite in the link handler:

```typescript
function rewriteSunderLink(href: string): string {
  if (href.startsWith("sunder:///agent/")) {
    const agentPath = href.replace("sunder:///agent/", "");
    return `/api/files/download?path=${encodeURIComponent(agentPath)}`;
  }
  return href;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/ai-elements/ --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/components/ai-elements/
git commit -m "feat(pr63): rewrite sunder:// links to download endpoint in chat"
```

---

### Task 8: Sandbox sync — OUTPUT_DIR and artifactPath

Switch sandbox artifact sync from `output/` to `agent/home/`. Change storage path from `artifacts/sandbox/{runId}/` to `home/`.

**Files:**
- Modify: `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- Test: `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`

**Step 1: Update tests for new paths**

Update the mock sandbox to use `agent/home` instead of `output`, and assert storage path is `home/` not `artifacts/sandbox/{runId}/`:

```typescript
// In mock: change "output" to "agent/home" in find command and file paths
// In assertion:
expect(fileClient.uploadArtifact).toHaveBeenCalledWith(
  expect.objectContaining({ path: "home/rental-analysis.xlsx" }),
);
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts --reporter=verbose
```

**Step 3: Update sync-output-artifacts.ts**

```typescript
// Line 13:
const OUTPUT_DIR = "/vercel/sandbox/workspace/agent/home";

// Line 97:
const artifactPath = `home/${relativePath}`;
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/runner/tools/sandbox/sync-output-artifacts.ts src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
git commit -m "feat(pr63): sync sandbox artifacts from agent/home/ to home/"
```

---

### Task 9: Sandbox instructions + agent/home/ directory creation

Update bash tool description and instructions. Create `agent/home/` directory during sandbox initialization using `mkdir -p` (not a .keep marker file — that would get synced as an artifact).

**Files:**
- Modify: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

**Step 1: Update extraInstructions**

```typescript
// Before (~line 125-129):
const extraInstructions = [
  `\nFiles preloaded in workspace:`,
  fileTree,
  `\nWrite output files to output/ — they will be synced to storage automatically.`,
].join("\n");

// After:
const extraInstructions = [
  `\nFiles preloaded in workspace:`,
  fileTree,
  `\nScratch work goes anywhere. To persist a file across sessions, save it to /workspace/agent/home/ with a descriptive name.`,
  `Only files in /workspace/agent/home/ are saved. Everything else is lost when the sandbox shuts down.`,
].join("\n");
```

**Step 2: Update tool description**

```typescript
// Before (~line 143-147):
"User files are at input/, skill references at skills/, write results to output/.",

// After:
"User files are at input/, skill references at skills/. Save results to agent/home/ to persist them.",
```

**Step 3: Add mkdir for agent/home/ during sandbox init**

In `doInitialize()`, after `sandbox.writeFiles()` (~line 114-121), add:

```typescript
// Create agent/home/ directory for persistent outputs
await sandbox.runCommand("bash", ["-c", "mkdir -p /vercel/sandbox/workspace/agent/home"]);
```

**Step 4: Run sandbox tests**

```bash
npx vitest run src/lib/runner/tools/sandbox/ --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts
git commit -m "feat(pr63): update sandbox instructions and create agent/home/ at init"
```

---

### Task 10: Sandbox preload — fetch attachments by storagePath

Update the attachment preload to use `storagePath` (server-side Supabase download) with fallback to URL fetch for legacy messages.

**Files:**
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Test: existing or new tests

**Step 1: Write failing test**

```typescript
it("fetches attachment by storagePath from Supabase instead of URL", async () => {
  const files = await buildPreloadFiles({
    supabase: mockSupabase,
    clientId: "client-1",
    fileParts: [{
      type: "file",
      url: "https://expired.com/file.csv",
      mediaType: "text/csv",
      filename: "deals.csv",
      storagePath: "uploads/1711792800-deals.csv",
    }],
  });
  expect(mockSupabase.mockDownload).toHaveBeenCalledWith("client-1/uploads/1711792800-deals.csv");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(files.find(f => f.path === "input/deals.csv")).toBeDefined();
});

it("falls back to URL fetch when storagePath is missing", async () => {
  const files = await buildPreloadFiles({
    supabase: mockSupabase,
    clientId: "client-1",
    fileParts: [{
      type: "file",
      url: "https://public-url.com/file.csv",
      mediaType: "text/csv",
      filename: "deals.csv",
    }],
  });
  expect(global.fetch).toHaveBeenCalledWith("https://public-url.com/file.csv");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/sandbox/ --reporter=verbose
```

**Step 3: Update attachment download loop**

In the `for (const part of fileParts)` loop (~line 104), add storagePath branch:

```typescript
let buffer: Buffer;

if (part.storagePath) {
  const { data } = await bucket.download(`${clientId}/${part.storagePath}`);
  if (!data) {
    console.warn(`[sandbox] Storage download failed for ${part.storagePath}`);
    continue;
  }
  buffer = Buffer.from(await data.arrayBuffer());
} else {
  const response = await fetch(part.url);
  if (!response.ok) {
    console.warn(`[sandbox] Attachment fetch failed: ${response.status}`);
    continue;
  }
  buffer = Buffer.from(await response.arrayBuffer());
}
```

Also update the `RunnerFilePart` type reference to include `storagePath?: string`.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/sandbox/ --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/runner/tools/sandbox/build-preload-files.ts src/lib/runner/tools/sandbox/__tests__/
git commit -m "feat(pr63): fetch sandbox preload attachments by storagePath with URL fallback"
```

---

### Task 11: System prompt updates

Update filesystem description, tool-usage guidance, sandbox prompt, and add sunder:// link guidance.

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Test: `src/lib/ai/__tests__/system-prompt.test.ts`

**Step 1: Write failing tests**

```typescript
it("includes uploads/ in filesystem description", () => {
  expect(SYSTEM_PROMPT).toContain("uploads/");
  expect(SYSTEM_PROMPT).toContain("Read-only: files uploaded by the user");
});

it("mentions /agent/uploads/ in tool-usage", () => {
  expect(SYSTEM_PROMPT).toContain('read_file("/agent/uploads/")');
});

it("mentions /agent/home/ for persistent files", () => {
  expect(SYSTEM_PROMPT).toContain("/agent/home/");
});

it("references agent/home/ in sandbox prompt, not output/", () => {
  expect(SANDBOX_PROMPT).toContain("agent/home/");
  expect(SANDBOX_PROMPT).not.toContain("Write output files to");
  expect(SANDBOX_PROMPT).not.toContain("output/ is where you write results");
});

it("warns about ephemeral sandbox packages", () => {
  expect(SANDBOX_PROMPT).toContain("ephemeral");
});

it("teaches sunder:// download link convention", () => {
  expect(SYSTEM_PROMPT).toContain("sunder://");
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts --reporter=verbose
```

**Step 3: Update system-prompt.ts**

Apply changes from design doc section 7:
- Replace `<filesystem>` block (add uploads/, confirm no vault)
- Add tool-usage lines for uploads browsing, home persistence, sandbox scratch guidance
- Replace sandbox `output/` references with `agent/home/` paths
- Add ephemeral packages warning
- Add sunder:// link guidance to output section

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts --reporter=verbose
```

**Step 5: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr63): update system prompt for unified filesystem and sunder:// links"
```

---

### Task 12: Cleanup — remove old bucket references

Remove remaining references to `chat-attachments`, `client-files`, `PDF_STORAGE_BUCKET` from **production code, prompts, comments, and types**. Keep intentional legacy test fixtures that prove fallback behavior (e.g., old `chat-attachments` URLs testing storagePath-missing fallback).

**Step 1: Search for remaining references**

```bash
grep -rn "chat-attachments" src/ app/ --include="*.ts" --include="*.tsx"
grep -rn "client-files" src/ app/ --include="*.ts" --include="*.tsx"
grep -rn "PDF_STORAGE_BUCKET" src/ app/ --include="*.ts" --include="*.tsx"
```

**Step 2: Categorize each hit**

For each result, decide:
- **Production code** → update to `agent-files`
- **Test fixture proving fallback** (e.g., old URL without storagePath) → keep, add comment: `// Legacy: tests fallback for pre-PR63 messages without storagePath`
- **Test fixture asserting old bucket** → update to assert `agent-files`
- **Comments/types referencing `output/`** → update (check `src/lib/runner/tools/sandbox/types.ts`)

**Step 3: Update each file**

**Step 4: Verify production code is clean**

```bash
# Production code only (exclude test files):
grep -rn "chat-attachments\|client-files\|PDF_STORAGE_BUCKET" src/ app/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v ".test."
```

Expected: zero results.

**Step 5: Also check for stale output/ references in sandbox types/comments**

```bash
grep -rn "output/" src/lib/runner/tools/sandbox/ --include="*.ts" | grep -v "__tests__" | grep -v node_modules
```

Update any remaining comments or type docs that reference `output/`.

**Step 6: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: ALL PASS.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore(pr63): clean up old bucket references, update sandbox types"
```

---

## Final Verification

```bash
# Full test suite
npx vitest run --reporter=verbose

# TypeScript compilation
npx tsc --noEmit

# Lint
npx next lint

# Production code clean of old references
grep -rn "chat-attachments\|client-files\|PDF_STORAGE_BUCKET" src/ app/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v ".test."

# Sandbox output/ references gone from production code
grep -rn '"output/"' src/lib/runner/tools/sandbox/ --include="*.ts" | grep -v __tests__
```

---

## Review Corrections Applied

This tasklist incorporates 7 corrections from code review:

1. **storagePath at chat API boundary (blocker):** Task 3 now includes `app/api/chat/schema.ts` and `app/api/chat/route.ts`. Without this, storagePath dies before reaching the runner.
2. **Telegram webhook incomplete (blocker):** Task 4 now includes `webhook.ts` alongside `media.ts`. Both the storage path AND the runner payload need updating.
3. **Attachment rendering half-right:** Task 6 creates a shared `resolveFileUrl` helper used by both user and assistant file parts. `preview-attachment.tsx` also updated.
4. **Upload filename collision safety:** Task 2 uses `{timestamp}-{shortUuid}-{originalFilename}` format. Preserves browsability while preventing collision on concurrent uploads.
5. **`.keep` file wrong:** Task 9 uses `mkdir -p` during sandbox init instead of a .keep marker that would get synced as an artifact.
6. **Tasklist paths advisory:** Header section added warning implementer to verify all paths against codebase. Real markdown renderer is Streamdown, not ReactMarkdown. Use existing route helpers.
7. **Cleanup criteria narrowed:** Task 12 preserves intentional legacy test fixtures for fallback testing. Production code + prompts + comments/types cleaned. Types like `sandbox/types.ts` included.
