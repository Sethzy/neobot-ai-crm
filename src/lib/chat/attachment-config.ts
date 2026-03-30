/**
 * Shared chat attachment upload and model-visibility configuration.
 * @module lib/chat/attachment-config
 */

/** MIME types accepted by the chat upload route and composer. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/json",
]);

/** Browser file-input accept string for chat attachments. */
export const CHAT_ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  ".docx,.doc,.pptx,.ppt",
  ".xlsx,.xls,.csv",
  ".txt,.md,.html,.xml,.json",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
].join(",");

/** Max chat upload size in bytes. */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/** MIME types that Gemini can receive directly as file parts without crashing. */
export const MODEL_VISIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Returns true when a file part is safe to pass straight to Gemini. */
export function isModelVisible(mediaType: string): boolean {
  return MODEL_VISIBLE_TYPES.has(mediaType);
}
