/**
 * Attaches uploaded files to an active Anthropic Managed Agents session.
 * @module lib/managed-agents/attach-session-file
 */
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";

export interface AttachSessionFileInput {
  sessionId: string | null;
  file: Blob;
  filename: string;
}

export type AttachSessionFileResult =
  | { attached: true; anthropicFileId: string }
  | { attached: false };

/**
 * Uploads the given file to Anthropic and mounts it into the active session.
 */
export async function attachFileToSession(
  input: AttachSessionFileInput,
): Promise<AttachSessionFileResult> {
  if (!input.sessionId) {
    return { attached: false };
  }

  const anthropic = getAnthropicClient();
  const uploaded = await anthropic.beta.files.upload({
    file: new File([input.file], input.filename, {
      type: input.file.type || "application/octet-stream",
    }),
  });

  await anthropic.beta.sessions.resources.add(input.sessionId, {
    type: "file",
    file_id: uploaded.id,
  });

  return {
    attached: true,
    anthropicFileId: uploaded.id,
  };
}
