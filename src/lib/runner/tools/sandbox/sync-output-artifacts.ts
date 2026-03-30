/**
 * Syncs persistent sandbox home files back to Supabase Storage.
 *
 * Called after each `bash` command to make saved files available as download
 * URLs in the same agent run. Uses SHA-256 hashing to skip unchanged files.
 *
 * @module lib/runner/tools/sandbox/sync-output-artifacts
 */
import { createHash } from "node:crypto";

import type { SyncedArtifact } from "./types";

const HOME_DIR = "/vercel/sandbox/workspace/agent/home";

/** Infers MIME type from file extension. */
function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    json: "application/json",
    pdf: "application/pdf",
    html: "text/html",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    md: "text/markdown",
    txt: "text/plain",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

export interface SyncOutputOptions {
  /** The raw Vercel Sandbox instance (not the bash-tool wrapper). */
  sandbox: {
    runCommand: (cmd: string, args: string[]) => Promise<{
      exitCode: number;
      stdout: () => Promise<string>;
      stderr: () => Promise<string>;
    }>;
    readFileToBuffer: (opts: { path: string }) => Promise<Buffer | null>;
  };
  /** Agent file client from createAgentFileClient(). */
  fileClient: {
    uploadArtifact: (opts: {
      path: string;
      content: Buffer;
      contentType: string;
      expiresInSeconds: number;
      downloadFilename?: string;
    }) => Promise<{ storagePath: string; downloadUrl: string }>;
  };
  /** Current run ID retained for call-site compatibility. */
  runId: string;
  /** Mutable map of path → SHA-256 hash from prior sync calls. */
  priorHashes: Map<string, string>;
}

/**
 * Scans `/vercel/sandbox/workspace/agent/home/` for files, uploads new or
 * changed ones to Supabase Storage, and returns download URLs.
 */
export async function syncOutputArtifacts(
  options: SyncOutputOptions,
): Promise<SyncedArtifact[]> {
  const { sandbox, fileClient, priorHashes } = options;

  // List files in the persistent home directory.
  const listResult = await sandbox.runCommand("bash", [
    "-c",
    `find ${HOME_DIR} -type f 2>/dev/null | sort`,
  ]);
  const stdout = await listResult.stdout();

  if (listResult.exitCode !== 0 || !stdout.trim()) {
    return [];
  }

  const filePaths = stdout.trim().split("\n").filter(Boolean);
  const artifacts: SyncedArtifact[] = [];

  for (const absolutePath of filePaths) {
    const relativePath = absolutePath.replace(`${HOME_DIR}/`, "");

    // Download file from sandbox
    const buffer = await sandbox.readFileToBuffer({ path: absolutePath });
    if (!buffer) continue;

    // Check hash to skip unchanged files
    const hash = createHash("sha256").update(buffer).digest("hex");
    if (priorHashes.get(relativePath) === hash) continue;
    priorHashes.set(relativePath, hash);

    // Mirror the sandbox's persistent home tree under the agent home prefix.
    const contentType = inferContentType(relativePath);
    const artifactPath = `home/${relativePath}`;

    const { downloadUrl } = await fileClient.uploadArtifact({
      path: artifactPath,
      content: buffer,
      contentType,
      expiresInSeconds: 7 * 24 * 60 * 60, // 7-day signed URL
      downloadFilename: relativePath.split("/").pop(),
    });

    artifacts.push({
      relativePath,
      downloadUrl,
      contentType,
      sizeBytes: buffer.length,
    });
  }

  return artifacts;
}
