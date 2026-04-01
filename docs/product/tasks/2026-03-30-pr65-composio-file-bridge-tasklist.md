# Composio File Bridge Implementation Plan

**PR:** PR 65: Composio File Bridge (out-of-plan — Phase 7 scope extension, depends on PR 63 + PR 64)
**Decisions:** CONN-02
**Goal:** Make Composio connection tools that download files persist them to agent storage and push to sandbox, instead of dumping binary content into model context.

**Architecture:** Composio's TypeScript SDK (`@composio/core@0.6.4`) has `autoUploadDownloadFiles: true` by default. Its `FileToolModifier` rewrites file-download tool results to `{ uri, file_downloaded, s3url, mimeType }` where `uri` is a local temp path. We wrap `composio.tools.execute()` to detect this shape, upload the file to `agent-files/{clientId}/home/`, optionally push to active sandbox, clean up the temp file, and return the agent path to the model. Upload direction (agent → connection) resolves `/agent/` paths from Supabase Storage to local temp files before passing to Composio.

**Tech Stack:** @composio/core@0.6.4, Supabase Storage, Vercel Sandbox (optional push), Vitest

**Design doc:** `docs/plans/2026-03-30-composio-file-bridge-design.md`

---

## Relevant Files

**Create:**
- `src/lib/composio/file-bridge.ts` — `findDownloadedFile()` helper + `bridgeDownloadedFile()` + `resolveAgentPathForUpload()`
- `src/lib/composio/__tests__/file-bridge.test.ts`

**Modify:**
- `src/lib/composio/activated-tools.ts` — expand options interface, wrap execute with bridge
- `src/lib/composio/__tests__/activated-tools.test.ts` — new tests for bridge integration
- `src/lib/runner/run-agent.ts:237-250` — pass fileClient + getSandbox to loadActivatedConnectionTools

