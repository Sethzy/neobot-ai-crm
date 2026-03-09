/**
 * Chat input composer with image uploads, pasted-image support, and stop/send controls.
 * @module components/chat/chat-composer
 */
"use client";

import type { FileUIPart } from "ai";
import { useCallback, useRef, useState } from "react";
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
import { Paperclip } from "@/components/icons/lucide-compat";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "@/types/chat";

import { PreviewAttachment, type Attachment } from "./preview-attachment";

interface ChatSubmitInput {
  text: string;
  files: FileUIPart[];
}

interface ChatComposerProps {
  status: ChatStatus;
  /** Current text value of the composer (controlled). */
  value: string;
  /** Called when the composer text changes (typing, clearing on submit). */
  onValueChange: (value: string) => void;
  onSubmit: (message: ChatSubmitInput) => void;
  onStop: () => void;
  /** Optional CSS class for the outer wrapper div. */
  className?: string;
  /** Optional CSS class for the inner max-width container. */
  innerClassName?: string;
  /** Custom placeholder text for the textarea. */
  placeholder?: string;
}

function toFilePart(attachment: Attachment): FileUIPart {
  return {
    type: "file",
    url: attachment.url,
    filename: attachment.filename,
    mediaType: attachment.contentType,
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

export function ChatComposer({ status, value, onValueChange, onSubmit, onStop, className, innerClassName, placeholder }: ChatComposerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isGenerating = status === "submitted" || status === "streaming";
  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const isSubmitDisabled = uploadQueue.length > 0 || (!isGenerating && !hasContent);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("filename", file.name);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        toast.error(payload?.error ?? "Failed to upload file.");
        return null;
      }

      const payload = await response.json() as {
        url: string;
        pathname: string;
        contentType: string;
      };

      return {
        url: payload.url,
        filename: payload.pathname,
        contentType: payload.contentType,
      };
    } catch {
      toast.error("Failed to upload file.");
      return null;
    }
  }, []);

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
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void uploadFiles(imageFiles);
  }, [uploadFiles]);

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    if (isGenerating || uploadQueue.length > 0) {
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
  }, [attachments, isGenerating, onSubmit, onValueChange, uploadQueue.length]);

  return (
    <div className={cn("px-4 pb-4", className)}>
      <div className={cn("mx-auto max-w-2xl space-y-2", innerClassName)}>
        {(attachments.length > 0 || uploadQueue.length > 0) ? (
          <div className="flex flex-wrap gap-2" data-testid="composer-attachments">
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
        ) : null}

        <input
          accept="image/jpeg,image/png"
          aria-label="Upload attachments"
          className="hidden"
          multiple
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />

        <PromptInput disableAttachments onSubmit={handleSubmit}>
          <PromptInputTextarea
            placeholder={placeholder ?? "Send a message..."}
            value={value}
            onChange={handleChange}
            onPaste={handlePaste}
            disabled={isGenerating}
          />

          <PromptInputFooter className="items-center">
            <PromptInputTools>
              <PromptInputButton
                aria-label="Attach files"
                disabled={isGenerating}
                onClick={() => fileInputRef.current?.click()}
                variant="ghost"
              >
                <Paperclip className="size-4" />
              </PromptInputButton>
            </PromptInputTools>

            <PromptInputSubmit
              status={status}
              disabled={isSubmitDisabled}
              onStop={onStop}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
