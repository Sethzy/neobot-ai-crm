# PR 63: Unified Agent Filesystem

**Date:** 2026-03-30
**Phase:** 7 (Documents + Connections Polish)
**Depends on:** PR 60 (vault teardown), PR 62 (upload expansion)
**Status:** Design

## Problem

Sunder has three disconnected storage buckets:

| Bucket | What goes there | Agent can find it later? |
|---|---|---|
| `chat-attachments` | User uploads from chat composer | No — only accessible during the run via sandbox `/input/` |
| `client-files` | Generated PDFs from `generate_pdf` tool (currently deleted from working directory; PR 42a-pdf in v2 plan is pending re-implementation) | No — fire and forget |
| `agent-files` | Memory, skills, subagents, toolcalls, home | Yes |

Additionally, sandbox output artifacts sync to `agent-files/{clientId}/artifacts/sandbox/{runId}/` — technically in the right bucket, but namespaced under an opaque run ID the agent can never reconstruct.

This means 3 out of 4 artifact types are unreachable after the run that created them. If a user says "remember that PDF I sent you last week?" or "send me that report you made yesterday," the agent is blind.

Tasklet solves this with a single FUSE-mounted filesystem under `/agent/`. All files — uploads, agent outputs, memory — live in one browsable namespace. Two tools (`read_file`, `write_file`) access everything.

## Solution

Route all files into `agent-files/{clientId}/` with predictable paths. Adopt Tasklet's explicit persistence model for sandbox artifacts. No new tools — `read_file` already handles directory listings.

### Target filesystem (what the agent sees)

```
/agent/
├── home/                    # Read-write: agent working files, persistent artifacts
├── uploads/                 # Read-only: files uploaded by user in chat
├── subagents/               # Read-write: subagent and trigger instruction files
├── memory/                  # Read-write: topic files for long-term memory
├── skills/                  # Read-only: system + connection skills
├── SOUL.md                  # Read-write: personality
├── USER.md                  # Read-write: user profile
└── MEMORY.md                # Read-write: working notebook
```

Changes from current state:
- **`/agent/vault/`** — removed (PR 60)
- **`/agent/uploads/`** — new (this PR)
- **`/agent/home/`** — now the single destination for all persistent artifacts (agent-written files, sandbox outputs, generated PDFs)

### Sandbox persistence model (Tasklet pattern)

**Before:** Everything written to `output/` auto-syncs to storage. Agent doesn't control what persists. Scratch files, helper scripts, intermediate CSVs — all get synced.

**After:** Only files the agent explicitly places in `/workspace/agent/home/` inside the sandbox get synced back to `agent-files/{clientId}/home/`. Everything else is scratch and dies with the sandbox.

Sandbox directory layout (PR 63 scope — PR 64 expands this further):
```
/workspace/
├── input/              # Preloaded: current-message attachments + context.json (read-only)
├── skills/             # Preloaded: skill files (read-only)
├── agent/home/         # Empty dir at boot. Synced back to storage after each bash call.
└── (everything else)   # Scratch space. Dies with sandbox.
```

Note: In PR 63, only current-message attachments and skills are preloaded (existing behavior). `agent/home/` is created empty — the agent writes to it. PR 64 expands the preload to also seed `agent/uploads/` and `agent/home/` with files from storage.

This matches Tasklet's FUSE model without FUSE. Tasklet agents naturally do scratch work in `/tmp/` and only write final artifacts to `/agent/home/`. Our agents do the same — all scratch in `/tmp/`, then `cp /tmp/results.csv /workspace/agent/home/deal-analysis.csv` to persist.

**Why this is better than auto-sync:**
- Agent controls what persists and how it's named — no junk in workspace
- No filename collision risk from opaque system naming
- Matches Tasklet's proven production pattern
- One-line change in sync code (swap `OUTPUT_DIR` path)

**Risk: agent forgets to copy.** Mitigated by clear system prompt guidance. Tasklet ships this to production and it works. If the agent forgets, the file is still available for the rest of that run — it just won't be there next conversation. That's the correct default: scratch files should disappear.