**Reference (read, don't modify):**
- `src/lib/storage/agent-files.ts` — `AgentFileClient` type, `uploadArtifact()` signature
- `src/lib/storage/agent-paths.ts` — `toStoragePath()` for `/agent/` → relative path conversion
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts:43-50` — `LazyBashToolResult` interface (PR 64 adds `getSandbox`)
- `node_modules/@composio/core/dist/utils/modifiers/FileToolModifier.node.mjs` — SDK file modifier source of truth for result shape

---

### Task 1: `findDownloadedFile` helper — detect Composio file downloads in tool results

The Composio SDK's `FileToolModifier` rewrites file-download results to `{ uri, file_downloaded, s3url, mimeType }`. This helper walks a tool result (one level deep) to find that shape.

**Files:**
- Create: `src/lib/composio/file-bridge.ts`
- Test: `src/lib/composio/__tests__/file-bridge.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/composio/__tests__/file-bridge.test.ts
import { describe, expect, it } from "vitest";

import { findDownloadedFile } from "../file-bridge";

describe("findDownloadedFile", () => {
  it("returns null for non-object data", () => {
    expect(findDownloadedFile(null)).toBeNull();
    expect(findDownloadedFile(undefined)).toBeNull();
    expect(findDownloadedFile("string")).toBeNull();
    expect(findDownloadedFile(42)).toBeNull();
  });

  it("returns null when no file download fields present", () => {
    expect(findDownloadedFile({ success: true, data: "some text" })).toBeNull();
  });

  it("detects top-level file download result", () => {
    const result = findDownloadedFile({
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result).toEqual({
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("detects one-level nested file download result", () => {
    const result = findDownloadedFile({
      response_data: {
        uri: "/tmp/composio/photo.jpg",
        file_downloaded: true,
        s3url: "https://s3.example.com/photo.jpg",
        mimeType: "image/jpeg",
      },
    });

    expect(result).toEqual({
      uri: "/tmp/composio/photo.jpg",
      file_downloaded: true,
      s3url: "https://s3.example.com/photo.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("returns null when file_downloaded is false", () => {
    const result = findDownloadedFile({
      uri: "",
      file_downloaded: false,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/octet-stream",
    });

    // Returns the shape but file_downloaded is false — caller should check
    expect(result).not.toBeNull();
    expect(result!.file_downloaded).toBe(false);
  });

  it("returns null when uri is missing", () => {
    expect(findDownloadedFile({
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
    })).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/composio/__tests__/file-bridge.test.ts
```

Expected: FAIL — `findDownloadedFile` not found (module doesn't exist yet).

**Step 3: Write minimal implementation**

```typescript
// src/lib/composio/file-bridge.ts
/**
 * Helpers for bridging Composio file downloads/uploads to agent storage.
 * @module lib/composio/file-bridge
 */

/** Shape produced by Composio's FileToolModifier for downloaded files. */
export interface ComposioFileDownloadResult {
  uri: string;
  file_downloaded: boolean;
  s3url: string;
  mimeType: string;
}

/**
 * Walks a Composio tool result (one level deep) looking for the
 * `{ uri, file_downloaded, s3url }` shape produced by FileToolModifier.
 *
 * @returns The file download object, or null if not found.
 */
export function findDownloadedFile(data: unknown): ComposioFileDownloadResult | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;

  if (typeof obj.uri === "string" && typeof obj.file_downloaded === "boolean") {
    return obj as unknown as ComposioFileDownloadResult;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (typeof nested.uri === "string" && typeof nested.file_downloaded === "boolean") {
        return nested as unknown as ComposioFileDownloadResult;
      }
    }
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/composio/__tests__/file-bridge.test.ts
```

Expected: PASS — all 6 tests green.

**Step 5: Commit**

```bash
git add src/lib/composio/file-bridge.ts src/lib/composio/__tests__/file-bridge.test.ts
git commit -m "feat(pr65): add findDownloadedFile helper for Composio file detection"
```

---

### Task 2: `bridgeDownloadedFile` — persist downloaded file to agent storage

Takes a `ComposioFileDownloadResult`, reads the local temp file, uploads to `agent-files/{clientId}/home/`, optionally pushes to active sandbox, cleans up temp file. Returns the agent-visible path.

**Files:**
- Modify: `src/lib/composio/file-bridge.ts`
- Test: `src/lib/composio/__tests__/file-bridge.test.ts`

**Step 1: Write the failing tests**

```typescript
// Add to src/lib/composio/__tests__/file-bridge.test.ts
import { afterEach, vi } from "vitest";
import { bridgeDownloadedFile } from "../file-bridge";

// Mock node:fs/promises — bridge reads/deletes temp files
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

import * as fs from "node:fs/promises";

describe("bridgeDownloadedFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads file to agent storage and returns agent path", async () => {
    const mockBuffer = Buffer.from("file content");
    vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/report.xlsx",
        downloadUrl: "https://signed-url",
      }),
    };

    const result = await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/1711792800-report.xlsx",
        file_downloaded: true,
        s3url: "https://s3.example.com/file.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      fileClient: mockFileClient as any,
      getSandbox: () => null,
    });

    expect(result).toBe("/agent/home/report.xlsx");
    expect(mockFileClient.uploadArtifact).toHaveBeenCalledWith({
      path: "home/report.xlsx",
      content: mockBuffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      expiresInSeconds: 604800,
    });
    expect(fs.unlink).toHaveBeenCalledWith("/tmp/composio/1711792800-report.xlsx");
  });

  it("pushes file to sandbox when sandbox is active", async () => {
    const mockBuffer = Buffer.from("file content");
    vi.mocked(fs.readFile).mockResolvedValue(mockBuffer);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const mockSandbox = { writeFiles: vi.fn().mockResolvedValue(undefined) };
    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/data.csv",
        downloadUrl: "https://signed-url",
      }),
    };

    await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/data.csv",
        file_downloaded: true,
        s3url: "https://s3.example.com/data.csv",
        mimeType: "text/csv",
      },
      fileClient: mockFileClient as any,
      getSandbox: () => mockSandbox as any,
    });

    expect(mockSandbox.writeFiles).toHaveBeenCalledWith([{
      path: "/vercel/sandbox/workspace/agent/home/data.csv",
      content: mockBuffer,
    }]);
  });

  it("skips sandbox push when sandbox is null", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("content"));
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/file.txt",
        downloadUrl: "https://signed-url",
      }),
    };

    await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/file.txt",
        file_downloaded: true,
        s3url: "https://s3.example.com/file.txt",
        mimeType: "text/plain",
      },
      fileClient: mockFileClient as any,
      getSandbox: () => null,
    });

    // No sandbox calls — just storage upload + cleanup
    expect(mockFileClient.uploadArtifact).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalled();
  });

  it("cleans up temp file even if upload fails", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("content"));
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockRejectedValue(new Error("upload failed")),
    };

    await expect(bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/file.txt",
        file_downloaded: true,
        s3url: "https://s3.example.com/file.txt",
        mimeType: "text/plain",
      },
      fileClient: mockFileClient as any,
      getSandbox: () => null,
    })).rejects.toThrow("upload failed");

    expect(fs.unlink).toHaveBeenCalledWith("/tmp/composio/file.txt");
  });

  it("falls back to application/octet-stream when mimeType is empty", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("binary"));
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/unknown.bin",
        downloadUrl: "https://signed-url",
      }),
    };

    await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/unknown.bin",
        file_downloaded: true,
        s3url: "https://s3.example.com/unknown.bin",
        mimeType: "",
      },
      fileClient: mockFileClient as any,
      getSandbox: () => null,
    });

    expect(mockFileClient.uploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/octet-stream" }),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/composio/__tests__/file-bridge.test.ts
```

Expected: FAIL — `bridgeDownloadedFile` not exported.

**Step 3: Write minimal implementation**

Add to `src/lib/composio/file-bridge.ts`:

```typescript
import { readFile, unlink } from "node:fs/promises";
import { basename } from "node:path";

import type { AgentFileClient } from "@/lib/storage/agent-files";

const SANDBOX_WORKSPACE = "/vercel/sandbox/workspace";
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface BridgeDownloadedFileOptions {
  fileData: ComposioFileDownloadResult;
  fileClient: Pick<AgentFileClient, "uploadArtifact">;
  getSandbox: () => { writeFiles: (files: { path: string; content: Buffer }[]) => Promise<void> } | null;
}

/**
 * Persists a Composio-downloaded file to agent storage and optionally
 * pushes it into an active sandbox. Cleans up the temp file afterward.
 *
 * @returns The model-visible agent path (e.g. "/agent/home/report.xlsx").
 */
export async function bridgeDownloadedFile(options: BridgeDownloadedFileOptions): Promise<string> {
  const { fileData, fileClient, getSandbox } = options;
  const localPath = fileData.uri;
  const filename = basename(localPath);
  const contentType = fileData.mimeType || "application/octet-stream";

  let buffer: Buffer;
  try {
    buffer = await readFile(localPath) as Buffer;

    await fileClient.uploadArtifact({
      path: `home/${filename}`,
      content: buffer,
      contentType,
      expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
    });

    const sandbox = getSandbox();
    if (sandbox) {
      await sandbox.writeFiles([{
        path: `${SANDBOX_WORKSPACE}/agent/home/${filename}`,
        content: buffer,
      }]);
    }
  } finally {
    await unlink(localPath).catch(() => {});
  }

  return `/agent/home/${filename}`;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/composio/__tests__/file-bridge.test.ts
```

Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add src/lib/composio/file-bridge.ts src/lib/composio/__tests__/file-bridge.test.ts
git commit -m "feat(pr65): add bridgeDownloadedFile for storage + sandbox persistence"
```

---

### Task 3: `resolveAgentPathForUpload` — resolve /agent/ paths to local temp files for upload direction

When the agent calls a connection tool with an argument like `/agent/home/report.pdf`, we need to download the file from Supabase Storage to a local temp path for Composio to pick up.

**Files:**
- Modify: `src/lib/composio/file-bridge.ts`
- Test: `src/lib/composio/__tests__/file-bridge.test.ts`

**Step 1: Write the failing tests**

```typescript
// Add to src/lib/composio/__tests__/file-bridge.test.ts
import { resolveAgentPathForUpload } from "../file-bridge";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import * as fs from "node:fs/promises";

describe("resolveAgentPathForUpload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads from storage and writes to temp path", async () => {
    const mockBuffer = new ArrayBuffer(8);
    const mockFileClient = {
      downloadBinary: vi.fn().mockResolvedValue({
        buffer: mockBuffer,
        mimeType: "application/pdf",
      }),
    };
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const tempPath = await resolveAgentPathForUpload({
      agentPath: "/agent/home/report.pdf",
      fileClient: mockFileClient as any,
    });

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("home/report.pdf");
    expect(fs.mkdir).toHaveBeenCalledWith("/tmp/composio-uploads", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/tmp/composio-uploads/report.pdf",
      expect.any(Buffer),
    );
    expect(tempPath).toBe("/tmp/composio-uploads/report.pdf");
  });

  it("strips /agent/ prefix correctly", async () => {
    const mockFileClient = {
      downloadBinary: vi.fn().mockResolvedValue({
        buffer: new ArrayBuffer(4),
        mimeType: "text/csv",
      }),
    };
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await resolveAgentPathForUpload({
      agentPath: "/agent/uploads/1711792800-deals.csv",
      fileClient: mockFileClient as any,
    });

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("uploads/1711792800-deals.csv");
  });

  it("throws if path does not start with /agent/", async () => {
    const mockFileClient = { downloadBinary: vi.fn() };

    await expect(resolveAgentPathForUpload({
      agentPath: "/tmp/some-file.txt",
      fileClient: mockFileClient as any,
    })).rejects.toThrow("must start with /agent/");

    expect(mockFileClient.downloadBinary).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/composio/__tests__/file-bridge.test.ts
```

Expected: FAIL — `resolveAgentPathForUpload` not exported.

**Step 3: Write minimal implementation**

Add to `src/lib/composio/file-bridge.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AGENT_ROOT } from "@/lib/storage/agent-paths";

const UPLOAD_TEMP_DIR = "/tmp/composio-uploads";

interface ResolveAgentPathOptions {
  agentPath: string;
  fileClient: Pick<AgentFileClient, "downloadBinary">;
}

/**
 * Downloads a file from agent storage to a local temp path so Composio
 * can read it for upload to a connection (e.g. Google Drive).
 *
 * @returns The local temp file path.
 */
export async function resolveAgentPathForUpload(options: ResolveAgentPathOptions): Promise<string> {
  const { agentPath, fileClient } = options;

  if (!agentPath.startsWith(AGENT_ROOT)) {
    throw new Error(`Upload path "${agentPath}" must start with ${AGENT_ROOT}`);
  }

  const storagePath = agentPath.slice(AGENT_ROOT.length);
  const filename = basename(storagePath);

  const { buffer } = await fileClient.downloadBinary(storagePath);

  await mkdir(UPLOAD_TEMP_DIR, { recursive: true });
  const tempPath = join(UPLOAD_TEMP_DIR, filename);
  await writeFile(tempPath, Buffer.from(buffer));

  return tempPath;
}
```

Note: update the `import` at the top to include `mkdir` and `writeFile` alongside existing `readFile` and `unlink`. Also add `join` to the `path` import.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/composio/__tests__/file-bridge.test.ts
```

Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add src/lib/composio/file-bridge.ts src/lib/composio/__tests__/file-bridge.test.ts
git commit -m "feat(pr65): add resolveAgentPathForUpload for agent→connection file bridge"
```

---

### Task 4: Wire bridge into `loadActivatedConnectionTools`

Expand the options interface to accept `fileClient` and `getSandbox`. Wrap the existing `composio.tools.execute()` call to run the download bridge on file results and the upload bridge on `/agent/` arguments.

**Files:**
- Modify: `src/lib/composio/activated-tools.ts:22-25,90-101`
- Test: `src/lib/composio/__tests__/activated-tools.test.ts`

**Step 1: Write the failing tests**

Add to `src/lib/composio/__tests__/activated-tools.test.ts`:

```typescript
// Add mocks at top of file alongside existing mocks
const { mockBridgeDownloadedFile, mockFindDownloadedFile, mockResolveAgentPathForUpload } = vi.hoisted(() => ({
  mockBridgeDownloadedFile: vi.fn(),
  mockFindDownloadedFile: vi.fn(),
  mockResolveAgentPathForUpload: vi.fn(),
}));

vi.mock("../file-bridge", () => ({
  findDownloadedFile: (...args: unknown[]) => mockFindDownloadedFile(...args),
  bridgeDownloadedFile: (...args: unknown[]) => mockBridgeDownloadedFile(...args),
  resolveAgentPathForUpload: (...args: unknown[]) => mockResolveAgentPathForUpload(...args),
}));

// Add after existing tests:

describe("file bridge integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockBridgeDownloadedFile.mockReset();
    mockFindDownloadedFile.mockReset();
    mockResolveAgentPathForUpload.mockReset();
  });

  it("bridges downloaded file when Composio result contains file data", async () => {
    const fileData = {
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const mockExecute = vi.fn().mockResolvedValue({ data: fileData, successful: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    mockFindDownloadedFile.mockReturnValue(fileData);
    mockBridgeDownloadedFile.mockResolvedValue("/agent/home/report.xlsx");

    const mockFileClient = { uploadArtifact: vi.fn() };
    const mockGetSandbox = vi.fn().mockReturnValue(null);

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-file-dl",
        toolkit_slug: "googledrive",
        activated_tools: ["GOOGLEDRIVE_DOWNLOAD_FILE"],
        tool_schemas: {
          GOOGLEDRIVE_DOWNLOAD_FILE: {
            description: "Download file",
            inputParameters: { type: "object", properties: { file_id: { type: "string" } } },
          },
        },
      }),
    ], {
      fileClient: mockFileClient as any,
      getSandbox: mockGetSandbox,
    });

    const dlTool = tools["conn-file-dl__GOOGLEDRIVE_DOWNLOAD_FILE"];
    const result = await (dlTool as any).execute({ file_id: "abc123" });

    expect(mockBridgeDownloadedFile).toHaveBeenCalledWith({
      fileData,
      fileClient: mockFileClient,
      getSandbox: mockGetSandbox,
    });
    expect(result.data.uri).toBe("/agent/home/report.xlsx");
    expect(result.data.message).toContain("/agent/home/report.xlsx");
  });

  it("passes through non-file results unchanged", async () => {
    const nonFileResult = { data: { threads: [{ id: "t1" }] }, successful: true };
    const mockExecute = vi.fn().mockResolvedValue(nonFileResult);
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    mockFindDownloadedFile.mockReturnValue(null);

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-search",
        toolkit_slug: "googledrive",
        activated_tools: ["GOOGLEDRIVE_SEARCH_DOCUMENTS"],
        tool_schemas: {
          GOOGLEDRIVE_SEARCH_DOCUMENTS: {
            description: "Search docs",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ], {
      fileClient: {} as any,
      getSandbox: () => null,
    });

    const tool = tools["conn-search__GOOGLEDRIVE_SEARCH_DOCUMENTS"];
    const result = await (tool as any).execute({});

    expect(mockBridgeDownloadedFile).not.toHaveBeenCalled();
    expect(result).toEqual(nonFileResult);
  });

  it("resolves /agent/ paths in arguments for upload direction", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ data: { fileId: "new123" }, successful: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    mockFindDownloadedFile.mockReturnValue(null);
    mockResolveAgentPathForUpload.mockResolvedValue("/tmp/composio-uploads/report.pdf");

    const mockFileClient = { downloadBinary: vi.fn() };

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-upload",
        toolkit_slug: "googledrive",
        activated_tools: ["GOOGLEDRIVE_UPLOAD_FILE"],
        tool_schemas: {
          GOOGLEDRIVE_UPLOAD_FILE: {
            description: "Upload file",
            inputParameters: {
              type: "object",
              properties: {
                filePath: { type: "string", file_uploadable: true },
              },
            },
          },
        },
      }),
    ], {
      fileClient: mockFileClient as any,
      getSandbox: () => null,
    });

    const tool = tools["conn-upload__GOOGLEDRIVE_UPLOAD_FILE"];
    await (tool as any).execute({ filePath: "/agent/home/report.pdf" });

    expect(mockResolveAgentPathForUpload).toHaveBeenCalledWith({
      agentPath: "/agent/home/report.pdf",
      fileClient: mockFileClient,
    });
    // Verify Composio received the resolved temp path
    expect(mockExecute).toHaveBeenCalledWith("GOOGLEDRIVE_UPLOAD_FILE", expect.objectContaining({
      arguments: expect.objectContaining({ filePath: "/tmp/composio-uploads/report.pdf" }),
    }));
  });

  it("works without fileClient (no bridge, passthrough)", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ data: { success: true }, successful: true });
    vi.mocked(getComposio).mockReturnValue({
      tools: { getRawComposioTools: vi.fn(), execute: mockExecute },
    } as never);

    const tools = await loadActivatedConnectionTools([
      createMockConnection({
        id: "conn-no-bridge",
        toolkit_slug: "gmail",
        activated_tools: ["GMAIL_SEND_EMAIL"],
        tool_schemas: {
          GMAIL_SEND_EMAIL: {
            description: "Send email",
            inputParameters: { type: "object", properties: {} },
          },
        },
      }),
    ]);
    // No fileClient passed — should still work (passthrough)

    const tool = tools["conn-no-bridge__GMAIL_SEND_EMAIL"];
    const result = await (tool as any).execute({});

    expect(result.data.success).toBe(true);
    expect(mockBridgeDownloadedFile).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/composio/__tests__/activated-tools.test.ts
```

Expected: FAIL — new tests fail because the execute wrapper doesn't call the bridge yet.

**Step 3: Write minimal implementation**

Modify `src/lib/composio/activated-tools.ts`:

a) Update the imports:
```typescript
import type { AgentFileClient } from "@/lib/storage/agent-files";
import { AGENT_ROOT } from "@/lib/storage/agent-paths";
import { bridgeDownloadedFile, findDownloadedFile, resolveAgentPathForUpload } from "./file-bridge";
```

b) Expand the options interface:
```typescript
interface LoadActivatedConnectionToolsOptions {
  supabase?: ChatSupabaseClient;
  clientId?: string;
  /** Agent file client for persisting downloaded files to storage. */
  fileClient?: Pick<AgentFileClient, "uploadArtifact" | "downloadBinary">;
  /** Returns the active sandbox instance, or null if not yet booted. */
  getSandbox?: () => { writeFiles: (files: { path: string; content: Buffer }[]) => Promise<void> } | null;
}
```

