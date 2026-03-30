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
