'use client';

/**
 * Hook for handling file paste events.
 * @module hooks/use-file-paste
 */
import { useEffect, useCallback } from "react";
import { extractFilesFromClipboard } from "@/lib/clipboard-utils";

export interface UseFilePasteOptions {
  /** Callback when files are pasted */
  onFilesSelected: (files: File[]) => void;
  /** Whether paste handling is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Checks if an element should ignore paste (input fields).
 */
function shouldIgnorePaste(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA") return true;
  if (target.contentEditable === "true") return true;

  return false;
}

/**
 * Attaches window paste listener for file uploads.
 * Ignores paste in input fields to avoid interference.
 *
 * @param options - Configuration options
 */
export function useFilePaste({
  onFilesSelected,
  enabled = true,
}: UseFilePasteOptions): void {
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      // Don't interfere with input fields
      if (shouldIgnorePaste(event.target)) return;

      const files = extractFilesFromClipboard(event);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [enabled, handlePaste]);
}