c) Replace the execute function (lines 95-100) with the wrapped version:
```typescript
execute: async (args) => {
  let resolvedArgs = args as Record<string, unknown>;

  // Upload direction: resolve /agent/ paths to local temp files
  if (options?.fileClient) {
    for (const [key, value] of Object.entries(resolvedArgs)) {
      if (typeof value === "string" && value.startsWith(AGENT_ROOT)) {
        const tempPath = await resolveAgentPathForUpload({
          agentPath: value,
          fileClient: options.fileClient,
        });
        resolvedArgs = { ...resolvedArgs, [key]: tempPath };
      }
    }
  }

  const result = await composio.tools.execute(slug, {
    connectedAccountId: connection.composio_connected_account_id,
    arguments: resolvedArgs,
    dangerouslySkipVersionCheck: true,
  });

  // Download direction: persist files to agent storage
  const fileData = findDownloadedFile(result?.data);
  if (options?.fileClient && fileData?.file_downloaded && fileData.uri) {
    const agentPath = await bridgeDownloadedFile({
      fileData,
      fileClient: options.fileClient,
      getSandbox: options.getSandbox ?? (() => null),
    });

    return {
      ...result,
      data: {
        ...(typeof result?.data === "object" ? result.data : {}),
        uri: agentPath,
        message: `File downloaded and saved to ${agentPath}`,
      },
    };
  }

  return result;
},
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/composio/__tests__/activated-tools.test.ts
```

