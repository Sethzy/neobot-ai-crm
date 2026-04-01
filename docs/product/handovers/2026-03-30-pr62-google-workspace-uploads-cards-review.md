# Review Handover: PR 62 — Google Workspace + Chat Uploads + Connection Cards

**Date:** 2026-03-30
**For:** Reviewer (independent review — depends on PR 60 + 61 for execution, but reviewable standalone)
**Estimated review time:** 45-60 minutes (largest PR)

---

## What This PR Does

Three features in one PR, all part of one user story: "I can connect my Google account, upload any file, and the agent works with all of it."

1. **Google workspace** — No custom code. Composio's `googledrive` (89 tools), `googledocs` (35 tools), `googlesheets` (48 tools) work out of the box via the existing connections infrastructure (PRs 27-28).

2. **Chat upload expansion** — Widen accept filter from `JPEG, PNG, CSV, XLSX, XLS` to include PDF, DOCX, PPTX, WebP, plain text formats. Bump size limit from 5MB to 10MB. Add `MODEL_VISIBLE_TYPES` filter in the runner to prevent Gemini from receiving unsupported MIME types.

3. **Connection UI cards** — Three inline card components (`ConnectionCard`, `ConnectionModal`, `PermissionCard`) replacing generic tool approval pills for OAuth flows.

## Files to Review

**Design doc:** `docs/plans/2026-03-30-connection-ui-cards-design.md`
**Tasklist:** `docs/product/tasks/2026-03-30-pr62-google-workspace-uploads-cards-tasklist.md`

### Critical path: Model-visible filter (Task 1)

This is the most important thing to review. Without it, uploading DOCX/PPTX crashes chat.

| File | What to check |
|---|---|
| `src/lib/runner/run-agent.ts:215-218` | Current code: all `fileParts` go straight into `userMessageParts`. Tasklist adds `splitFilePartsByModelVisibility()` to split into model-visible (images + PDF) vs sandbox-only (everything else). |

**Verify:**
- Is the `MODEL_VISIBLE_TYPES` set correct? Only `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Are we missing any Gemini-supported types? Check https://ai.google.dev/gemini-api/docs/document-processing.
- How are sandbox-only files communicated to the agent? The tasklist injects a text part: `"[Uploaded files available in sandbox: /input/report.docx. Use bash to process them.]"`. Is this the right UX, or should it be a system message instead?
- What happens if `fileParts` is empty? The filter should handle empty arrays gracefully.
- What about text types (`text/plain`, `text/csv`, `text/markdown`)? The tasklist treats them as sandbox-only. But Gemini can process plain text. Should they be model-visible? The design doc says "sandbox-only is safe and correct for v1" — agree or disagree?

### Upload route changes (Task 2)

| File | What to check |
|---|---|
| `app/api/files/upload/route.ts:14-20` | New `ALLOWED_UPLOAD_TYPES` set — verify all MIME types are correct |
| `app/api/files/upload/route.ts:38` | Size limit bump from 5MB to 10MB |
| `src/components/chat/chat-composer.tsx:54-55` | `CHAT_ATTACHMENT_ACCEPT` string — verify it matches the route's allowed types |

**Verify:**
- The accept string includes both MIME types AND file extensions (`.docx`, `.pptx`, etc.) for browser compatibility. Is this correct? Some browsers match by extension, others by MIME type.
- The tasklist already noted that `multiple` attribute is already on the file input and `handleFileChange` already handles arrays. Confirm this by reading the current code.
- Is 10MB the right limit? Supabase Storage free tier has a 50MB per-file limit. 10MB covers most PDFs but might block large presentations.

### Connection cards (Tasks 5-8)

| File | What to check |
|---|---|
| `src/components/chat/tool-call-inline.tsx:37-64` | Existing patterns: `isPdfDownload` and `isBrowserNeedsAuth`. The new detection functions follow the same shape. |
| `src/lib/runner/tools/connections/create-connection.ts:~97` | Where `composioConnectedAccountId` is available — verify it's actually returned by `initiateOAuthFlow`. |
| `src/lib/runner/tools/connections/manage-tools.ts:~63` | Where connection metadata lives — verify `account_identifier` and `toolkit_slug` are on the DB row. |

**Verify:**

1. **Detection functions:** `isConnectionCreation()` and `isToolPermission()` check tool name + output shape. Are the output shapes correct? Read the current return values of `create-connection.ts` and `manage-tools.ts` execute functions — do they actually have `success: true` and `results`/`connections` arrays? The tasklist modifies these, so verify the modifications are consistent.

2. **Realtime subscription:** The `ConnectionRow` component uses a direct Supabase channel subscription (not the `useRealtimeTable` hook, which doesn't support `connections`). Is this the right approach, or should the hook be extended? The direct subscription means channel cleanup on unmount — verify the `useEffect` cleanup is correct.

3. **PermissionCard approval wiring:** The card calls `onToolApproval(approvalId, true)`. Verify that `approvalId` is available in the `ToolCallInline` component props and that the approval flow is the same as existing tool approvals.

4. **ConnectionModal:** Opens OAuth in a new tab via `window.open(redirectUrl, "_blank")`. What if popups are blocked? Should there be a fallback or error handling?

5. **Component co-location:** All three card components live inside `tool-call-inline.tsx`. The file is currently ~200 lines. Adding 3 components + detection functions + types will roughly double it. Is this acceptable, or should they be extracted to separate files?

### Tool result enrichment (Task 4)

| File | What to check |
|---|---|
| `src/lib/composio/catalog.ts` | New `getToolkitDisplayInfo()` function. It fetches one tool from the toolkit to get the display name. Is there a better API? The reviewer's note says `composio.toolkits.get(slug)` exists — check if the SDK actually exposes this method. |

**Verify:**
- The fallback (`return { displayName: toolkitSlug, description: "" }`) on error is correct for resilience, but means the card would show "googledrive" instead of "Google Drive" if the API fails. Acceptable?
- Is the `limit: 1` optimization correct? We only need the toolkit name, not the full tool list.

### System prompt (Task 9)

| File | What to check |
|---|---|
| `src/lib/ai/system-prompt.ts` | New Google Workspace guidance block. Verify the tool names referenced (`GOOGLEDRIVE_FIND_FILE`, `GOOGLEDRIVE_DOWNLOAD_FILE`) actually exist in Composio. |

## Key Decisions (already made)

| Decision | Choice | Why |
|---|---|---|
| Separate vs unified Google connection | Separate (`googledrive`, `googledocs`, `googlesheets`) | Users add incrementally. Tighter OAuth scopes. |
| Override Composio schemas with Tasklet definitions | No — use as-is | Composio has 172 tools across 3 toolkits. Good enough. |
| Drive approval model | Read-only auto-runs, writes need approval | Matches existing two-tier safety model |
| HEIC support | Deferred | Not common enough for v1 |

## Architecture Context

- **Connections infrastructure:** `src/lib/runner/tools/connections/` — PRs 27-28 built the full flow: `create_new_connections` → OAuth → `manage_activated_tools_for_connections` → tools available to agent. PR 62 skins this with cards, doesn't change the flow.
- **Chat upload flow:** `app/api/files/upload/route.ts` → Supabase Storage `chat-attachments` bucket → URL as `FileUIPart` → `run-agent.ts` assembles into message → `buildPreloadFiles()` also preloads to sandbox.
- **Tool approval UI:** `src/components/chat/tool-call-inline.tsx` renders tool results with approve/deny for gated tools. Cards are just a richer version of the same pattern.
