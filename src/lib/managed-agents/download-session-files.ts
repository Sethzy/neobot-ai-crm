/**
 * Mirrors Anthropic session-scoped files into Supabase Storage.
 * @module lib/managed-agents/download-session-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import type { Database } from "@/types/database";

const BUCKET_ID = "agent-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

type DownloadSupabase = SupabaseClient<Database>;

export interface DownloadSessionFilesInput {
  supabase: DownloadSupabase;
  clientId: string;
  sessionId: string;
}

export interface DownloadedSessionFile {
  anthropicFileId: string;
  filename: string;
  storagePath: string;
  signedUrl: string;
}

interface ListedSessionFile {
  id: string;
  filename: string;
  mime_type?: string;
  type?: string;
}

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function listSessionFiles(sessionId: string): Promise<ListedSessionFile[]> {
  const anthropic = getAnthropicClient();
  const page = await anthropic.beta.files.list({
    scope_id: sessionId,
  });

  if (Array.isArray((page as { data?: unknown[] }).data)) {
    return (page as { data: ListedSessionFile[] }).data;
  }

  const listedFiles: ListedSessionFile[] = [];
  for await (const file of page as AsyncIterable<ListedSessionFile>) {
    listedFiles.push(file);
  }

  return listedFiles;
}

/**
 * Lists, downloads, and mirrors session files into the tenant's storage area.
 */
export async function downloadSessionFiles(
  input: DownloadSessionFilesInput,
): Promise<DownloadedSessionFile[]> {
  let files: ListedSessionFile[] = [];

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    files = await listSessionFiles(input.sessionId);
    if (files.length > 0) {
      break;
    }

    const retryDelayMs = RETRY_DELAYS_MS[attempt];
    if (retryDelayMs === undefined) {
      break;
    }

    await delay(retryDelayMs);
  }

  if (files.length === 0) {
    return [];
  }

  const anthropic = getAnthropicClient();
  const downloadedFiles: DownloadedSessionFile[] = [];

  for (const file of files) {
    const response = await anthropic.beta.files.download(file.id);
    const blob = await response.blob();
    const relativeStoragePath = `sessions/${input.sessionId}/${file.filename}`;
    const storagePath = `${input.clientId}/${relativeStoragePath}`;

    const { error: uploadError } = await input.supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, await blob.arrayBuffer(), {
        contentType:
          file.mime_type ??
          blob.type ??
          "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error("[download-session-files] upload failed:", uploadError);
      continue;
    }

    const { data: signedUrlData, error: signedUrlError } = await input.supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("[download-session-files] signed URL failed:", signedUrlError);
      continue;
    }

    downloadedFiles.push({
      anthropicFileId: file.id,
      filename: file.filename,
      storagePath: relativeStoragePath,
      signedUrl: signedUrlData.signedUrl,
    });
  }

  return downloadedFiles;
}
