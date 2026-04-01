# Google Workspace + Chat Uploads + Connection Cards — Design Doc (PR B)

**Status:** Approved
**Date:** 2026-03-30
**Scope:** Enable Google workspace via Composio, widen chat file uploads, add rich inline connection cards.
**Depends on:** PR A (vault teardown) for system prompt cleanup.

---

## 1. Problem

Three gaps shipping together because they're one user story — "I can connect my Google account, upload any file, and the agent works with all of it."

1. **No Google workspace access.** Users have documents in Drive, data in Sheets, notes in Docs. The agent can't touch any of it.
2. **Chat uploads are too narrow.** Only JPEG, PNG, and spreadsheets. No PDFs, no Word docs. The bash tool can process anything, but files can't reach it.
3. **Connection flow is generic.** OAuth connections render as plain tool approval pills. No context about what's being connected or what permissions are being granted.

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Google workspace integration | Composio out of the box — no custom code | Composio provides `googledrive` (89 tools), `googledocs` (35 tools), `googlesheets` (48 tools). Existing connections infrastructure handles discovery, activation, and execution. |
| Separate vs unified Google connection | **Separate toolkits** (`googledrive`, `googledocs`, `googlesheets`) | Users add incrementally. Tighter OAuth scopes per connection. `googlesuper` (431 tools) is available if we want to consolidate later. |
| Chat upload expansion | Widen accept filter + bump to 10MB | PDFs are Gemini-native. Binary Office formats go to sandbox. Plumbing already exists in `buildPreloadFiles()`. |
| Connection UI | Rich inline cards in chat | Matches Tasklet reference. Builds trust during OAuth. Reuses existing tool approval lifecycle. |
| Drive approval model | Read-only auto-runs, writes need approval | Search, list, get, download auto-run. Create, upload, edit, move, delete pause for approval. Matches two-tier safety model. |
| Multi-file upload | Yes | Change file input to `multiple`, loop uploads. Small effort, clear UX win for batch uploads. |

---

## 3. Google workspace via Composio

### No custom integration code

Google workspace uses the same Composio connection flow as Gmail (PRs 27-28). No hand-rolled tool definitions, no schema overrides, no custom API calls.

**Flow:**
1. User says "connect my Google Drive" in chat
2. Agent calls `create_new_connections` → ConnectionCard renders (see Section 5)
3. User completes OAuth → connection saved
4. Agent calls `manage_activated_tools_for_connections` → PermissionCard renders
5. User grants permissions → tools are live
6. Agent can now search Drive, read Docs, query Sheets

### Available Composio toolkits

| Toolkit | Tools | Key capabilities |
|---|---|---|
| `googledrive` | 89 | Search, create, copy, download, edit, delete files/folders, permissions, comments, revisions, change tracking |
| `googledocs` | 35 | Create docs (plain text + markdown), get doc by ID/plaintext, headers/footers, tables, images, named ranges |
| `googlesheets` | 48 | Create/read/update sheets, batch operations, charts, formatting, SQL queries, data validation, upsert rows |

Users activate tools incrementally via the agent. The agent guides activation based on what the user asks for.

**Note:** Our `getRawComposioTools()` calls default to `limit: 20`, which truncates results. This must be fixed before building Google activation flows — see Section 8 (prerequisite fixes).

### Agent-generated files → Drive

- Agent generates files (PDFs, reports) to Supabase Storage as today
- User can say "push that to my Drive" — agent uses `GOOGLEDRIVE_CREATE_FILE_FROM_TEXT` or `GOOGLEDRIVE_UPLOAD_FILE`
- If user sets up a trigger ("always save generated PDFs to my Reports folder"), it happens automatically via autopilot

### Gotchas

- Google Workspace files (`application/vnd.google-apps.*`) can't be edited via `GOOGLEDRIVE_EDIT_FILE` — use `GOOGLEDOCS_*` / `GOOGLESHEETS_*` tools instead
- File IDs are opaque — always search by name first via `GOOGLEDRIVE_FIND_FILE`
- Rate limit: ~100 requests per 100 seconds per user
- 50 refresh token limit per user per OAuth client — exceeding silently kills older tokens
- Broader OAuth scopes may trigger "App is blocked" if not using a verified OAuth app

---

## 4. Chat upload expansion

### New accept filter

```typescript
const ALLOWED_UPLOAD_TYPES = new Set([
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
```

### Size limit

Bump from 5MB to **10MB**. Covers most PDFs. Supabase Storage handles this fine.

### Multi-file select

Change `<input type="file">` to include `multiple` attribute. Loop uploads in `handleFileChange`. Upload queue already handles concurrent uploads.

### How each type flows

| Type | Model sees it as | Sandbox preload? |
|---|---|---|
| JPEG, PNG, WebP | `image-data` content part (Gemini vision) | No |
| PDF | `file-data` content part (Gemini native PDF reading) | Yes, for bash processing if needed |
| DOCX, DOC, PPTX, PPT | Not sent to model directly — agent uses sandbox | Yes, at `/input/{filename}` |
| XLSX, XLS, CSV | Not sent to model directly — agent uses sandbox | Yes, at `/input/{filename}` |
| TXT, MD, HTML, XML, JSON | `text` content part | Yes, for bash processing if needed |

