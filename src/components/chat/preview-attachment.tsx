/**
 * Shared thumbnail preview for chat attachments in the composer and message list.
 * @module components/chat/preview-attachment
 */
import { X } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export interface Attachment {
  filename: string;
  url: string;
  contentType: string;
}

interface PreviewAttachmentProps {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
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
}: PreviewAttachmentProps) {
  const { filename, url, contentType } = attachment;

  return (
    <div
      className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
      data-testid="input-attachment-preview"
    >
      {contentType.startsWith("image/") ? (
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
      )}

      {isUploading ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-4 text-white" />
        </div>
      ) : null}

      {onRemove ? (
        <Button
          aria-label={`Remove ${filename}`}
          className="absolute right-0.5 top-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          onClick={onRemove}
          size="sm"
          type="button"
          variant="destructive"
        >
          <X className="size-2" />
        </Button>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
        {filename}
      </div>
    </div>
  );
}
