/**
 * TanStack Query hooks for CRM record attachments.
 * @module hooks/use-record-attachments
 */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { type RecordAttachment } from "@/lib/crm/schemas";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { supabase } from "@/lib/supabase";
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";

type RecordAttachmentType = RecordAttachment["record_type"];

interface UploadAttachmentVariables {
  file: File;
  recordType: RecordAttachmentType;
  recordId: string;
}

/**
 * Query key factory for record attachment queries.
 */
export const recordAttachmentKeys = {
  all: ["record-attachments"] as const,
  lists: () => [...recordAttachmentKeys.all, "list"] as const,
  list: (recordType: RecordAttachmentType, recordId: string) =>
    [...recordAttachmentKeys.lists(), recordType, recordId] as const,
  details: () => [...recordAttachmentKeys.all, "detail"] as const,
  detail: (attachmentId: string) => [...recordAttachmentKeys.details(), attachmentId] as const,
};

async function fetchRecordAttachments(
  recordType: RecordAttachmentType,
  recordId: string,
): Promise<RecordAttachment[]> {
  const { data, error } = await supabase
    .from("record_attachments")
    .select("*")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as RecordAttachment[];
}

export function recordAttachmentsQueryOptions(
  recordType: RecordAttachmentType,
  recordId: string,
) {
  return queryOptions({
    queryKey: recordAttachmentKeys.list(recordType, recordId),
    queryFn: () => fetchRecordAttachments(recordType, recordId),
  });
}

/**
 * Returns attachments for one CRM record and keeps the list fresh via realtime invalidation.
 */
export function useRecordAttachments(recordType: RecordAttachmentType, recordId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "record_attachments",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [recordAttachmentKeys.list(recordType, recordId)],
    enabled: Boolean(clientId && recordId),
  });

  return useQuery({
    ...recordAttachmentsQueryOptions(recordType, recordId),
    enabled: Boolean(recordId),
  });
}

/**
 * Uploads a file through the CRM attachment API route.
 */
export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const browserSupabase = createSupabaseClient();

  return useMutation({
    mutationFn: async ({
      file,
      recordType,
      recordId,
    }: UploadAttachmentVariables): Promise<RecordAttachment> => {
      const presignResponse = await fetch("/api/crm/attachments/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          record_type: recordType,
          record_id: recordId,
        }),
      });

      if (!presignResponse.ok) {
        const errorBody = await presignResponse.json().catch(() => ({}));
        throw new Error((errorBody as { error?: string }).error ?? "Upload failed");
      }

      const { path, storagePath, token } = await presignResponse.json() as {
        path: string;
        storagePath: string;
        token: string;
      };

      const uploadResult = await browserSupabase.storage
        .from(AGENT_FILES_BUCKET)
        .uploadToSignedUrl(path, token, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadResult.error) {
        throw new Error("Upload failed");
      }

      const confirmResponse = await fetch("/api/crm/attachments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          record_type: recordType,
          record_id: recordId,
        }),
      });

      if (!confirmResponse.ok) {
        const errorBody = await confirmResponse.json().catch(() => ({}));
        throw new Error((errorBody as { error?: string }).error ?? "Upload failed");
      }

      const result = await confirmResponse.json() as { attachment: RecordAttachment };
      return result.attachment;
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<RecordAttachment[]>(
        recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
        (existingAttachments) => {
          const remainingAttachments = (existingAttachments ?? []).filter(
            (existingAttachment) => existingAttachment.attachment_id !== attachment.attachment_id,
          );
          return [attachment, ...remainingAttachments];
        },
      );
      queryClient.setQueryData(recordAttachmentKeys.detail(attachment.attachment_id), attachment);
      void queryClient.invalidateQueries({
        queryKey: recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
      });
    },
  });
}

/**
 * Renames an attachment without changing its storage key.
 */
export function useRenameAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attachmentId,
      filename,
    }: {
      attachmentId: string;
      filename: string;
    }): Promise<RecordAttachment> => {
      const { data, error } = await supabase
        .from("record_attachments")
        .update({ filename })
        .eq("attachment_id", attachmentId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as RecordAttachment;
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<RecordAttachment[]>(
        recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
        (existingAttachments) =>
          (existingAttachments ?? []).map((existingAttachment) =>
            existingAttachment.attachment_id === attachment.attachment_id ? attachment : existingAttachment,
          ),
      );
      queryClient.setQueryData(recordAttachmentKeys.detail(attachment.attachment_id), attachment);
      void queryClient.invalidateQueries({
        queryKey: recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
      });
    },
  });
}

/**
 * Deletes one attachment row and removes its storage object best-effort.
 */
export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();

  return useMutation({
    mutationFn: async ({
      attachmentId,
      storagePath,
    }: {
      attachmentId: string;
      storagePath: string;
    }): Promise<RecordAttachment> => {
      const { data, error } = await supabase
        .from("record_attachments")
        .delete()
        .eq("attachment_id", attachmentId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!clientId) {
        throw new Error("Cannot delete attachment before client_id resolves.");
      }

      await supabase.storage.from(AGENT_FILES_BUCKET).remove([`${clientId}/${storagePath}`]);

      return data as RecordAttachment;
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<RecordAttachment[]>(
        recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
        (existingAttachments) =>
          (existingAttachments ?? []).filter(
            (existingAttachment) => existingAttachment.attachment_id !== attachment.attachment_id,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
      });
      void queryClient.removeQueries({
        queryKey: recordAttachmentKeys.detail(attachment.attachment_id),
      });
    },
  });
}

export { fetchRecordAttachments };
