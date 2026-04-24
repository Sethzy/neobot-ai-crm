/**
 * Files tab for CRM record drawers.
 * @module components/crm/record-drawer/drawer-files-tab
 */
"use client";

import { useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { Paperclip, Plus, Upload } from "lucide-react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";

import { AttachmentRow } from "@/components/crm/record-drawer/attachment-row";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteAttachment,
  useRecordAttachments,
  useRenameAttachment,
  useUploadAttachment,
} from "@/hooks/use-record-attachments";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";
import { type RecordAttachment } from "@/lib/crm/schemas";

interface DrawerFilesTabProps {
  /** CRM record type that owns the attachments. */
  recordType: RecordAttachment["record_type"];
  /** CRM record id that owns the attachments. */
  recordId: string;
}

function formatDropRejection(rejection: FileRejection): string {
  const firstIssue = rejection.errors[0]?.message;
  return firstIssue ?? `Unable to upload ${rejection.file.name}.`;
}

/**
 * Renders the Files tab with upload, rename, download, and delete actions.
 */
export function DrawerFilesTab({ recordType, recordId }: DrawerFilesTabProps) {
  const { data: attachments = [], isLoading, isError, refetch } = useRecordAttachments(recordType, recordId);
  const uploadAttachment = useUploadAttachment();
  const renameAttachment = useRenameAttachment();
  const deleteAttachment = useDeleteAttachment();
  const [isUploading, setIsUploading] = useState(false);

  const dropzoneAccept = useMemo(
    () => Object.fromEntries(Array.from(ALLOWED_UPLOAD_TYPES).map((mediaType) => [mediaType, [] as string[]])),
    [],
  );

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      for (const file of files) {
        try {
          await uploadAttachment.mutateAsync({ file, recordType, recordId });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Failed to upload ${file.name}.`);
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: true,
    maxSize: MAX_UPLOAD_SIZE_BYTES,
    accept: dropzoneAccept,
    onDropAccepted: (acceptedFiles) => {
      void handleUploadFiles(acceptedFiles);
    },
    onDropRejected: (rejections) => {
      for (const rejection of rejections) {
        toast.error(formatDropRejection(rejection));
      }
    },
  });

  const handleDownload = async (attachment: RecordAttachment) => {
    try {
      const downloadUrl = new URL("/api/files/download", window.location.origin);
      downloadUrl.searchParams.set("path", attachment.storage_path);
      downloadUrl.searchParams.set("filename", attachment.filename);

      const response = await fetch(downloadUrl.toString());
      if (!response.ok) {
        throw new Error("Failed to download file.");
      }

      const blob = await response.blob();
      saveAs(blob, attachment.filename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download file.");
    }
  };

  const handleRename = async (attachmentId: string, nextFilename: string) => {
    try {
      await renameAttachment.mutateAsync({
        attachmentId,
        filename: nextFilename,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename file.");
    }
  };

  const handleDelete = async (attachment: RecordAttachment) => {
    try {
      await deleteAttachment.mutateAsync({
        attachmentId: attachment.attachment_id,
        storagePath: attachment.storage_path,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete file.");
    }
  };

  const renderAddFileButton = (variant: "outline" | "ghost") => (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={isUploading}
      onClick={() => open()}
    >
      <Plus className="h-3.5 w-3.5" />
      Add file
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-7 w-24" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Failed to load files.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { void refetch(); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className="relative space-y-3">
      <input {...getInputProps()} />

      {attachments.length === 0 ? (
        isDragActive ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-center">
            <Upload className="h-6 w-6 text-primary/70" />
            <p className="text-sm font-medium text-foreground">Upload files</p>
            <p className="text-xs text-muted-foreground">Drag and Drop Here</p>
          </div>
        ) : (
          <Empty className="border-border/50 bg-card/30">
            <EmptyContent>
              <EmptyMedia variant="icon">
                <Paperclip className="h-4 w-4" />
              </EmptyMedia>
              <EmptyTitle>No Files</EmptyTitle>
              <EmptyDescription>There are no associated files with this record.</EmptyDescription>
              {renderAddFileButton("outline")}
            </EmptyContent>
          </Empty>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground/85">All {attachments.length}</p>
            {renderAddFileButton("ghost")}
          </div>

          <div className="relative space-y-2">
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.attachment_id}
                attachment={attachment}
                onDownload={handleDownload}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}

            {isDragActive ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-background/90 text-center backdrop-blur-xs">
                <Upload className="h-6 w-6 text-primary/70" />
                <p className="text-sm font-medium text-foreground">Upload files</p>
                <p className="text-xs text-muted-foreground">Drag and Drop Here</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
