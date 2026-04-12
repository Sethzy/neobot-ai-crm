/**
 * Parses text and file parts from an AI SDK message's `parts` array.
 *
 * Used by `POST /api/chat/send` to extract user input from the message
 * payload before forwarding to the Anthropic session.
 *
 * @module lib/chat/extract-user-input
 */
import type { ManagedFilePart } from "@/lib/managed-agents/types";

export interface ExtractedUserInput {
  /** Joined text from all text parts, or null if empty. */
  text: string | null;
  /** File attachment metadata. */
  fileParts: ManagedFilePart[];
}

/**
 * Extract text and file attachments from a message's `parts` array.
 *
 * Text parts are trimmed, joined with newlines, and returned as a single
 * string (or null if empty). File parts are normalized into
 * `ManagedFilePart` shape. Unknown part types are silently skipped.
 */
export function extractUserInput(message: {
  parts: unknown[];
}): ExtractedUserInput {
  const textChunks: string[] = [];
  const fileParts: ManagedFilePart[] = [];

  for (const part of message.parts) {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      continue;
    }

    const typed = part as Record<string, unknown>;

    if (typed.type === "text" && typeof typed.text === "string") {
      const trimmed = (typed.text as string).trim();
      if (trimmed.length > 0) {
        textChunks.push(trimmed);
      }
    } else if (
      typed.type === "file" &&
      typeof typed.url === "string" &&
      typeof typed.mediaType === "string"
    ) {
      fileParts.push({
        type: "file",
        url: typed.url as string,
        mediaType: typed.mediaType as string,
        ...(typeof typed.filename === "string"
          ? { filename: typed.filename as string }
          : {}),
        ...(typeof typed.storagePath === "string"
          ? { storagePath: typed.storagePath as string }
          : {}),
      });
    }
  }

  const joinedText = textChunks.join("\n").trim();
  return {
    text: joinedText.length > 0 ? joinedText : null,
    fileParts,
  };
}