### Routing changes

| Artifact | Before | After |
|---|---|---|
| Chat uploads | `chat-attachments/{clientId}/{timestamp}-{uuid}.{ext}` | `agent-files/{clientId}/uploads/{timestamp}-{original-filename}` |
| Sandbox artifacts | `agent-files/{clientId}/artifacts/sandbox/{runId}/{file}` (auto-synced from `output/`) | `agent-files/{clientId}/home/{file}` (agent explicitly saves to `/workspace/agent/home/`) |
| Everything else | `agent-files/{clientId}/...` | Unchanged |

### Write protection

`/agent/uploads/` is read-only to the agent (matching Tasklet). The upload API route is the only writer. Add `uploads/` to `assertWritable()` in `agent-files.ts` alongside the existing `skills/system/` protection.

### No migration

All existing data in `chat-attachments` and `client-files` is test data. No migration script needed — just change the routing going forward.

## Implementation

### 1. Upload route: change destination bucket

**File:** `app/api/files/upload/route.ts`

Change from:
```typescript
.from("chat-attachments")
.upload(`${clientId}/${timestamp}-${uuid}.${ext}`, ...)
```

To:
```typescript
.from("agent-files")
.upload(`${clientId}/uploads/${timestamp}-${sanitizedOriginalFilename}`, ...)
```

The returned public URL changes accordingly. Message `parts` JSONB stores whatever URL the upload route returns, so downstream (runner, sandbox preload) picks up the new URL automatically.

### 2. Telegram upload route: same change

**File:** `src/lib/channels/telegram/media.ts`

Same bucket change — Telegram file uploads should also land in `agent-files/{clientId}/uploads/`.

### 3. Sandbox persistence: switch from `output/` auto-sync to explicit `/agent/home/`

**File:** `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`

Change `OUTPUT_DIR` from:
```typescript
const OUTPUT_DIR = "/vercel/sandbox/workspace/output";
```

To:
```typescript
const OUTPUT_DIR = "/vercel/sandbox/workspace/agent/home";
```

Same sync mechanism — scan directory, upload new/changed files, SHA-256 dedup. Only the scanned directory changes. Files land at `agent-files/{clientId}/home/{filename}`.

Change artifact storage path from:
```typescript
const artifactPath = `artifacts/sandbox/${runId}/${relativePath}`;
```

To:
```typescript
const artifactPath = `home/${relativePath}`;
```

**File:** `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`

Update the sandbox instructions from:
```
Write output files to output/ — they will be synced to storage automatically.
```

To:
```
Scratch work goes anywhere. To persist a file across sessions, save it to /workspace/agent/home/ with a descriptive name — e.g., cp results.csv /workspace/agent/home/deal-analysis-2026-03-30.csv
```

**File:** `src/lib/runner/tools/sandbox/build-preload-files.ts`

Create the `/workspace/agent/home/` directory in sandbox during preload so it exists before the agent tries to write to it. No need to preload existing `home/` files — the agent can access those via `read_file` tool outside the sandbox.

### 4. Update sandbox workflow skills

**File:** Skills in `agent-files/{clientId}/skills/` and any hardcoded skill references

Existing sandbox workflow skills (PR 52a) may reference `output/` as the artifact destination. Update to use `/workspace/agent/home/` instead. Grep for `output/` references in skill templates.

### 5. Retire `client-files` bucket (generate_pdf routing)

The `generate_pdf` tool files are currently deleted from the working directory. PR 42a-pdf in the v2 plan is pending re-implementation with a new approach (@json-render/react-pdf).

**For PR 63:** Remove the `client-files` / `PDF_STORAGE_BUCKET` constant. When PR 42a-pdf re-implements PDF generation, it should write to `agent-files/{clientId}/home/` instead of `client-files`. This PR establishes that convention — PR 42a-pdf follows it.

No files to delete since they're already gone from the working directory.

### 6. Write protection for uploads

**File:** `src/lib/storage/agent-files.ts`

Add `uploads` check in `assertWritable()`:

