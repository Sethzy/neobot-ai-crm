/**
 * Shared helpers for extracting text from AI SDK message content and stored parts.
 * @module lib/runner/message-utils
 */

/**
 * Extracts plain text from AI SDK message content or stored JSON parts.
 *
 * Handles three shapes:
 * - `string` — returned trimmed.
 * - `Array<{ type: "text", text: string }>` — text parts joined with newlines.
 * - anything else — empty string.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (part): part is { type: string; text?: string } =>
        typeof part === "object" && part !== null && "type" in part,
    )
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text).trim())
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}