Expected: PASS — all tests (existing + new) green.

**Step 5: Also run file-bridge tests to make sure nothing broke**

```bash
npx vitest run src/lib/composio/__tests__/
```

Expected: PASS — all Composio tests green.

**Step 6: Commit**

```bash
git add src/lib/composio/activated-tools.ts src/lib/composio/__tests__/activated-tools.test.ts
git commit -m "feat(pr65): wire file bridge into loadActivatedConnectionTools"
```

---

### Task 5: Wire fileClient + getSandbox from run-agent.ts

Pass `fileClient` and the sandbox getter into `loadActivatedConnectionTools()` so the bridge has access to storage and sandbox at runtime.

**Files:**
- Modify: `src/lib/runner/run-agent.ts:237-250,324-341`

**Context (post PR 63+64):**
- `createLazyBashTool` now returns `getSandbox: () => Sandbox | null` (PR 64, line 203 of create-lazy-bash-tool.ts)
- `run-agent.ts` does NOT destructure `getSandbox` yet (line 326 only destructures `tool` and `cleanup`)
- `buildPreloadFiles` no longer takes `fileParts` (PR 64 removed it)
- The Composio promise (line 237-250) runs in a parallel batch BEFORE the sandbox block (line 324). So we need a getter/closure, not a direct reference.

