# Google Workspace + Chat Uploads + Connection Cards Implementation Plan

**PR:** PR 62: Google workspace + chat upload expansion + connection UI cards
**Decisions:** CONN-02
**Goal:** Enable Google workspace via Composio (no custom code), widen chat uploads to all common file types with model-visible filtering, and add rich inline connection cards replacing generic tool approval pills.

**Architecture:** Google workspace uses existing Composio connections infrastructure (PRs 27-28) — no custom integration code. Chat uploads widen the accept filter and add a model-visible allowlist in the runner to prevent Gemini from receiving unsupported MIME types. Connection cards are special-cased at the `StepsSummary`/`MessageBubble` level (not hidden inside collapsed `ToolCallInline`) and render from tool input (not output) so they're visible during the approval lifecycle.

**Tech Stack:** Next.js 15, React 19, Vercel AI SDK v6, Supabase Realtime, ShadCN UI, Tailwind 4, Vitest, @composio/core

**Design Doc:** `docs/plans/2026-03-30-connection-ui-cards-design.md`

**Prerequisites:** PR 60 (vault teardown) and PR 61 (Composio limit fix) must be merged first. Rebase onto completed 60/61 work before starting. Do NOT fold prerequisites into this branch.

**Commit strategy:** Single `feat(pr62): Google workspace + chat upload expansion + connection cards` commit after the full TDD cycle is green.

---

## Review corrections applied

These corrections were identified during review and are reflected in the tasks below:

1. **Runner wiring** — sandbox-only file notice is a separate text part (not combined with user input) using generic "/input/" paths (not invented filenames, since `buildPreloadFiles` sanitizes names).
2. **PermissionCard lifecycle** — renders from tool `input` at approval-requested time, not from `output` after execution. Shows tool slugs from input args. No client-side metadata fetch.
3. **Cards outside StepsSummary** — connection/approval tool parts special-cased at `StepsSummary` or `MessageBubble` level so they render inline without expanding the collapsed step summary.
4. **Public bucket stays** — v1 keeps the public `chat-attachments` bucket. Private/signed delivery is a future concern.
5. **Shared config module** — `src/lib/chat/attachment-config.ts` exports MIME types, accept string, size limit, and model-visible set. Route, composer, runner, and tests import from it.
6. **Multi-file upload already done** — `chat-composer.tsx` already has `multiple` and loops uploads. No task needed.
7. **Test paths** — tests live beside components (e.g., `src/components/chat/preview-attachment.test.tsx`), not in `__tests__/` subdirectories.

---

## Relevant Files

**Create:**
- `src/lib/chat/attachment-config.ts` — shared upload config (MIME types, accept string, size limit, model-visible set)

**Modify (production code):**
- `src/lib/runner/run-agent.ts:~215` — model-visible file filter + sandbox notice
- `app/api/files/upload/route.ts:14-20,38` — import from shared config
- `src/components/chat/chat-composer.tsx:54` — import from shared config
- `src/components/chat/preview-attachment.tsx` — file type labels
- `src/components/chat/tool-call-inline.tsx` — ConnectionCard, ConnectionModal, PermissionCard components
- `src/components/chat/steps-summary.tsx` — surface connection/approval tool parts inline
- `src/lib/runner/tools/connections/create-connection.ts:~117` — enrich result with display metadata
- `src/lib/composio/catalog.ts` — add `getToolkitDisplayInfo()` for display names
- `src/lib/ai/system-prompt.ts` — add Google Workspace guidance

**Modify (tests):**
- `src/lib/runner/run-agent.test.ts` or equivalent — model-visible filter tests
- `app/api/files/upload/route.test.ts` — new MIME types + size limit
- `src/components/chat/preview-attachment.test.tsx` — file type labels
- `src/components/chat/tool-call-inline.test.tsx` — connection card tests

---

### Task 1: Create shared attachment config

**Files:**
- Create: `src/lib/chat/attachment-config.ts`

