/**
 * Generates a thread title from the first user message.
 * @module lib/chat/thread-title
 */

const MAX_TITLE_LENGTH = 50;

/**
 * Derives a short thread title from a user message.
 * Uses the first line, truncated to 50 chars with ellipsis if needed.
 * @returns Title string or null if the message is empty.
 */
export function generateThreadTitle(message: string): string | null {
  const firstLine = message.split("\n")[0].trim();

  if (firstLine.length === 0) {
    return null;
  }

  if (firstLine.length <= MAX_TITLE_LENGTH) {
    return firstLine;
  }

  return firstLine.slice(0, MAX_TITLE_LENGTH) + "...";
}