**Step 1: Implement the wiring**

a) Create a `composioFileClient` BEFORE the parallel batch (line ~236). The existing `fileClient` at line 325 is scoped inside the `if (snapshotId)` block — we need one at the outer scope:

```typescript
// Add before the composioPromise (before line 237)
const composioFileClient = createAgentFileClient(supabase, clientId);
```

b) Declare a mutable getter that will be populated when sandbox is created:

```typescript
// Add before the composioPromise (after composioFileClient)
let sandboxGetter: (() => Sandbox | null) = () => null;
```

c) Update the composioPromise to pass the new options (line 240):

```typescript
const composioPromise = getActiveConnections(supabase, clientId)
  .then((connections) => {
    _t("get_connections");
    return loadActivatedConnectionTools(connections, {
      supabase,
      clientId,
      fileClient: composioFileClient,
      getSandbox: () => sandboxGetter(),
    });
  })
  // ... rest unchanged
```

d) In the sandbox block (line 326), destructure `getSandbox` and assign it:

```typescript
if (snapshotId) {
  const fileClient = createAgentFileClient(supabase, clientId);
  const { tool: bashTool, cleanup, getSandbox } = createLazyBashTool({
    snapshotId,
    getPreloadFiles: () =>
      buildPreloadFiles({
        supabase,
        clientId,
      }),
    getContextEntries: () => toolResultAccumulator,
    fileClient,
    runId: `${threadId}-${runId}`,
  });

  sandboxGetter = getSandbox;
  sandboxTools.bash = bashTool;
  sandboxCleanup = cleanup;
}
```

