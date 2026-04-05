/**
 * Single file row in the Files tab attachment list.
 * @module components/crm/record-drawer/attachment-row
 */
"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Calendar,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  MoreVertical,
  Pencil,
  Presentation,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { type RecordAttachment } from "@/lib/crm/schemas";
import { FILETYPE_COLOR_CLASSES } from "@/lib/ui/color-maps";
import { cn } from "@/lib/utils";

interface AttachmentRowProps {
  /** Attachment rendered in this row. */
  attachment: RecordAttachment;
  /** Called when the user downloads the attachment. */
  onDownload: (attachment: RecordAttachment) => Promise<void> | void;
  /** Called when the user saves a renamed filename. */
  onRename: (attachmentId: string, nextFilename: string) => Promise<void> | void;
  /** Called when the user deletes the attachment. */
  onDelete: (attachment: RecordAttachment) => Promise<void> | void;
}

const CATEGORY_ICONS = {
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: FileImage,
  other: File,
} as const;

function splitFilename(filename: string): { baseName: string; extension: string } {
  const lastDotIndex = filename.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return { baseName: filename, extension: "" };
  }

  return {
    baseName: filename.slice(0, lastDotIndex),
    extension: filename.slice(lastDotIndex),
  };
}

/**
 * Renders one attachment row with inline rename and a context menu.
 */
export function AttachmentRow({
  attachment,
  onDownload,
  onRename,
  onDelete,
}: AttachmentRowProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const { baseName, extension } = splitFilename(attachment.filename);
  const Icon = CATEGORY_ICONS[attachment.file_category] ?? File;
  const extensionKey = extension.replace(".", "").toLowerCase();
  const iconToneClass = FILETYPE_COLOR_CLASSES[extensionKey] ?? "text-muted-foreground";

  const handleStartRename = () => {
    setRenameValue(baseName);
    setIsRenaming(true);
  };

  const handleCancelRename = () => {
    setRenameValue("");
    setIsRenaming(false);
  };

  const handleCommitRename = async () => {
    const trimmedValue = renameValue.trim();

    if (!trimmedValue) {
      handleCancelRename();
      return;
    }

    const nextFilename = `${trimmedValue}${extension}`;

    if (nextFilename !== attachment.filename) {
      await onRename(attachment.attachment_id, nextFilename);
    }

    handleCancelRename();
  };

  return (
    <div
      data-testid="attachment-row"
      className="group flex items-center gap-3 rounded-lg border border-border/40 bg-card/70 px-3 py-2 transition-colors hover:border-border"
    >
      <Icon className={cn("h-5 w-5 shrink-0", iconToneClass)} />

      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            className="h-7 text-sm"
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => {
              void handleCommitRename();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCommitRename();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                handleCancelRename();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="block max-w-full truncate text-left text-sm font-medium text-foreground/90 hover:underline"
            onClick={() => {
              void onDownload(attachment);
            }}
          >
            {attachment.filename}
          </button>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <Calendar className="h-3 w-3" />
        <span>{formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true })}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            aria-label="Options"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              void onDownload(attachment);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleStartRename}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              void onDelete(attachment);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
