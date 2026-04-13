/**
 * Shared chat file-part helpers for typed message rendering and download URLs.
 * @module components/chat/file-parts
 */
import type { FileUIPart, UIMessage } from "ai";

type BaseMessagePart = UIMessage["parts"][number];

export type ChatFilePart = FileUIPart & {
  storagePath?: string;
};

export type ChatMessagePart = Exclude<BaseMessagePart, { type: "file" }> | ChatFilePart;

export function resolveFilePartUrl(part: {
  url: string;
  filename?: string;
  storagePath?: string;
}): string {
  if (!part.storagePath) {
    return part.url;
  }

  const searchParams = new URLSearchParams({ path: part.storagePath });
  if (part.filename) {
    searchParams.set("filename", part.filename);
  }

  return `/api/files/download?${searchParams.toString()}`;
}