Now when a Composio tool calls `getSandbox()`:
- Before any bash call → `getSandbox()` returns `null` → file saved to storage only
- After first bash call boots sandbox → `getSandbox()` returns live sandbox → file pushed to sandbox too

**Step 2: Run full test suite**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
npx vitest run src/lib/composio/__tests__/
```

Expected: PASS — no regressions. The runner tests mock `loadActivatedConnectionTools`, so the new options don't break existing tests. The activated-tools tests cover the bridge behavior.

**Step 3: Commit**

```bash
git add src/lib/runner/run-agent.ts
git commit -m "feat(pr65): wire fileClient + getSandbox into Composio tool loading"
```

---

### Task 6: Export from index + final verification

Ensure the new file-bridge module is properly exported and run all tests.

**Files:**
- Modify: `src/lib/composio/index.ts` (if bridge functions need external access)

**Step 1: Check exports**

The bridge functions are internal to the Composio module — called by `activated-tools.ts`, not by external consumers. No new exports needed from `src/lib/composio/index.ts` unless other modules need them.

**Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: PASS — all tests green, no regressions across the codebase.

**Step 3: Grep for any stale references**

```bash
grep -ri "file_download_dir" src/
grep -ri "file_path.*composio" src/
```

Expected: zero hits — we use `autoUploadDownloadFiles` (SDK default) and detect `uri`/`file_downloaded` shape, not `file_path`.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(pr65): final cleanup and verification"
```

