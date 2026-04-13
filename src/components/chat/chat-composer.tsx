/**
 * Chat input composer with multi-file attachments, pasted file support, and stop/send controls.
 * @module components/chat/chat-composer
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { ModelSelector } from "@/components/ai-elements/model-selector";
import { Paperclip } from "@/components/icons/lucide-compat";
import { cn } from "@/lib/utils";
import { CHAT_ATTACHMENT_ACCEPT } from "@/lib/chat/attachment-config";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { ChatStatus } from "@/types/chat";

import type { ChatFilePart } from "./file-parts";
import { PreviewAttachment, type Attachment } from "./preview-attachment";

interface ChatSubmitInput {
  text: string;
  files: ChatFilePart[];
}

interface ChatComposerProps {
  status: ChatStatus;
  /** Currently selected model ID for the next outgoing chat message. */
  selectedChatModel: string;
  /** Current text value of the composer (controlled). */
  value: string;
  /** Called when the composer text changes (typing, clearing on submit). */
  onValueChange: (value: string) => void;
  /** Called when the user picks a different model from the selector. */
  onSelectedChatModelChange: (modelId: string) => void;
  onSubmit: (message: ChatSubmitInput) => void;
  onStop?: () => void;
  /** Optional CSS class for the outer wrapper div. */
  className?: string;
  /** Optional CSS class for the inner max-width container. */
  innerClassName?: string;
  /** Custom placeholder text for the textarea. */
  placeholder?: string;
  /** When true, disables the composer (e.g. quota exhausted). */
  disabled?: boolean;
  /** When true, disables the model selector (session pinned — switching not possible).
   *  The selector remains visible to preserve layout. */
  hideModelSelector?: boolean;
}