### Model-visible allowlist (critical)

**Gemini rejects unsupported MIME types with hard errors.** Live testing confirmed: PDF succeeds, but DOCX, PPTX, XLSX, XLS, and DOC all fail with `unsupported-media` errors. The current runner at `run-agent.ts` blindly forwards all `FileUIPart`s into the model message. Widening the upload filter without adding a filter here **will break chat**.

**Fix:** Add a model-visible allowlist in the runner where `userMessageParts` is assembled. Split file parts into two buckets:

```typescript
/** MIME types Gemini can process directly as file parts. */
const MODEL_VISIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

// In run-agent.ts where userMessageParts is built:
const modelParts = fileParts.filter(p => MODEL_VISIBLE_TYPES.has(p.mediaType));
const sandboxOnlyParts = fileParts.filter(p => !MODEL_VISIBLE_TYPES.has(p.mediaType));
```

- **Model-visible parts** go into the user message as `FileUIPart`s (model sees them directly).
- **Sandbox-only parts** are excluded from the message but still preloaded via `buildPreloadFiles()`. The system prompt or a text part tells the agent: "User uploaded report.docx (available in sandbox at /input/report.docx)".
- Text types (TXT, MD, HTML, XML, JSON, CSV) could also be model-visible if sent as inline text content rather than file parts. Consider reading the file content and injecting as a text part. But this is an optimization — sandbox-only is safe and correct for v1.

### Processing pattern

1. User uploads file → stored in `chat-attachments` bucket
2. URL returned as `FileUIPart` in message parts
3. **Model-visible filter** splits parts (see above)
4. Model-visible parts (images, PDF) → AI SDK passes directly to Gemini
5. Sandbox-only parts (Office, spreadsheets) → preloaded to `/input/{filename}`, agent told via text part
6. All parts preloaded via `buildPreloadFiles()` regardless of model visibility
7. Agent can use bash to process any format in sandbox (`pdftotext`, `python-docx`, `pandoc`, etc.)

### Preview component update

`PreviewAttachment` already handles images (thumbnail) and non-images (generic "File" label). Enhancement: show file type label for PDF, Word, Excel, PowerPoint instead of generic "File".

### Files to change

| File | Change |
|---|---|
| `app/api/files/upload/route.ts` | Update `ALLOWED_UPLOAD_TYPES`, bump size limit to 10MB, update error message |
| `src/components/chat/chat-composer.tsx` | Update `CHAT_ATTACHMENT_ACCEPT`, add `multiple` to file input, loop uploads in `handleFileChange` |
| `src/components/chat/preview-attachment.tsx` | Add file type labels (PDF, Word, Excel, etc.) based on `contentType` |
| `src/lib/runner/run-agent.ts` | Add `MODEL_VISIBLE_TYPES` allowlist, split file parts into model-visible vs sandbox-only, inject text part for sandbox-only files |
| `app/api/files/upload/route.test.ts` | Add test cases for new MIME types and size limit |
| `src/lib/runner/__tests__/run-agent.test.ts` | Add test cases for model-visible filtering |

---

## 5. Connection cards

### Problem

Chat renders all tool approvals (including Composio connections) through the generic `ToolCallInline` pill. Rich inline cards communicate what's happening and build trust during OAuth flows.

### User journey

1. User asks agent to connect a service (e.g., "connect to my Google Drive")
2. Agent calls `create_new_connections` tool
3. **ConnectionCard** renders inline with integration name, description, and "Connect" button
4. User clicks "Connect" → **ConnectionModal** opens → user clicks "Continue to [App]" → new tab opens for OAuth
5. User completes OAuth → card updates to "Connected" via Supabase Realtime
6. Agent continues: "Google Drive is connected! Let's activate some tools..."
7. Agent calls `manage_activated_tools_for_connections` (needs approval)
8. **PermissionCard** renders with integration info, account email, tool chips, and "Grant Permissions" button
9. User clicks "Grant Permissions" → card updates to "Granted" badge
10. Agent confirms tools are live

### Approach

Detect `create_new_connections` and `manage_activated_tools_for_connections` by tool name in `ToolCallInline` and render purpose-built card components instead of the generic pill. Same pattern as existing `isPdfDownload` and `isBrowserNeedsAuth`.

### Components

All co-located with `tool-call-inline.tsx`.

#### ConnectionCard — "Create new connection?"

Bordered card with:
- **Header:** "Create new connection?" title + "It will be saved to your account" subtitle
- **Body:** Row per integration — name + description + action button
- **Action states:**
  - "Connect" button (default) → opens ConnectionModal
  - Spinner while OAuth in progress
  - "Connected" badge once callback confirms

