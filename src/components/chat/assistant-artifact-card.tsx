/**
 * Assistant-only artifact card for downloadable file outputs in chat.
 * Keeps assistant deliverables visually distinct from compact user-upload previews.
 * @module components/chat/assistant-artifact-card
 */
"use client";

import { DownloadIcon, FileImageIcon, FileTextIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Attachment } from "./preview-attachment";

interface AssistantArtifactCardProps {
  attachment: Attachment;
  /** Human-readable name from the agent's markdown link label. Preferred over raw filename. */
  displayName?: string;
  onImageClick?: (url: string) => void;
}

function getArtifactTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") {
    return "PDF";
  }

  if (
    contentType === "application/msword"
    || contentType.includes("wordprocessingml")
  ) {
    return "Word";
  }

  if (
    contentType === "application/vnd.ms-excel"
    || contentType.includes("spreadsheetml")
  ) {
    return "Excel";
  }

  if (
    contentType === "application/vnd.ms-powerpoint"
    || contentType.includes("presentationml")
  ) {
    return "Slides";
  }

  if (contentType === "text/csv") {
    return "CSV";
  }

  if (contentType === "application/json") {
    return "JSON";
  }

  if (contentType.startsWith("image/")) {
    return "Image";
  }

  if (contentType === "text/markdown") {
    return "Markdown";
  }

  if (contentType.startsWith("text/")) {
    return "Text";
  }

  return "File";
}

export function AssistantArtifactCard({
  attachment,
  displayName,
  onImageClick,
}: AssistantArtifactCardProps) {
  const { filename, url, contentType } = attachment;
  const typeLabel = getArtifactTypeLabel(contentType);
  const isImage = contentType.startsWith("image/");
  // Prefer the actual filename over generic agent labels like "Download CSV".
  // displayName comes from markdown link text (e.g. "[Download CSV](...)") which
  // is less informative than the real filename when we have one.
  const isGenericLabel = displayName
    ? /^download\b/i.test(displayName.trim())
    : false;
  const title = (!displayName || isGenericLabel) ? filename : displayName;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 transition-colors hover:bg-muted/40"
      data-testid="assistant-artifact-card"
    >
      <div className="flex size-9 shrink-0 items-center justify-center text-muted-foreground/70">
        {isImage ? <FileImageIcon className="size-5" /> : <FileTextIcon className="size-5" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{typeLabel}</p>
      </div>

      {isImage && onImageClick ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Open ${title}`}
              className="shrink-0 rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => onImageClick(url)}
            >
              <FileImageIcon className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Open</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              aria-label={`Download ${title}`}
              className="shrink-0 rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              href={url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <DownloadIcon className="size-[18px]" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">Download</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
