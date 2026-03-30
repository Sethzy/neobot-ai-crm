/**
 * Telegram media download helpers for inbound uploads.
 * Adapts dorabot's local-file download flow to Supabase Storage uploads.
 * @module lib/channels/telegram/media
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Api } from "grammy";

import type { Database } from "@/types/database";

const TELEGRAM_UPLOAD_BUCKET = "agent-files";
const TELEGRAM_UPLOAD_URL_EXPIRY_SECONDS = 60 * 60;

const MEDIA_FALLBACKS: Record<string, { ext: string; mime: string }> = {
  photo: { ext: "jpg", mime: "image/jpeg" },
  video: { ext: "mp4", mime: "video/mp4" },
  audio: { ext: "mp3", mime: "audio/mpeg" },
  voice: { ext: "ogg", mime: "audio/ogg" },
  video_note: { ext: "mp4", mime: "video/mp4" },
  animation: { ext: "mp4", mime: "video/mp4" },
  document: { ext: "bin", mime: "application/octet-stream" },
};

/** Returns fallback extension and MIME type for one Telegram media type. */
export function getMediaFallbacks(mediaType: string): { ext: string; mime: string } {
  return MEDIA_FALLBACKS[mediaType] ?? {
    ext: "bin",
    mime: "application/octet-stream",
  };
}

/**
 * Resolves the Telegram file_id for one message/media type. Photos are arrays
 * of progressively larger sizes, so the last item is used.
 */
export function resolveFileId(
  mediaType: string,
  message: Record<string, unknown>,
): string | null {
  if (mediaType === "photo") {
    const photos = message.photo as Array<{ file_id: string }> | undefined;
    if (!photos?.length) {
      return null;
    }

    return photos[photos.length - 1]?.file_id ?? null;
  }

  const media = message[mediaType] as { file_id?: string } | undefined;
  return media?.file_id ?? null;
}

/**
 * Downloads one Telegram file and uploads it into the unified agent-files
 * bucket, returning a signed URL and workspace-relative storage path.
 */
export async function downloadAndStoreTelegramFile(
  api: Api,
  supabase: SupabaseClient<Database>,
  clientId: string,
  fileId: string,
  fallbackExt: string,
  fallbackMime: string,
): Promise<{ url: string; mimeType: string; storagePath: string } | null> {
  try {
    const file = await api.getFile(fileId);
    const filePath = file.file_path;

    if (!filePath) {
      return null;
    }

    const extension = filePath.includes(".")
      ? filePath.split(".").pop() || fallbackExt
      : fallbackExt;
    const mimeType = fallbackMime;
    const downloadUrl = `https://api.telegram.org/file/bot${api.token}/${filePath}`;
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const relativeStoragePath = `uploads/telegram/${Date.now()}_${file.file_unique_id}.${extension}`;
    const storagePath = `${clientId}/${relativeStoragePath}`;
    const { error } = await supabase.storage
      .from(TELEGRAM_UPLOAD_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType });

    if (error) {
      console.error("[telegram/media] Storage upload failed:", error);
      return null;
    }

    const signedUrlResponse = await supabase.storage
      .from(TELEGRAM_UPLOAD_BUCKET)
      .createSignedUrl(storagePath, TELEGRAM_UPLOAD_URL_EXPIRY_SECONDS);

    if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
      console.error("[telegram/media] Failed to sign upload:", signedUrlResponse.error);
      return null;
    }

    return {
      url: signedUrlResponse.data.signedUrl,
      mimeType,
      storagePath: relativeStoragePath,
    };
  } catch (error) {
    console.error("[telegram/media] Download failed:", error);
    return null;
  }
}