**Realtime update:** Subscribe to `connections` table filtered by `composio_connected_account_id`. When `status` flips `pending` → `active`, card updates. Unsubscribe on unmount.

**Note:** `src/hooks/use-realtime.ts` does not currently support the `connections` table. Either expand that hook or use a direct Supabase channel subscription in the card component.

#### ConnectionModal

Simple shadcn Dialog:
- Integration name as title ("Connect Google Drive")
- "Per Agent Approval" explanation text
- "Continue to [App]" CTA → `window.open(redirectUrl, '_blank')`

#### PermissionCard — "Grant permissions to agent?"

Bordered card with:
- **Header:** "Grant permissions to agent?" title + subtitle
- **Body:** Row per connection — integration name + account email badge + description
- **Tool chips:** Wrapped flex row of small badges showing requested tool names
- **Action states:**
  - "+ Grant Permissions" button → calls `onToolApproval(approvalId, true)`
  - Small muted "Deny" text link below
  - "Granted" badge after approval

### Tool result enrichment

Both tools must return enough metadata for cards to render standalone.

**`create-connection.ts` — add to result:**
```typescript
{
  integrationId: string,
  displayName: string,                  // "Google Drive"
  description: string,                  // "Allows search and access of files..."
  connectionStatus: "pending_auth",
  redirectUrl: string,
  composioConnectedAccountId: string,   // for Realtime subscription — already available at creation time (line ~97)
}
```

**`manage-tools.ts` — add connection metadata:**
```typescript
{
  connectionId: string,
  displayName: string,          // "Google Drive"
  description: string,
  accountIdentifier: string,    // "seth@tryneobot.com" — already populated in connections table via callback
  activate: string[],           // tool slugs
  deactivate: string[],
}
```

**Metadata source:** Use `composio.toolkits.get(slug)` instead of raw tool metadata. Raw tools return lowercase names like "googledrive" with no description. The toolkit API returns proper display names ("Google Drive"), descriptions, tool counts, and managed-auth info. See `src/lib/composio/catalog.ts:49`.

### Files to change

| File | Change |
|---|---|
| `src/components/chat/tool-call-inline.tsx` | Add ConnectionCard, ConnectionModal, PermissionCard components + detection logic |
| `src/lib/runner/tools/connections/create-connection.ts` | Enrich tool result with display metadata via `toolkits.get()` |
| `src/lib/runner/tools/connections/manage-tools.ts` | Enrich tool result with connection metadata |
| `src/lib/composio/catalog.ts` | Switch from raw tool metadata to `toolkits.get()` for display names |

---

## 6. System prompt changes

### Remove

```
├── vault/                   # Read-write: indexed files in Knowledge Base
```

Remove all vault references from filesystem documentation and tool guidance.

### Add

```
## Google Workspace (Drive, Docs, Sheets)
When the user's Google account is connected, you have access to their Drive,
Docs, and Sheets via activated Composio tools. Use GOOGLEDRIVE_FIND_FILE to
search, GOOGLEDRIVE_DOWNLOAD_FILE to read, and GOOGLEDOCS/GOOGLESHEETS tools
to create and edit documents and spreadsheets.

For heavy file processing (data analysis, format conversion), download the
file and use bash in the sandbox.
```

---

## 8. Prerequisite fixes (do first)

Two existing bugs must be fixed before building Google activation flows or widening uploads.

### Fix 1: Composio `getRawComposioTools()` truncation

**Problem:** `getRawComposioTools()` defaults to `limit: 20`. Google Drive has 89 tools, Docs has 35, Sheets has 48. We only see the first 20 of each. This breaks tool counts, activation validation, and capability discovery for *all* connections — not just Google.

**Affected call sites:**
| File | Line | Context |
|---|---|---|
| `src/lib/composio/catalog.ts` | ~35 | Integration catalog browsing |
| `src/lib/runner/tools/connections/manage-tools.ts` | ~63 | Tool activation/deactivation |
| `src/lib/runner/tools/connections/get-connection-details.ts` | ~47 | Tool capability discovery |
| `app/api/connections/callback/route.ts` | ~188 | Schema caching on OAuth callback |

**Fix:** Pass `limit: 200` (or paginate) in all four call sites. Verify the Composio API supports `limit` as a query parameter.

### Fix 2: Model-visible file filter

**Problem:** `run-agent.ts` forwards all `FileUIPart`s to the model. Gemini rejects DOCX, PPTX, XLSX, XLS, DOC with `unsupported-media` errors. Widening the upload filter without this fix will crash chat.

**Fix:** See Section 4 (model-visible allowlist). Must land before or with the upload expansion.

---

## 9. Not in scope

- Integration logos/icons (cosmetic — add later via static SVG map)
- `googlesuper` unified toolkit (separate toolkits for now, consolidate later if needed)
- HEIC image support (defer — convert server-side via `sharp` if users hit it)
- MCP / Direct API / Computer Use connection types (still stubbed)
- Changes to the approval flow itself — we're skinning what already works
- Drag-and-drop file upload (paperclip button + paste is sufficient for v1)
