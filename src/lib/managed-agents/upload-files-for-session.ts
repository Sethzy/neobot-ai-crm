/**
 * Uploads chat attachment file parts to Anthropic ahead of session creation.
 *
 * This helper is used for first-turn attachments, where the files are known
 * before we create the Managed Agents session and can therefore be mounted via
 * `sessions.create({ resources })` instead of attached one-by-one afterward.
 *
 * @module lib/managed-agents/upload-files-for-session
 */
import type Anthropic from "@anthropic-ai/sdk";

import type { ManagedFilePart } from "./types";

export interface UploadedAnthropicFile {
  fileId: string;
  filename: string;
}

export async function uploadFilePartsToAnthropic(
  anthropic: Anthropic,
  fileParts: readonly ManagedFilePart[],
): Promise<UploadedAnthropicFile[]> {
  return Promise.all(
    fileParts.map(async (part) => {
      const response = await fetch(part.url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch attachment ${part.filename ?? "(unnamed)"} (${response.status})`,
        );
      }

      const file = await response.blob();
      const uploaded = await anthropic.beta.files.upload({
        file: new File([file], part.filename ?? "upload", {
          type: file.type || part.mediaType || "application/octet-stream",
        }),
      } as never);

      return { fileId: uploaded.id, filename: part.filename ?? "upload" };
    }),
  );
}

export async function mountUploadedFilesToSession(options: {
  anthropic: Anthropic;
  sessionId: string;
  uploadedFiles: readonly UploadedAnthropicFile[];
  logLabel: string;
}): Promise<void> {
  const mountedResourceIds: string[] = [];

  try {
    for (const uploadedFile of options.uploadedFiles) {
      const mountedResource = await options.anthropic.beta.sessions.resources.add(
        options.sessionId,
        {
          type: "file",
          file_id: uploadedFile.fileId,
        } as never,
      );

      mountedResourceIds.push(mountedResource.id);
    }
  } catch (error) {
    for (let index = mountedResourceIds.length - 1; index >= 0; index -= 1) {
      const resourceId = mountedResourceIds[index];
      if (!resourceId) {
        continue;
      }

      try {
        await options.anthropic.beta.sessions.resources.delete(resourceId, {
          session_id: options.sessionId,
        } as never);
      } catch (cleanupError) {
        console.error(
          `[${options.logLabel}] failed to roll back mounted session resource ${resourceId}:`,
          cleanupError,
        );
      }
    }

    throw error;
  }
}
