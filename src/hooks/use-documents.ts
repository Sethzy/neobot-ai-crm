/**
 * TanStack Query hooks for document operations.
 * @module hooks/use-documents
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Document,
  CreateDocumentInput,
  DocumentWithStatus,
} from "@/types/documents";

/**
 * Query key factory for documents.
 * Provides consistent keys for caching and invalidation.
 */
export const documentKeys = {
  all: ["documents"] as const,
  lists: () => [...documentKeys.all, "list"] as const,
  list: (caseId: string) => [...documentKeys.lists(), caseId] as const,
  listsWithStatus: () => [...documentKeys.all, "list-with-status"] as const,
  listWithStatus: (caseId: string) =>
    [...documentKeys.listsWithStatus(), caseId] as const,
  details: () => [...documentKeys.all, "detail"] as const,
  detail: (id: string) => [...documentKeys.details(), id] as const,
};

/**
 * Query options factory for fetching documents by case.
 * Use with queryClient.ensureQueryData() in route loaders.
 */
export function documentsQueryOptions(caseId: string) {
  return queryOptions({
    queryKey: documentKeys.list(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Document[];
    },
  });
}

/**
 * Query options factory for document detail with signed PDF URL.
 * Use with queryClient.ensureQueryData() in route loaders.
 */
export function documentDetailQueryOptions(caseId: string, docId: string) {
  return queryOptions({
    queryKey: documentKeys.detail(docId),
    queryFn: async (): Promise<{ document: Document; pdfUrl: string }> => {
      // Fetch document with case_id check for security
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", docId)
        .eq("case_id", caseId)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Document not found");

      const document = data as Document;

      // Generate signed URL for PDF
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(document.storage_path, 3600);

      if (signedUrlError) throw signedUrlError;

      return {
        document,
        pdfUrl: signedUrlData.signedUrl,
      };
    },
  });
}

/**
 * Checks if any documents are still being uploaded or processed.
 * Used to determine if polling should be enabled.
 *
 * @param documents - Array of documents to check
 * @returns true if any document has status "uploaded" or "processing"
 */
export function hasProcessingDocuments(
  documents: Document[] | undefined
): boolean {
  if (!documents || documents.length === 0) return false;

  return documents.some(
    (doc) => doc.status === "uploaded" || doc.status === "processing"
  );
}

/**
 * Fetches all documents for a case.
 * Automatically polls every 3s while documents are processing.
 *
 * @param caseId - The case UUID
 * @returns Query result with documents array
 */
export function useDocuments(caseId: string) {
  return useQuery({
    ...documentsQueryOptions(caseId),
    placeholderData: keepPreviousData,
    enabled: !!caseId,
    refetchInterval: (query) => {
      // Poll every 3s while any document is uploading or processing
      const hasProcessing = hasProcessingDocuments(query.state.data);
      return hasProcessing ? 3000 : false;
    },
  });
}

/**
 * Creates a new document record.
 * @returns Mutation for creating a document
 */
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("documents")
        .insert({
          ...input,
          filename: input.original_filename, // Same for now, Gemini renames later
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation (duplicate file hash)
        if (error.code === "23505") {
          throw new Error("File already exists in this case");
        }
        throw error;
      }
      return data as Document;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.list(data.case_id) });
    },
  });
}

/**
 * Deletes a document and its storage file.
 * Deletes DB record first to prevent orphaned files if DB fails.
 * @returns Mutation for deleting a document
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      caseId,
      storagePath,
    }: {
      id: string;
      caseId: string;
      storagePath: string;
    }) => {
      // Delete from database first (if this fails, storage is untouched)
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;

      // Then delete from storage (orphaned files are less critical than orphaned records)
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([storagePath]);

      if (storageError) throw storageError;

      return { id, caseId };
    },
    onSuccess: ({ caseId }) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.list(caseId) });
    },
  });
}

/**
 * Query options factory for fetching documents with computed status.
 * Uses documents_with_status view for extraction-aware status.
 */
