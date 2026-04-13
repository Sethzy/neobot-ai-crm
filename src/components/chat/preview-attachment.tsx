/**
 * Shared thumbnail preview for chat attachments in the composer and message list.
 * @module components/chat/preview-attachment
 */
import { X } from "@/components/icons/lucide-compat";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Attachment {
  filename: string;
  url: string;
  contentType: string;
  storagePath?: string;
}

interface PreviewAttachmentProps {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  /** When provided, image thumbnails become clickable and call this with the image URL. */
  onImageClick?: (url: string) => void;
}

function getFileTypeLabel(contentType: string): string {
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

  if (contentType.startsWith("text/")) {
    return "Text";
  }

  return "File";
}

export function PreviewAttachment({
  attachment,
  isUploading = false,
  onRemove,
  onImageClick,
}: PreviewAttachmentProps) {
  const { filename, url, contentType } = attachment;

  const previewContent = contentType.startsWith("image/") ? (
    <img
      alt={filename || "An image attachment"}
      className="size-full object-cover"
      height={64}
      src={url}
      width={64}
    />
  ) : (
    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
      {getFileTypeLabel(contentType)}
    </div>
  );

  const filenameLabel = (
    <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
      {filename}
    </div>
  );

  const tileBody = !isUploading && url ? (
    contentType.startsWith("image/") && onImageClick ? (
      <button
        type="button"
        aria-label={filename}
        className="block size-full cursor-zoom-in"
        onClick={() => onImageClick(url)}
      >
        {previewContent}
        {filenameLabel}
      </button>
    ) : (
      <a
        aria-label={filename}
        className="block size-full"
        href={url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {previewContent}
        {filenameLabel}
      </a>
    )
  ) : (
    <div className="size-full">
      {previewContent}
      {filenameLabel}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Outer div is the positioning context + hover group for the X button */}
        <div className="group relative" data-testid="input-attachment-preview">
          {/* Tile: dims subtly on hover via transition-opacity */}
          <div className="size-14 overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-75">
            {tileBody}

            {isUploading ? (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/50"
                data-testid="input-attachment-loader"
              >
                <Spinner className="size-4 text-white" />
              </div>
            ) : null}
          </div>

          {/*
           * X button: hidden by default, revealed on group hover.
           * White circle with black icon; icon turns destructive red on button hover.
           */}
          {onRemove ? (
            <button
              aria-label={`Remove ${filename}`}
              className="absolute right-1.5 top-1.5 z-10 flex size-3.5 items-center justify-center rounded-full bg-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 [&_svg]:text-black hover:[&_svg]:text-destructive"
              onClick={onRemove}
              type="button"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </TooltipTrigger>
      {filename ? (
        <TooltipContent side="top">{filename}</TooltipContent>
      ) : null}
    </Tooltip>
  );
}
