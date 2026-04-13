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

export interface SessionAttachmentMount {
  filename: string;
  mountPath: string;
  storagePath?: string;
  mediaType: string;
}

function getUrlPath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function sanitizeSessionFilename(filename: string): string {
  const trimmed = filename.trim();
  // Normalize Unicode whitespace (e.g. U+202F narrow no-break space from macOS
  // timestamps) to ASCII space so the agent can reference the mount path.
  const normalizedSpaces = trimmed.replace(/[\s\u00A0\u202F]/g, " ");
  const withoutSlashes = normalizedSpaces.replaceAll("\\", "-").replaceAll("/", "-");
  return withoutSlashes.length > 0 ? withoutSlashes : "upload";
}

function buildUniqueFilename(filename: string, duplicateCount: number): string {
  if (duplicateCount === 0) {
    return filename;
  }

  const extensionIndex = filename.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === filename.length - 1) {
    return `${filename}-${duplicateCount + 1}`;
  }

  const base = filename.slice(0, extensionIndex);
  const extension = filename.slice(extensionIndex);
  return `${base}-${duplicateCount + 1}${extension}`;
}

export function buildSessionAttachmentMounts(
  fileParts: readonly ManagedFilePart[],
): SessionAttachmentMount[] {
  const seenCounts = new Map<string, number>();

  return fileParts.map((filePart) => {
    const sanitizedFilename = sanitizeSessionFilename(filePart.filename ?? "upload");
    const duplicateCount = seenCounts.get(sanitizedFilename) ?? 0;
    seenCounts.set(sanitizedFilename, duplicateCount + 1);

    const uniqueFilename = buildUniqueFilename(sanitizedFilename, duplicateCount);

    return {
      filename: uniqueFilename,
      mountPath: `/mnt/session/uploads/${uniqueFilename}`,
      ...(filePart.storagePath ? { storagePath: filePart.storagePath } : {}),
      mediaType: filePart.mediaType,
    };
  });
}

export async function uploadFilePartsToAnthropic(
  anthropic: Anthropic,
  fileParts: readonly ManagedFilePart[],
): Promise<UploadedAnthropicFile[]> {
  return Promise.all(
    fileParts.map(async (part) => {
      console.info("[managed-agents/files] fetching attachment for Anthropic upload", {
        filename: part.filename ?? "upload",
        mediaType: part.mediaType,
        storagePath: part.storagePath ?? null,
        urlPath: getUrlPath(part.url),
      });

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

      console.info("[managed-agents/files] uploaded attachment to Anthropic", {
        filename: part.filename ?? "upload",
        mediaType: file.type || part.mediaType || "application/octet-stream",
        storagePath: part.storagePath ?? null,
        anthropicFileId: uploaded.id,
      });

      return { fileId: uploaded.id, filename: part.filename ?? "upload" };
    }),
  );
}

export async function mountUploadedFilesToSession(options: {
  anthropic: Anthropic;
  sessionId: string;
  uploadedFiles: readonly UploadedAnthropicFile[];
  mountPaths?: readonly string[];
  logLabel: string;
}): Promise<void> {
  const mountedResourceIds: string[] = [];

  try {
    for (const [index, uploadedFile] of options.uploadedFiles.entries()) {
      const mountPath = options.mountPaths?.[index] ?? `/mnt/session/uploads/${uploadedFile.filename}`;
      console.info("[managed-agents/files] mounting attachment on existing session", {
        sessionId: options.sessionId,
        anthropicFileId: uploadedFile.fileId,
        filename: uploadedFile.filename,
        mountPath,
      });

      const mountedResource = await options.anthropic.beta.sessions.resources.add(
        options.sessionId,
        {
          type: "file",
          file_id: uploadedFile.fileId,
          mount_path: mountPath,
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