---

## Notes for the Implementing Developer

1. **PR 64 shipped:** The `getSandbox` getter on `createLazyBashTool` is already available (PR 64, commit `2686cf3`). The return type `LazyBashToolResult` includes `getSandbox: () => Sandbox | null`. See `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts:51,203`.

2. **Composio SDK version:** All file detection logic is verified against `@composio/core@0.6.4`. If the SDK is upgraded, re-check `node_modules/@composio/core/dist/utils/modifiers/FileToolModifier.node.mjs` for any changes to the result shape (`{ uri, file_downloaded, s3url, mimeType }`).

3. **Upload direction argument detection:** The current approach scans all string arguments for `/agent/` prefix. This is simple but may false-positive on non-file arguments that happen to start with `/agent/`. A more robust approach would check the tool schema for `file_uploadable: true` markers. If you encounter false positives, switch to schema-based detection.

4. **Temp file cleanup:** `bridgeDownloadedFile` cleans up via `finally` block. `resolveAgentPathForUpload` does NOT clean up — the caller (Composio execute) needs the file to exist for the upload. Add cleanup after `composio.tools.execute()` returns for upload temp files. See the design doc section 4 for the pattern.

5. **Testing with real Composio:** The unit tests use mocks. To verify end-to-end, connect a Google Drive account in the app and test:
   - Download: `GOOGLEDRIVE_DOWNLOAD_FILE` → check `agent-files/{clientId}/home/` for the file
   - Upload: `GOOGLEDRIVE_UPLOAD_FILE` with `/agent/home/some-file.pdf` → check Google Drive

6. **Reference files to read before starting:**
   - Design doc: `docs/plans/2026-03-30-composio-file-bridge-design.md`
   - Handover: `docs/product/handovers/2026-03-30-pr63-65-unified-filesystem-handover.md` (questions 8-11)
   - Composio SDK source: `node_modules/@composio/core/dist/utils/modifiers/FileToolModifier.node.mjs`
   - Agent paths helper: `src/lib/storage/agent-paths.ts`