export function documentsWithStatusQueryOptions(caseId: string) {
  return queryOptions({
    queryKey: documentKeys.listWithStatus(caseId),
    queryFn: async () => {
      // Note: documents_with_status is a view - cast to bypass type checking
      // until database types are regenerated
      const { data, error } = await supabase
        .from("documents_with_status" as "documents")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DocumentWithStatus[];
    },
  });
}

/**
 * Checks if any documents are still processing (computed_status).
 * Used to determine if polling should be enabled.
 *
 * @param documents - Array of documents with status to check
 * @returns true if any document has computed_status "processing"
 */
export function hasProcessingDocumentsWithStatus(
  documents: DocumentWithStatus[] | undefined
): boolean {
  if (!documents || documents.length === 0) return false;
  return documents.some((doc) => doc.computed_status === "processing");
}

/**
 * Fetches all documents for a case with computed status.
 * Uses documents_with_status view for extraction-aware status.
 * Automatically polls every 3s while documents are processing.
 *
 * @param caseId - The case UUID
 * @returns Query result with documents array including computed_status
 */
export function useDocumentsWithStatus(caseId: string) {
  return useQuery({
    ...documentsWithStatusQueryOptions(caseId),
    placeholderData: keepPreviousData,
    enabled: !!caseId,
    refetchInterval: (query) => {
      // Poll every 3s while any document is processing
      const hasProcessing = hasProcessingDocumentsWithStatus(query.state.data);
      return hasProcessing ? 3000 : false;
    },
  });
}

/**
 * Input for marking a document as reviewed.
 */
export interface MarkDocumentReviewedInput {
  /** Document UUID */
  documentId: string;
  /** Case UUID (for cache invalidation) */
  caseId: string;
}

/**
 * Marks a document as reviewed with optimistic update.
 * Updates documents.is_reviewed and documents.reviewed_at.
 * Uses optimistic update to prevent PDF re-render and flicker.
 *
 * @returns Mutation for marking document reviewed
 */
export function useMarkDocumentReviewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId }: MarkDocumentReviewedInput) => {
      const { data, error } = await supabase
        .from("documents")
        .update({
          is_reviewed: true,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ documentId }) => {
      // Cancel any in-flight refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: documentKeys.detail(documentId),
      });

      // Snapshot previous data for rollback
      const previousData = queryClient.getQueryData<{
        document: Document;
        pdfUrl: string;
      }>(documentKeys.detail(documentId));

      // Optimistically update the cache (keeps pdfUrl reference stable)
      if (previousData) {
        queryClient.setQueryData(documentKeys.detail(documentId), {
          ...previousData,
          document: {
            ...previousData.document,
            is_reviewed: true,
            reviewed_at: new Date().toISOString(),
          },
        });
      }

      return { previousData };
    },
    onError: (_error, { documentId }, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(
          documentKeys.detail(documentId),
          context.previousData
        );
      }
    },
    onSuccess: (_, { caseId }) => {
      // Only invalidate lists (detail already updated optimistically)
      queryClient.invalidateQueries({
        queryKey: documentKeys.listWithStatus(caseId),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(caseId),
      });
    },
  });
}

/**
 * Unmarks a document as reviewed with optimistic update.
 * Updates documents.is_reviewed to false.
 * Uses optimistic update to prevent PDF re-render and flicker.
 *
 * @returns Mutation for unmarking document reviewed
 */
export function useUnmarkDocumentReviewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId }: MarkDocumentReviewedInput) => {
      const { data, error } = await supabase
        .from("documents")
        .update({
          is_reviewed: false,
        })
        .eq("id", documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ documentId }) => {
      await queryClient.cancelQueries({
        queryKey: documentKeys.detail(documentId),
      });

      const previousData = queryClient.getQueryData<{
        document: Document;
        pdfUrl: string;
      }>(documentKeys.detail(documentId));

      if (previousData) {
        queryClient.setQueryData(documentKeys.detail(documentId), {
          ...previousData,
          document: {
            ...previousData.document,
            is_reviewed: false,
            reviewed_at: null,
          },
        });
      }

      return { previousData };
    },
    onError: (_error, { documentId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          documentKeys.detail(documentId),
          context.previousData
        );
      }
    },
    onSuccess: (_, { caseId }) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.listWithStatus(caseId),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(caseId),
      });
    },
  });
}