const PASTEABLE_FILE_TYPES = new Set([
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function toFilePart(attachment: Attachment): ChatFilePart {
  return {
    type: "file",
    url: attachment.url,
    filename: attachment.filename,
    mediaType: attachment.contentType,
    ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
  };
}

function removeQueuedFilenames(currentQueue: string[], filenamesToRemove: string[]): string[] {
  const remainingCounts = new Map<string, number>();

  for (const filename of filenamesToRemove) {
    remainingCounts.set(filename, (remainingCounts.get(filename) ?? 0) + 1);
  }

  return currentQueue.filter((filename) => {
    const remaining = remainingCounts.get(filename) ?? 0;
    if (remaining === 0) {
      return true;
    }

    remainingCounts.set(filename, remaining - 1);
    return false;
  });
}

export function ChatComposer({
  status,
  selectedChatModel,
  value,
  onValueChange,
  onSelectedChatModelChange,
  onSubmit,
  onStop,
  className,
  innerClassName,
  placeholder,
  disabled = false,
  hideModelSelector = false,
}: ChatComposerProps) {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isStreaming = status === "streaming";
  const isGenerating = status === "submitted" || isStreaming;
  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const isSubmitDisabled =
    uploadQueue.length > 0 ||
    status === "submitted" ||
    (!isGenerating && !hasContent) ||
    (!isGenerating && disabled);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    try {
      const presignResponse = await fetch("/api/files/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!presignResponse.ok) {
        const payload = await presignResponse.json().catch(() => null) as { error?: string } | null;
        toast.error(payload?.error ?? "Failed to prepare upload.");
        return null;
      }

      const { path, token, storagePath } = await presignResponse.json() as {
        path: string;
        token: string;
        storagePath: string;
      };

      const { error: uploadError } = await supabase.storage
        .from("agent-files")
        .uploadToSignedUrl(path, token, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        toast.error("Failed to upload file.");
        return null;
      }

      const confirmResponse = await fetch("/api/files/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!confirmResponse.ok) {
        const payload = await confirmResponse.json().catch(() => null) as { error?: string } | null;
        toast.error(payload?.error ?? "Failed to confirm upload.");
        return null;
      }

      const payload = await confirmResponse.json() as {
        url: string;
        storagePath: string;
        pathname: string;
        contentType: string;
      };

      return {
        url: payload.url,
        filename: payload.pathname,
        contentType: payload.contentType,
        storagePath: payload.storagePath,
      };
    } catch {
      toast.error("Failed to upload file.");
      return null;
    }
  }, [supabase]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const queuedFilenames = files.map((file) => file.name);
    setUploadQueue((currentQueue) => [...currentQueue, ...queuedFilenames]);

    try {
      const uploadedAttachments = await Promise.all(files.map((file) => uploadFile(file)));
      const successfulUploads = uploadedAttachments.filter(
        (attachment): attachment is Attachment => attachment !== null,
      );

      if (successfulUploads.length > 0) {
        setAttachments((currentAttachments) => [...currentAttachments, ...successfulUploads]);
      }
    } finally {
      setUploadQueue((currentQueue) => removeQueuedFilenames(currentQueue, queuedFilenames));
    }
  }, [uploadFile]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const files = Array.from(inputElement.files ?? []);
    inputElement.value = "";
    await uploadFiles(files);
  }, [uploadFiles]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.currentTarget.value);
  }, [onValueChange]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) =>
        item.kind === "file"
        && (item.type.startsWith("image/") || PASTEABLE_FILE_TYPES.has(item.type))
      )
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void uploadFiles(imageFiles);
  }, [uploadFiles]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      void uploadFiles(files);
    }
  }, [uploadFiles]);

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    if (isGenerating || uploadQueue.length > 0 || disabled) {
      return;
    }

    const text = message.text.trim();
    if (text.length === 0 && attachments.length === 0) {
      return;
    }

    onSubmit({
      text,
      files: attachments.map(toFilePart),
    });

    onValueChange("");
    setAttachments([]);
  }, [
    attachments,
    isGenerating,
    disabled,
    onSubmit,
    onValueChange,
    uploadQueue.length,
  ]);

  return (
    <div
      className={cn("px-4 pb-4", className)}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className={cn(
        "mx-auto max-w-[44rem] rounded-2xl transition-all",
        isDragOver && "ring-2 ring-ring/20 border-dashed bg-accent/50",
        innerClassName,
      )}>
        <input
          accept={CHAT_ATTACHMENT_ACCEPT}
          aria-label="Upload attachments"
          className="hidden"
          multiple
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />

        <PromptInput onSubmit={handleSubmit}>
          {(attachments.length > 0 || uploadQueue.length > 0) && (
            <div className="flex w-full flex-wrap gap-2 p-2" data-testid="composer-attachments">
              {attachments.map((attachment) => (
                <PreviewAttachment
                  attachment={attachment}
                  key={attachment.url}
                  onRemove={() => {
                    setAttachments((currentAttachments) =>
                      currentAttachments.filter(({ url }) => url !== attachment.url),
                    );
                  }}
                />
              ))}

              {uploadQueue.map((filename, index) => (
                <PreviewAttachment
                  attachment={{
                    filename,
                    url: "",
                    contentType: "",
                  }}
                  isUploading
                  key={`${filename}-${index}`}
                />
              ))}
            </div>
          )}

          <PromptInputTextarea
            placeholder={placeholder ?? "Send a message..."}
            value={value}
            onChange={handleChange}
            onPaste={handlePaste}
            disabled={isGenerating || disabled}
          />

          <PromptInputFooter className="items-center">
            <PromptInputTools className="text-foreground">
              <ModelSelector
                disabled={isGenerating || disabled}
                onValueChange={(modelId) => {
                  if (hideModelSelector) {
                    toast("Start a new chat to switch models.", {
                      action: { label: "New Chat", onClick: () => router.push("/chat") },
                    });
                    return;
                  }
                  onSelectedChatModelChange(modelId);
                }}
                value={selectedChatModel}
              />
            </PromptInputTools>

            <PromptInputTools className="gap-0.5">
              <PromptInputButton
                aria-label="Attach files"
                disabled={isGenerating || disabled}
                onClick={() => fileInputRef.current?.click()}
                variant="ghost"
              >
                <Paperclip className="size-4" />
              </PromptInputButton>

              <PromptInputSubmit
                status={status}
                disabled={isSubmitDisabled}
                onStop={onStop}
              />
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