**Step 1: Create the module**

```typescript
/**
 * Shared chat attachment configuration.
 * Imported by upload route, chat composer, runner, and tests.
 * @module lib/chat/attachment-config
 */

/** MIME types accepted for chat file uploads. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  // Images (Gemini native)
  "image/jpeg",
  "image/png",
  "image/webp",
  // Documents (Gemini native PDF, sandbox for others)
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-powerpoint", // .ppt
  // Spreadsheets (sandbox processing)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
  // Text (Gemini native)
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/json",
]);

/** HTML accept attribute for the file input. Includes MIME types + extensions for browser compat. */
export const CHAT_ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  ".docx,.doc,.pptx,.ppt",
  ".xlsx,.xls,.csv",
  ".txt,.md,.html,.xml,.json",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
].join(",");

/** Max upload size in bytes. */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * MIME types Gemini can process directly as file content parts.
 * Everything else is sandbox-only (preloaded to /input/ for bash processing).
 */
export const MODEL_VISIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Returns true if the MIME type can be sent directly to the model. */
export function isModelVisible(mediaType: string): boolean {
  return MODEL_VISIBLE_TYPES.has(mediaType);
}
```

**Step 2: Commit checkpoint (optional — can defer to final commit)**

---

### Task 2: Model-visible file filter in the runner

This is the **critical prerequisite**. Without this, uploading DOCX/PPTX will crash chat with Gemini `unsupported-media` errors.

**Files:**
- Modify: `src/lib/runner/run-agent.ts:~215`
- Test: `src/lib/runner/run-agent.test.ts` (or equivalent test file)

**Step 1: Write failing tests for file part splitting**

Find the runner test file. Add tests for the filter behavior:

```typescript
import { isModelVisible } from "@/lib/chat/attachment-config";

describe("model-visible file filtering", () => {
  it("marks images and PDF as model-visible", () => {
    expect(isModelVisible("image/jpeg")).toBe(true);
    expect(isModelVisible("image/png")).toBe(true);
    expect(isModelVisible("image/webp")).toBe(true);
    expect(isModelVisible("application/pdf")).toBe(true);
  });

  it("marks Office formats as not model-visible", () => {
    expect(isModelVisible("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(isModelVisible("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false);
    expect(isModelVisible("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(false);
  });

  it("marks text formats as not model-visible", () => {
    expect(isModelVisible("text/plain")).toBe(false);
    expect(isModelVisible("text/csv")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they pass** (these test the config module, should pass immediately)

```bash
npx vitest run src/lib/runner/run-agent.test.ts -t "model-visible" --reporter=verbose
```

**Step 3: Wire filter into the runner**

In `src/lib/runner/run-agent.ts`, update the `userMessageParts` assembly (~line 215):

```typescript
import { isModelVisible } from "@/lib/chat/attachment-config";

// Replace the current userMessageParts assembly:
const allFileParts = payload.fileParts ?? [];
const modelParts = allFileParts.filter((p) => isModelVisible(p.mediaType));
const sandboxOnlyParts = allFileParts.filter((p) => !isModelVisible(p.mediaType));

const userMessageParts = [
  ...modelParts,
  ...(sandboxOnlyParts.length > 0
    ? [{ type: "text" as const, text: "[User uploaded files are available in the sandbox at /input/. Use bash to list and process them.]" }]
    : []),
  ...(input.length > 0 ? [{ type: "text" as const, text: input }] : []),
];
```

Key points:
- Sandbox notice is a **separate** text part (not combined with user input)
- Generic `/input/` path (not invented filenames — `buildPreloadFiles` sanitizes names)
- User text remains its own text part to preserve the `assembleContext()` contract

**Step 4: Run runner tests**

```bash
npx vitest run src/lib/runner/run-agent.test.ts --reporter=verbose
```

Expected: All tests pass.

---

### Task 3: Update upload route + composer to use shared config

**Files:**
- Modify: `app/api/files/upload/route.ts:14-20,38`
- Modify: `src/components/chat/chat-composer.tsx:54`
- Test: `app/api/files/upload/route.test.ts`

**Step 1: Write failing tests for new MIME types**

In `app/api/files/upload/route.test.ts`:

```typescript
it("accepts PDF uploads", async () => {
  const file = new File(["pdf content"], "report.pdf", { type: "application/pdf" });
  // ... POST to route, expect 200
});

