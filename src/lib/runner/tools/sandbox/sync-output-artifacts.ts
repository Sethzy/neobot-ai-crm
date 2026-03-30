/**
 * Syncs output files from sandbox back to Supabase Storage.
 *
 * Called after each `bash` command to make artifacts available as download
 * URLs in the same agent run. Uses SHA-256 hashing to skip unchanged files.
 *
 * @module lib/runner/tools/sandbox/sync-output-artifacts
 */
import { createHash } from "node:crypto";

import type { SyncedArtifact } from "./types";

const OUTPUT_DIR = "/vercel/sandbox/workspace/output";

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
  /** Current run ID for artifact namespacing. */
  runId: string;
  /** Mutable map of path → SHA-256 hash from prior sync calls. */
  priorHashes: Map<string, string>;
}

/**
 * Scans `/vercel/sandbox/workspace/output/` for files, uploads new or changed
 * ones to Supabase Storage, and returns download URLs.
 */
export async function syncOutputArtifacts(
  options: SyncOutputOptions,
): Promise<SyncedArtifact[]> {
  const { sandbox, fileClient, runId, priorHashes } = options;

  // List files in output directory
  const listResult = await sandbox.runCommand("bash", [
    "-c",
    `find ${OUTPUT_DIR} -type f 2>/dev/null | sort`,
  ]);
  const stdout = await listResult.stdout();

  if (listResult.exitCode !== 0 || !stdout.trim()) {
    return [];
  }

  const filePaths = stdout.trim().split("\n").filter(Boolean);
  const artifacts: SyncedArtifact[] = [];

  for (const absolutePath of filePaths) {
    const relativePath = absolutePath.replace(`${OUTPUT_DIR}/`, "");

    // Download file from sandbox
    const buffer = await sandbox.readFileToBuffer({ path: absolutePath });
    if (!buffer) continue;

    // Check hash to skip unchanged files
    const hash = createHash("sha256").update(buffer).digest("hex");
    if (priorHashes.get(relativePath) === hash) continue;
    priorHashes.set(relativePath, hash);

    // Upload to Supabase Storage via the real uploadArtifact API
    const contentType = inferContentType(relativePath);
    const artifactPath = `artifacts/sandbox/${runId}/${relativePath}`;

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