```typescript
if (segments[0] === "uploads") {
  throw new Error(`Path "${normalizedPath}" is read-only and cannot be modified by the agent.`);
}
```

### 7. System prompt update

**File:** `src/lib/ai/system-prompt.ts`

Update the `<filesystem>` section to include `uploads/` and remove vault (if PR 60 hasn't already). Add sandbox persistence guidance matching Tasklet's v2 system prompt (`<using-the-filesystem>` section):

```
<filesystem>
You have access to a filesystem with the following structure:
/agent/
├── home/                    # Read-write: persistent storage (your files survive across sessions)
├── uploads/{filename}       # Read-only: files uploaded by the user in chat
├── subagents/               # Read-write: subagent and trigger instruction files
├── memory/                  # Read-write: topic files for organized long-term memory
├── skills/                  # Read-only: additional instructions for how you should work
├── SOUL.md                  # Read-write: your personality and identity
├── USER.md                  # Read-write: user profile
└── MEMORY.md                # Read-write: your working notebook

The read-only paths are managed by the system and cannot be modified by you.
Use read_file to read files, including images and PDFs. Use write_file to create, edit, and delete files.
</filesystem>
```

Add to `<tool-usage>` File Storage section:
```
- Files the user uploads in chat are saved at /agent/uploads/. Browse with read_file("/agent/uploads/").
- Files you create (reports, exports, charts) go under /agent/home/.
- In the sandbox, do all scratch work in /tmp/. To persist a file, copy the final result to /agent/home/ with a descriptive name.
  Only files in /agent/home/ are saved. Everything else is lost when the sandbox shuts down.
```

Update `SANDBOX_PROMPT` in `src/lib/ai/system-prompt.ts` with two Tasklet-sourced additions:

**a) Ephemeral packages warning** (Tasklet line 191). Add after the pre-installed packages line:

```
- Common packages are pre-installed (pandas, openpyxl, matplotlib, numpy, Node 22, LibreOffice).
+ Important: The sandbox is ephemeral. Any packages you install are lost after the session.
+ If uv is available, use it for on-demand packages: uv run --with pandas,numpy script.py
```

Tasklet verbatim: "Important: The sandbox is ephemeral, and installed packages are lost after each session."

**b) Update `<using-the-filesystem>`** to match PR 63 paths. Replace old `output/` references:

From:
```
User files are pre-loaded at /vercel/sandbox/workspace/input/ when the sandbox starts.
...
Write output files to /vercel/sandbox/workspace/output/ — they will be uploaded to storage and returned as download links automatically.
...
- /vercel/sandbox/workspace/output/ is where you write results the user should receive.
- Prefer /tmp/ for I/O-heavy intermediate work. Copy only final artifacts to /vercel/sandbox/workspace/output/.
```

To (PR 63 — before PR 64 expands preload):
```
Preloaded when the sandbox starts:
- /vercel/sandbox/workspace/input/ — current message attachments + context.json (read-only)
- /vercel/sandbox/workspace/skills/{slug}/ — skill SKILL.md and reference files (read-only)
- /vercel/sandbox/workspace/agent/home/ — empty directory for persistent outputs
- /tmp/ — fast local storage, ephemeral (lost after session)

Do all scratch work in /tmp/ — intermediate files, scripts, temp data.
To persist a file across sessions, copy the final result to /workspace/agent/home/ with a descriptive name.
Only files in /workspace/agent/home/ are saved. Everything else is lost when the sandbox shuts down.
```

PR 64 updates this to also list `agent/uploads/` and `agent/home/` as preloaded from storage (see PR 64 design doc).

**c) `<processing-data>` already present** (lines 132-141). No changes needed — already matches Tasklet's pattern verbatim. ✓

### 8. Sandbox preload: fetch by storagePath instead of URL

**File:** `src/lib/runner/tools/sandbox/build-preload-files.ts`

Currently downloads current-message attachments by fetching the public URL in `part.url`. After PR 63, uploads are in the private `agent-files` bucket — URLs are signed and may expire.

Change the preload to use `part.storagePath` (new field from section 9b) and download directly from Supabase Storage server-side, instead of fetching by URL:

```typescript
// Before: fetch by public URL (breaks with signed URLs)
const response = await fetch(part.url);

// After: download from Supabase Storage by path (server-side, no URL needed)
const { data } = await bucket.download(`${clientId}/${part.storagePath}`);
```

Falls back to `fetch(part.url)` for legacy messages without `storagePath`.

### 9. File download system (`sunder://` links)

Solves two problems at once:
- **Chat history regression:** moving uploads from public `chat-attachments` bucket to private `agent-files` means signed URLs in old messages expire. Attachment previews break.
- **Agent-created files:** agent writes a report to `/agent/home/`, has no way to give the user a clickable download link.

**a) API endpoint**

**File:** `app/api/files/download/route.ts`

```typescript
// GET /api/files/download?path=home/report.pdf
// Auth-protected, client-scoped. Generates fresh signed URL, redirects.

export async function GET(request: NextRequest) {
  const { clientId } = await requireAuth(request);
  const path = request.nextUrl.searchParams.get("path");
  const storagePath = `${clientId}/${path}`;

  const { data } = await supabase.storage
    .from("agent-files")
    .createSignedUrl(storagePath, 60); // 60s expiry, just for the redirect

  return NextResponse.redirect(data.signedUrl);
}
```

**b) Upload route: store storagePath in message parts**

**File:** `app/api/files/upload/route.ts`

Add `storagePath` to the upload response alongside `url`:

```typescript
return NextResponse.json({
  url: signedUrl,                              // for immediate use (preload, model context)
  storagePath: `uploads/${timestamp}-${name}`,  // for on-demand resolution later
  pathname: originalFilename,
  contentType: file.type,
});
```

Frontend stores both in the attachment object. Message `parts` JSONB now includes:
```json
{
  "type": "file",
  "url": "https://...signed-url...",
  "storagePath": "uploads/1711792800-deals.csv",
  "filename": "deals.csv",
  "mediaType": "text/csv"
}
```

**c) Chat attachment renderer: resolve on render**

**File:** Chat message component (attachment preview)

When rendering a file attachment from message history, use `storagePath` (if present) to construct a fresh download URL instead of using the stored `url`:

```typescript
const downloadHref = part.storagePath
  ? `/api/files/download?path=${encodeURIComponent(part.storagePath)}`
  : part.url;  // fallback for legacy messages without storagePath
```

Old messages without `storagePath` gracefully fall back to the stored URL (which may be expired — acceptable for pre-migration data).

**d) Chat markdown renderer: detect `sunder://` links**

**File:** Chat message markdown renderer

When the agent outputs `[Report](sunder:///agent/home/report.pdf)` in its response, the markdown renderer rewrites `sunder:///agent/{path}` → `/api/files/download?path={path}`:

```typescript
// In markdown link renderer
if (href.startsWith("sunder:///agent/")) {
  const agentPath = href.replace("sunder:///agent/", "");
  return `/api/files/download?path=${encodeURIComponent(agentPath)}`;
}
```

**e) System prompt: teach the convention**

Add to `<output-guidance>` or `<tool-usage>` File Storage section:

```
- You can output download links to files in your filesystem using sunder:// URLs in markdown:
  [Q1 Report](sunder:///agent/home/q1-deal-report.pdf)
  [Cleaned Data](sunder:///agent/home/deals-cleaned.csv)
  These render as clickable download links for the user.
  Links work for any file under /agent/, including files you created and user uploads.
```

### 10. Cleanup

- Remove `chat-attachments` bucket references from codebase
- Remove `client-files` / `PDF_STORAGE_BUCKET` references (generate-pdf.ts already deleted from working directory; clean up any remaining imports or references)
- `grep -ri "chat-attachments\|client-files\|PDF_STORAGE_BUCKET"` should return zero hits (excluding test fixtures that need updating)

## Testing

