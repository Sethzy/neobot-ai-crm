# PR 65: Composio File Bridge

**Date:** 2026-03-30
**Phase:** 7 (Documents + Connections Polish)
**Depends on:** PR 63 (unified filesystem)
**Status:** Design

## Problem

Composio connection tools that download files (e.g., `GOOGLEDRIVE_DOWNLOAD_FILE`) return raw JSON to the model. The binary file content either bloats model context or gets lost. The agent has no way to persist the file or process it in the sandbox.

Tasklet's equivalent tools write directly to `/agent/home/` via FUSE. The model never sees binary bytes — it just gets back a path.

## Solution

Two changes:

1. Ensure Composio SDK's `autoUploadDownloadFiles` is enabled (default `true` in `@composio/core@0.6.4`) so file-producing tools automatically download binaries to a local directory.
2. After `composio.tools.execute()`, detect downloaded files by checking for `uri` and `file_downloaded` fields in the result, then bridge to `agent-files/{clientId}/home/`.

### Composio TypeScript SDK file handling (verified against installed @composio/core@0.6.4)

The SDK's `FileToolModifier` automatically processes tool results. When a tool output contains an `s3url` field marked as `file_downloadable: true` in the schema, the modifier:
1. Downloads the file from the S3 URL
2. Saves to a local temp path
3. Rewrites the result to:

```typescript
{
  uri: string;              // Local file path (empty string on failure)
  file_downloaded: boolean; // true if download succeeded
  s3url: string;            // Original S3 URL (preserved)
  mimeType: string;         // Detected MIME type
}
```

**Note:** The Python SDK uses `file_download_dir` as the constructor option name. The TypeScript SDK uses `autoUploadDownloadFiles: boolean` (default `true`). The download location is managed internally by the SDK.

## Implementation

### 1. Verify Composio client config

**File:** `src/lib/composio/client.ts`

`autoUploadDownloadFiles` defaults to `true` in the TypeScript SDK — no config change needed. Verify this is not being set to `false` anywhere.

### 2. Bridge downloaded files in tool execution wrapper

**File:** `src/lib/composio/activated-tools.ts`

After `composio.tools.execute()`, check if the result contains downloaded file fields. If so, upload to agent storage and return the agent path to the model.

```typescript
execute: async (args) => {
  const result = await composio.tools.execute(slug, {
    connectedAccountId: connection.composio_connected_account_id,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  });

  // Bridge: if result contains a downloaded file, persist to agent storage
  const fileData = findDownloadedFile(result?.data);
  if (fileClient && fileData?.file_downloaded && fileData.uri) {
    const localPath = fileData.uri;
    const filename = path.basename(localPath);
    const buffer = await fs.readFile(localPath);
    const contentType = fileData.mimeType || "application/octet-stream";

    await fileClient.uploadArtifact({
      path: `home/${filename}`,
      content: buffer,
      contentType,
      expiresInSeconds: 7 * 24 * 60 * 60,
    });

    // If sandbox is active, push there too
    const sandbox = getSandbox?.();
    if (sandbox) {
      await sandbox.writeFiles([{
        path: `/workspace/agent/home/${filename}`,
        content: buffer,
      }]);
    }

    // Clean up temp file
    await fs.unlink(localPath).catch(() => {});

    // Return agent path to model (not raw content)
    return {
      ...result,
      data: {
        ...result.data,
        uri: `/agent/home/${filename}`,
        message: `File downloaded and saved to /agent/home/${filename}`,
      },
    };
  }

  return result;
},
```

The `findDownloadedFile` helper walks the result data to find objects with `{ uri, file_downloaded, s3url }` — the shape produced by Composio's FileToolModifier. This is more robust than checking a single field name, since the downloaded file object may be nested.

```typescript
function findDownloadedFile(data: unknown): { uri: string; file_downloaded: boolean; s3url: string; mimeType: string } | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.uri === "string" && typeof obj.file_downloaded === "boolean") {
    return obj as any;
  }
  // Walk one level deep for nested results
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (typeof nested.uri === "string" && typeof nested.file_downloaded === "boolean") {
        return nested as any;
      }
    }
  }
  return null;
}
```

This requires `fileClient` and a sandbox getter to be passed into `loadActivatedConnectionTools()`. The getter is critical — the sandbox is lazy (null until first bash call), so we need the current reference at execution time, not at tool registration time.

```typescript
export async function loadActivatedConnectionTools(
  connections: ConnectionRow[],
  options?: {
    supabase?: ChatSupabaseClient;
    clientId?: string;
    fileClient?: AgentFileClient;                              // NEW
    getSandbox?: () => Sandbox | null;                         // NEW — getter, not value (from PR 64)
  },
): Promise<ToolSet>
```

This handles both timing scenarios with zero branching:
- Agent calls connection tool BEFORE any bash call → `getSandbox()` returns null → file saved to storage only → PR 64 preload picks it up when sandbox eventually boots
- Agent calls connection tool AFTER bash has booted sandbox → `getSandbox()` returns live instance → file saved to storage AND pushed to active sandbox immediately

### 3. Wire fileClient into the call site

**File:** `src/lib/runner/run-agent.ts`

Pass the existing `fileClient` (already created for storage tools) into `loadActivatedConnectionTools()`.

## What This Enables

