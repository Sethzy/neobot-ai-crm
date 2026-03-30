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

export function resolveFilePartUrl(part: { url: string; storagePath?: string }): string {
  if (!part.storagePath) {
    return part.url;
  }

  return `/api/files/download?path=${encodeURIComponent(part.storagePath)}`;
}