**Uploads:**
- Upload a file in chat → verify it lands at `agent-files/{clientId}/uploads/`
- Agent runs `read_file("/agent/uploads/")` → sees uploaded files
- Agent runs `read_file("/agent/uploads/listing.pdf")` → reads the file
- Agent tries `write_file` to `/agent/uploads/x.md` → gets read-only error
- Agent in a later conversation runs `read_file("/agent/uploads/")` → still sees files from prior conversations
- Telegram file upload → lands in `agent-files/{clientId}/uploads/`

**Sandbox persistence:**
- Agent runs Python script, writes scratch files → scratch files do NOT appear in `agent-files`
- Agent runs `cp results.csv /workspace/agent/home/results.csv` → file lands at `agent-files/{clientId}/home/results.csv`
- Agent runs `read_file("/agent/home/")` → sees persisted artifacts from sandbox
- Agent in a later conversation runs `read_file("/agent/home/")` → still sees artifacts

**Download links:**
- Agent outputs `[Report](sunder:///agent/home/report.pdf)` in chat → renders as clickable download link
- Clicking the link → redirects to fresh signed URL → file downloads
- Upload a file → scroll up in chat after 1 hour → attachment preview still loads (storagePath resolution, not stale URL)
- Old messages without storagePath → fall back to stored URL gracefully
- Unauthenticated request to `/api/files/download` → 401
- Request with path to another client's files → 403 (client-scoped)

**Cleanup verification:**
- `grep -ri "chat-attachments\|client-files\|PDF_STORAGE_BUCKET"` → zero hits
- `grep -ri "output/"` in sandbox code → no references to old `output/` convention

## Unresolved Questions

1. ~~**`agent-files` bucket access policy**~~ — **RESOLVED by section 9.** Upload route stores `storagePath` in message parts. Chat renderer generates fresh signed URLs on render via `/api/files/download`. Sandbox preload fetches by `storagePath` from Supabase directly (server-side, no URL needed). No public bucket required.

2. **Storage cleanup** — No TTL or cleanup for uploads or home files. Over months, a client's workspace could grow. Not a launch blocker but worth noting for future.

## Fast Follow: PR 64 — Sandbox Workspace Preload

PR 63 makes all files *findable* via `read_file`. PR 64 makes them *processable* in the sandbox by expanding the preload to include `uploads/` and `home/`.

Currently the sandbox only preloads current-message attachments and skill files. After PR 64, it preloads the full agent workspace — all past uploads and all home files. Same Vercel pattern (gather → preload → process), just with more files. No new tools needed.

**Design doc:** `docs/plans/2026-03-30-sandbox-workspace-preload-design.md`

**Out of scope:** Composio/Google Drive file downloads. Connection tools return data to model context, not to storage. How files from connections land in `agent-files` is a separate concern — assign to another dev during Composio integration testing.

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Upload path structure | Flat `/agent/uploads/{timestamp}-{original-filename}` | Matches Tasklet. Preserves original filename for browsability (e.g. `1711792800-listing-123-main-st.pdf`). Timestamp prefix prevents collisions. |
| Sandbox persistence | Agent explicitly saves to `/workspace/agent/home/` | Matches Tasklet's FUSE pattern. Agent controls what persists. No junk from scratch files. Vercel reference repos don't sync at all — this is a middle ground. |
| `list_files` tool | Not needed — `read_file` already handles directories | `read_file("/agent/uploads/")` returns tree listing via existing `listDirectory()`. |
| Uploads write protection | Read-only to agent | Matches Tasklet. Prevents agent from deleting user files. |
| Migration | None — all existing data is test data | Pre-launch, no real users. |
| `home/` subdirectory structure | Flat — agent organizes as it wants | Matches Tasklet. No prescribed `outputs/` subfolder. |
| File download links | `sunder://` protocol + `/api/files/download` endpoint | Matches Tasklet's `avfs://` pattern. Agent outputs path-based links, frontend resolves to fresh signed URLs on demand. Solves signed URL expiry for chat history AND gives agent a way to share files with users. |
| Chat attachment URLs | Store `storagePath` in message parts, resolve on render | Prevents signed URL expiry regression when moving from public `chat-attachments` to private `agent-files` bucket. |