```
User: "Grab my Q1 spreadsheet from Drive and analyze it"

Agent: conn_123__GOOGLEDRIVE_DOWNLOAD_FILE({ fileId: "..." })
    → Composio downloads binary → /tmp/composio-downloads/Q1-deals.xlsx
    → Bridge uploads to agent-files/{clientId}/home/Q1-deals.xlsx
    → If sandbox active → pushes to /workspace/agent/home/Q1-deals.xlsx
    → Returns { path: "/agent/home/Q1-deals.xlsx" } to model

Agent: bash("python3 analyze.py /workspace/agent/home/Q1-deals.xlsx")
    → File is there (pushed by bridge, or preloaded at next boot)
    → Works ✓
```

## Scope

- Add `file_download_dir` to Composio client init
- Detect file paths in `composio.tools.execute()` results
- Upload to `agent-files/{clientId}/home/`
- Push to active sandbox if running
- Clean up temp file
- Return agent path to model

### 4. Upload direction: agent filesystem → connections

**File:** `src/lib/composio/activated-tools.ts` (same wrapper)

When the agent calls a connection tool with a `file_to_upload` argument that starts with `/agent/`, the wrapper resolves it from Supabase Storage to a local temp file before passing to Composio.

Composio's `GOOGLEDRIVE_UPLOAD_FILE` accepts a local file path and handles the upload automatically:

```typescript
// In the execute wrapper, BEFORE calling composio.tools.execute():

// Detect /agent/ paths in arguments that reference files to upload
if (fileClient && typeof args.file_to_upload === "string" && args.file_to_upload.startsWith("/agent/")) {
  const storagePath = toStoragePath(args.file_to_upload);
  const { buffer } = await fileClient.downloadBinary(storagePath);

  // Write to temp directory for Composio to pick up
  const filename = path.basename(storagePath);
  const tempPath = path.join("/tmp/composio-uploads", filename);
  await fs.mkdir("/tmp/composio-uploads", { recursive: true });
  await fs.writeFile(tempPath, Buffer.from(buffer));

  // Rewrite the argument to the local temp path
  args = { ...args, file_to_upload: tempPath };
}

const result = await composio.tools.execute(slug, {
  connectedAccountId: connection.composio_connected_account_id,
  arguments: args,
  dangerouslySkipVersionCheck: true,
});

// Clean up temp upload file
if (tempPath) await fs.unlink(tempPath).catch(() => {});
```

This matches Tasklet's `google_drive_upload_file` tool which requires `filePath` to start with `/agent/` prefix. The agent thinks in `/agent/` paths, the wrapper translates to local disk, Composio uploads to the connection.

### What This Enables

**Download (connection → agent):**
```
Agent: conn_123__GOOGLEDRIVE_DOWNLOAD_FILE({ fileId: "..." })
    → Composio downloads binary → /tmp/composio-downloads/Q1-deals.xlsx
    → Bridge uploads to agent-files/{clientId}/home/Q1-deals.xlsx
    → If sandbox active → pushes to /workspace/agent/home/Q1-deals.xlsx
    → Returns { path: "/agent/home/Q1-deals.xlsx" } to model
```

**Upload (agent → connection):**
```
Agent: conn_123__GOOGLEDRIVE_UPLOAD_FILE({ file_to_upload: "/agent/home/q1-report.pdf" })
    → Wrapper downloads from agent-files/{clientId}/home/q1-report.pdf
    → Saves to /tmp/composio-uploads/q1-report.pdf
    → Composio reads local file → uploads to Google Drive
    → Returns { data: { fileId: "...", link: "..." } } to model
```

## Scope

**Download direction:**
- Add `file_download_dir` to Composio client init
- Detect file paths in `composio.tools.execute()` results
- Upload to `agent-files/{clientId}/home/`
- Push to active sandbox if running
- Clean up temp file
- Return agent path to model

**Upload direction:**
- Detect `/agent/` paths in `file_to_upload` arguments before execute
- Download from Supabase Storage to temp directory
- Rewrite argument to local temp path
- Composio handles the upload
- Clean up temp file

## Testing

**Download:**
- Connect Google Drive → download a file → verify it lands in `agent-files/{clientId}/home/`
- Agent calls `read_file("/agent/home/")` → sees the downloaded file
- If sandbox active during download → file accessible at `/workspace/agent/home/`
- If sandbox boots after download → file preloaded via PR 64
- Temp file in `/tmp/composio-downloads/` cleaned up after bridge
- Non-file tool results (e.g., `google_drive_search_documents`) pass through unchanged

**Upload:**
- Agent calls upload tool with `/agent/home/report.pdf` → file uploaded to Google Drive
- Agent calls upload tool with `/agent/uploads/deals.csv` → file uploaded to Google Drive
- Result includes Drive file ID and link
- Temp file in `/tmp/composio-uploads/` cleaned up after execute
- Non-file arguments pass through unchanged

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Detection method (download) | Walk result for `{ uri, file_downloaded, s3url }` shape | Verified against installed `@composio/core@0.6.4` FileToolModifier output. TypeScript SDK uses `autoUploadDownloadFiles` (not Python's `file_download_dir`). |
| Detection method (upload) | Check `args.file_to_upload` starts with `/agent/` | Matches Tasklet's constraint: "Must start with /agent/ prefix" |
| Storage destination (download) | `home/{filename}` | Matches Tasklet's `destinationPath` default of `/agent/home/{filename}` |
| Sandbox push | If active, push immediately | Closes the mid-run gap from PR 64's known limitation |
| Temp directories | `/tmp/composio-downloads/` and `/tmp/composio-uploads/` | Separate dirs for clarity, cleaned up after each operation |
