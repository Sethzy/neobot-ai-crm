/**
 * Mirrors Anthropic session-scoped files into Supabase Storage.
 * @module lib/managed-agents/download-session-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import type { Database } from "@/types/database";

const BUCKET_ID = "agent-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
type DownloadSupabase = SupabaseClient<Database>;

export interface DownloadSessionFilesInput {
  supabase: DownloadSupabase;
  clientId: string;
  sessionId: string;
}

export interface DownloadedSessionFile {
  anthropicFileId: string;
  filename: string;
  mediaType: string;
  storagePath: string;
  signedUrl: string;
}

interface ListedSessionFile {
  id: string;
  filename: string;
  mime_type?: string;
  type?: string;
  /** Whether this file can be fetched via files.download(). Input files (user uploads) have downloadable=false. */
  downloadable?: boolean;
}

async function listSessionFiles(sessionId: string): Promise<ListedSessionFile[]> {
  const anthropic = getAnthropicClient();
  const page = await anthropic.beta.files.list({
    scope_id: sessionId,
    betas: ["managed-agents-2026-04-01"],
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
  // Single attempt — session files are available immediately after end_turn.
  // A retry loop here would block the HTTP stream close and delay the UI
  // becoming interactive.
  const files = await listSessionFiles(input.sessionId);

  // Input files uploaded by the user have downloadable=false — they cannot be
  // re-fetched via files.download(). Only mirror files the agent produced.
  const downloadableFiles = files.filter((f) => f.downloadable !== false);

  if (downloadableFiles.length === 0) {
    return [];
  }

  const anthropic = getAnthropicClient();
  const downloadedFiles: DownloadedSessionFile[] = [];

  for (const file of downloadableFiles) {
    const response = await anthropic.beta.files.download(file.id);
    const blob = await response.blob();
    const relativeStoragePath = `sessions/${input.sessionId}/${file.filename}`;
    const storagePath = `${input.clientId}/${relativeStoragePath}`;
    const mediaType =
      file.mime_type ??
      blob.type ??
      "application/octet-stream";

    const { error: uploadError } = await input.supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, await blob.arrayBuffer(), {
        contentType: mediaType,
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
      mediaType,
      storagePath: relativeStoragePath,
      signedUrl: signedUrlData.signedUrl,
    });
  }

  return downloadedFiles;
}
