'use client';

/**
 * Hook for processing file uploads.
 * Validates, uploads to storage, and creates document records.
 * Automatically processes pending items when queue changes.
 * @module hooks/use-upload-processor
 */
import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUpload } from "@/contexts/upload-context";
import { documentKeys } from "./use-documents";
import {
  validateFileType,
  validateFileSize,
  computeFileHash,
  getFileExtension,
} from "@/lib/file-utils";
import type { QueueItem } from "@/contexts/upload-context";

/**
 * Triggers Gemini processing for an uploaded document.
 * Fire-and-forget: errors are logged but not thrown.
 *
 * @param documentId - UUID of the uploaded document
 * @param accessToken - Supabase JWT for authentication
 */
export async function triggerGeminiProcessing(
  documentId: string,
  accessToken: string
): Promise<void> {
  try {
    await fetch("/api/gemini/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ documentId }),
    });
  } catch (error) {
    // Fire-and-forget: log but don't throw
    console.error("Failed to trigger Gemini processing:", error);
  }
}

/**
 * Hook that processes files from the upload queue.
 * Automatically watches queue and processes pending items.
 * Call this hook once at app level (e.g., in AppLayout).
 */
export function useUploadProcessor() {
  const { queue, updateItemStatus } = useUpload();
  const queryClient = useQueryClient();
  /** Track which items are currently being processed to avoid duplicates */
  const processingIdsRef = useRef<Set<string>>(new Set());

  /**
   * Processes a single file from the queue.
   */
  const processFile = useCallback(
    async (item: QueueItem) => {
      const { id, file, caseId } = item;

      // Skip if already processing this item
      if (processingIdsRef.current.has(id)) return;
      processingIdsRef.current.add(id);

      try {
        // Mark as uploading
        updateItemStatus(id, "uploading");

        // Validate file type
        if (!validateFileType(file)) {
          updateItemStatus(id, "failed", "Invalid file type");
          return;
        }

        // Validate file size
        if (!validateFileSize(file)) {
          updateItemStatus(id, "failed", "File too large (max 50MB)");
          return;
        }

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          updateItemStatus(id, "failed", "Not authenticated");
          return;
        }

        // Compute file hash
        const fileHash = await computeFileHash(file);

        // Check for duplicate (same hash in same case)
        const { data: existing } = await supabase
          .from("documents")
          .select("id")
          .eq("case_id", caseId)
          .eq("file_hash", fileHash);

        if (existing && existing.length > 0) {
          updateItemStatus(id, "failed", "File already exists in this case");
          return;
        }

        // Generate storage path
        const ext = getFileExtension(file.name);
        const storagePath = `${user.id}/${caseId}/${crypto.randomUUID()}.${ext}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file);

        if (uploadError) {
          updateItemStatus(id, "failed", uploadError.message);
          return;
        }

        // Create database record
        const { data: dbRecord, error: dbError } = await supabase
          .from("documents")
          .insert({
            case_id: caseId,
            created_by: user.id,
            original_filename: file.name,
            filename: file.name,
            storage_path: storagePath,
            file_type: ext,
            file_size: file.size,
            file_hash: fileHash,
          })
          .select()
          .single();

        if (dbError || !dbRecord) {
          // Try to clean up uploaded file
          await supabase.storage.from("documents").remove([storagePath]);
          updateItemStatus(id, "failed", dbError?.message || "Failed to create record");
          return;
        }

        // Success
        updateItemStatus(id, "complete");

        // Invalidate documents query for this case
        queryClient.invalidateQueries({
          queryKey: documentKeys.list(caseId),
        });

        // Trigger Gemini processing (fire-and-forget)
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          triggerGeminiProcessing(dbRecord.id, session.access_token);
        }
      } catch (error) {
        updateItemStatus(
          id,
          "failed",
          error instanceof Error ? error.message : "Upload failed"
        );
      } finally {
        // Remove from processing set when done
        processingIdsRef.current.delete(id);
      }
    },
    [updateItemStatus, queryClient]
  );

  /**
   * Auto-process pending items when queue changes.
   * Uses useEffect to ensure we see the latest queue state (no stale closure).
   */
  useEffect(() => {
    const pendingItems = queue.filter((item) => item.status === "pending");

    // Process all pending items in parallel
    pendingItems.forEach((item) => {
      processFile(item);
    });
  }, [queue, processFile]);
}