it("accepts DOCX uploads", async () => {
  const file = new File(["docx"], "report.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  // ... POST to route, expect 200
});

it("accepts files up to 10MB", async () => {
  const content = new Uint8Array(9 * 1024 * 1024);
  const file = new File([content], "large.pdf", { type: "application/pdf" });
  // ... POST to route, expect 200
});

it("rejects files over 10MB", async () => {
  const content = new Uint8Array(11 * 1024 * 1024);
  const file = new File([content], "huge.pdf", { type: "application/pdf" });
  // ... POST to route, expect 400
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/files/upload/route.test.ts --reporter=verbose
```

**Step 3: Update upload route to import from shared config**

In `app/api/files/upload/route.ts`:

```typescript
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_SIZE_BYTES } from "@/lib/chat/attachment-config";

// Remove the inline ALLOWED_UPLOAD_TYPES set (lines 14-20)
// Update size check (line 38):
.refine((file) => file.size <= MAX_UPLOAD_SIZE_BYTES, {
  message: "File size should be less than 10MB",
})
```

**Step 4: Update composer to import from shared config**

In `src/components/chat/chat-composer.tsx`:

```typescript
import { CHAT_ATTACHMENT_ACCEPT } from "@/lib/chat/attachment-config";

// Remove the inline CHAT_ATTACHMENT_ACCEPT string (lines 54-55)
```

**Step 5: Run tests**

```bash
npx vitest run app/api/files/upload/route.test.ts --reporter=verbose
```

Expected: All tests PASS.

---

### Task 4: Update PreviewAttachment with file type labels

**Files:**
- Modify: `src/components/chat/preview-attachment.tsx`
- Test: `src/components/chat/preview-attachment.test.tsx`

**Step 1: Write failing tests**

In `src/components/chat/preview-attachment.test.tsx`:

```typescript
it("shows PDF label for PDF files", () => {
  render(<PreviewAttachment attachment={{ filename: "report.pdf", url: "https://example.com/report.pdf", contentType: "application/pdf" }} />);
  expect(screen.getByText("PDF")).toBeInTheDocument();
});

it("shows Word label for DOCX files", () => {
  render(<PreviewAttachment attachment={{ filename: "doc.docx", url: "https://example.com/doc.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }} />);
  expect(screen.getByText("Word")).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/chat/preview-attachment.test.tsx --reporter=verbose
```

**Step 3: Add file type label helper**

In `src/components/chat/preview-attachment.tsx`:

```typescript
function getFileTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.includes("wordprocessingml") || contentType === "application/msword") return "Word";
  if (contentType.includes("spreadsheetml") || contentType === "application/vnd.ms-excel") return "Excel";
  if (contentType.includes("presentationml") || contentType === "application/vnd.ms-powerpoint") return "Slides";
  if (contentType === "text/csv") return "CSV";
  if (contentType.startsWith("text/")) return "Text";
  if (contentType === "application/json") return "JSON";
  return "File";
}
```

Use `getFileTypeLabel(contentType)` in the non-image rendering branch instead of hardcoded "File".

**Step 4: Run tests**

```bash
npx vitest run src/components/chat/preview-attachment.test.tsx --reporter=verbose
```

Expected: PASS.

---

### Task 5: ConnectionCard + ConnectionModal components

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Modify: `src/components/chat/steps-summary.tsx`
- Test: `src/components/chat/tool-call-inline.test.tsx`

**Step 1: Write failing test for ConnectionCard detection**

In `src/components/chat/tool-call-inline.test.tsx`:

```typescript
it("renders ConnectionCard for create_new_connections tool", () => {
  render(
    <ToolCallInline
      name="create_new_connections"
      state="result"
      input={{
        integrations: [{ integrationId: "googledrive" }],
      }}
      output={{
        success: true,
        results: [{
          integrationId: "googledrive",
          displayName: "Google Drive",
          description: "Access files in Google Drive",
          connectionStatus: "pending_auth",
          redirectUrl: "https://auth.composio.dev/...",
          composioConnectedAccountId: "acc-123",
        }],
      }}
    />,
  );
  expect(screen.getByText("Create new connection?")).toBeInTheDocument();
  expect(screen.getByText("Google Drive")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx -t "ConnectionCard" --reporter=verbose
```

**Step 3: Build detection function + ConnectionCard**

In `tool-call-inline.tsx`, following the `isPdfDownload` pattern:

```typescript
interface ConnectionResult {
  integrationId: string;
  displayName: string;
  description: string;
  connectionStatus: string;
  redirectUrl: string;
  composioConnectedAccountId: string;
}

function isConnectionCreation(
  toolName: string,
  output: unknown,
): output is { success: true; results: ConnectionResult[] } {
  return (
    toolName === "create_new_connections" &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).success === true &&
    Array.isArray((output as Record<string, unknown>).results)
  );
}
```

Build `ConnectionCard`, `ConnectionRow` (with Supabase Realtime subscription for status), and `ConnectionModal` (shadcn Dialog) — see design doc Section 5 for the full component specs.

**Step 4: Surface ConnectionCard outside StepsSummary**

In `src/components/chat/steps-summary.tsx`, detect connection tool parts and render them outside the collapsed summary. At ~line 60 where tool parts are hidden, add:

```typescript
// Before rendering collapsed tool parts, check for connection tools:
const connectionToolParts = toolParts.filter(
  (part) => part.toolName === "create_new_connections" || part.toolName === "manage_activated_tools_for_connections"
);
const regularToolParts = toolParts.filter(
  (part) => part.toolName !== "create_new_connections" && part.toolName !== "manage_activated_tools_for_connections"
);

// Render connection tool parts OUTSIDE the collapsed summary:
{connectionToolParts.map((part) => (
  <ToolCallInline key={part.toolCallId} {...part} />
))}

// Keep regular tool parts inside the collapsible as before:
// ... existing collapsed render for regularToolParts
```

**Step 5: Run tests**

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx -t "ConnectionCard" --reporter=verbose
```

Expected: PASS.

---

### Task 6: PermissionCard component (renders from input, not output)

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Test: `src/components/chat/tool-call-inline.test.tsx`

**Important:** The PermissionCard renders during `approval-requested` state — BEFORE the tool has executed. It must render from tool `input` (the args the tool was called with), not `output` (which is null at approval time).

**Step 1: Write failing test**

```typescript
it("renders PermissionCard from input during approval-requested state", () => {
  render(
    <ToolCallInline
      name="manage_activated_tools_for_connections"
      state="call"
      approvalId="approval-123"
      input={{
        connections: [{
          connectionId: "conn-123",
          activate: ["GOOGLEDRIVE_FIND_FILE", "GOOGLEDRIVE_DOWNLOAD_FILE"],
          deactivate: [],
        }],
      }}
      output={null}
      onToolApproval={vi.fn()}
    />,
  );
  expect(screen.getByText("Grant permissions to agent?")).toBeInTheDocument();
  expect(screen.getByText("GOOGLEDRIVE_FIND_FILE")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /grant permissions/i })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx -t "PermissionCard" --reporter=verbose
```

**Step 3: Build detection function + PermissionCard**

Detection checks tool name and `input` shape (not `output`):

```typescript
function isToolPermissionRequest(
  toolName: string,
  input: unknown,
): input is { connections: Array<{ connectionId: string; activate: string[]; deactivate: string[] }> } {
  return (
    toolName === "manage_activated_tools_for_connections" &&
    input !== null &&
    typeof input === "object" &&
    Array.isArray((input as Record<string, unknown>).connections)
  );
}
```

PermissionCard shows:
- Title: "Grant permissions to agent?"
- For each connection: connectionId + tool slugs as chips
- Grant Permissions button → `onToolApproval(approvalId, true)`
- Deny link → `onToolApproval(approvalId, false)`
- After approval: "Granted" badge

**Note:** This v1 card shows tool slugs only (e.g., `GOOGLEDRIVE_FIND_FILE`), not display names. The richer version with display names requires the tool result enrichment from Task 7, which can be layered on later.

**Step 4: Run tests**

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx -t "PermissionCard" --reporter=verbose
```

Expected: PASS.

---

### Task 7: Enrich create-connection.ts result with display metadata

**Files:**
- Modify: `src/lib/composio/catalog.ts` — add `getToolkitDisplayInfo()`
- Modify: `src/lib/runner/tools/connections/create-connection.ts:~117`

**Step 1: Add toolkit metadata lookup**

In `src/lib/composio/catalog.ts`:

```typescript
/**
 * Gets display metadata for a toolkit (proper name, description).
 * Uses toolkit-level metadata, not raw tool metadata.
 * Falls back to slug if API call fails.
 */
export async function getToolkitDisplayInfo(
  toolkitSlug: string,
): Promise<{ displayName: string; description: string }> {
  try {
    const composio = getComposio();
    const tools = await composio.tools.getRawComposioTools({
      toolkits: [toolkitSlug],
      limit: 1,
    });
    const firstTool = tools[0];
    return {
      displayName: firstTool?.toolkit?.name ?? toolkitSlug,
      description: firstTool?.description ?? "",
    };
  } catch {
    return { displayName: toolkitSlug, description: "" };
  }
}
```

**Step 2: Enrich create-connection.ts result**

In the success result, add display metadata and `composioConnectedAccountId`:

```typescript
{
  integrationId: integration,
  displayName,           // from getToolkitDisplayInfo
  description,           // from getToolkitDisplayInfo
  connectionStatus: "pending_auth" as const,
  redirectUrl,
  composioConnectedAccountId,  // from initiateOAuthFlow result
}
```

**Step 3: Run connection tool tests**

```bash
npx vitest run src/lib/runner/tools/connections/ --reporter=verbose
```

Update mocks if tests assert exact result shapes.

---

### Task 8: System prompt update

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Add Google Workspace guidance**

After vault references are removed (PR 60), add to the tool guidance section:

```typescript
`## Google Workspace (Drive, Docs, Sheets)
When the user's Google account is connected, you have access to their Drive,
Docs, and Sheets via activated Composio tools. Use GOOGLEDRIVE_FIND_FILE to
search, GOOGLEDRIVE_DOWNLOAD_FILE to read, and GOOGLEDOCS/GOOGLESHEETS tools
to create and edit documents and spreadsheets.

For heavy file processing (data analysis, format conversion), download the
file and use bash in the sandbox.`
```

**Step 2: Run system prompt tests**

```bash
npx vitest run src/lib/ai/ --reporter=verbose
```

---

### Task 9: Final verification + commit

**Step 1: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: All tests pass.

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Verify upload route accepts new types and runner filters correctly**

Manual sanity check: trace the flow from upload → runner → model to confirm:
- PDF uploads: accepted by route, passed to model as `file-data`
- DOCX uploads: accepted by route, excluded from model parts, notice injected, preloaded to sandbox
- Image uploads: unchanged behavior

**Step 4: Single commit**

```bash
git add -A
git commit -m "feat(pr62): Google workspace + chat upload expansion + connection cards"
```
