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

export async function uploadFilePartsToAnthropic(
  anthropic: Anthropic,
  fileParts: readonly ManagedFilePart[],
): Promise<Array<{ fileId: string; filename: string }>> {
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
