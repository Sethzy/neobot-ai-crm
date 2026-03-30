/**
 * Helpers for bridging Composio file downloads/uploads to agent storage.
 * @module lib/composio/file-bridge
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type { AgentFileClient } from "@/lib/storage/agent-files";
import { AGENT_ROOT } from "@/lib/storage/agent-paths";

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
  const rawName = basename(storagePath);
  const ext = extname(rawName);
  const stem = rawName.slice(0, rawName.length - ext.length);
  const uniqueSuffix = randomBytes(4).toString("hex");
  const uniqueName = `${stem}-${uniqueSuffix}${ext}`;

  const { buffer } = await fileClient.downloadBinary(storagePath);

  await mkdir(UPLOAD_TEMP_DIR, { recursive: true });
  const tempPath = join(UPLOAD_TEMP_DIR, uniqueName);
  await writeFile(tempPath, Buffer.from(buffer));

  return tempPath;
}
