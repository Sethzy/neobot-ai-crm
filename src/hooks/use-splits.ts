/**
 * @file TanStack Query hooks for split operations
 * @description Hooks for fetching and updating extraction splits
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SplitExtraction } from "@/types/extraction";
import type { Json } from "@/types/database";

/**
 * Query key factory for splits.
 * Provides consistent keys for caching and invalidation.
 */
export const splitKeys = {
  all: ["splits"] as const,
  lists: () => [...splitKeys.all, "list"] as const,
  list: (documentId: string) => [...splitKeys.lists(), documentId] as const,
  details: () => [...splitKeys.all, "detail"] as const,
  detail: (id: string) => [...splitKeys.details(), id] as const,
};

/**
 * Transforms database row to SplitExtraction type.
 * Converts snake_case to camelCase.
 */
function mapRowToSplitExtraction(row: {
  id: string;
  document_id: string;
  split_index: number;
  start_page: number;
  end_page: number;
  tag_id: string;
  identifier: string | null;
  document_date: string | null;
  potential_duplicate: string | null;
  observation: string | null;
  extend_processor_id: string | null;
  extracted_data: unknown;
  original_extracted_data: unknown;
  extraction_metadata: unknown;
  extraction_status: string | null;
  extraction_error: string | null;
  validation_failures: unknown;
  low_confidence_fields: unknown;
  page_width: number | null;
  page_height: number | null;
  created_at: string | null;
  updated_at: string | null;
  dismissed_rule_ids: string[] | null;
}): SplitExtraction {
  return {
    id: row.id,
    documentId: row.document_id,
    splitIndex: row.split_index,
    startPage: row.start_page,
    endPage: row.end_page,
    tagId: row.tag_id,
    identifier: row.identifier,
    documentDate: row.document_date,
    potentialDuplicate: row.potential_duplicate,
    observation: row.observation,
    extendProcessorId: row.extend_processor_id,
    extractedData: row.extracted_data as Record<string, unknown> | null,
    originalExtractedData: row.original_extracted_data as Record<string, unknown> | null,
    extractionMetadata: row.extraction_metadata as SplitExtraction["extractionMetadata"],
    extractionStatus: (row.extraction_status ?? "pending") as SplitExtraction["extractionStatus"],
    extractionError: row.extraction_error,
    validationFailures: row.validation_failures as SplitExtraction["validationFailures"],
    lowConfidenceFields: row.low_confidence_fields as SplitExtraction["lowConfidenceFields"],
    pageWidth: row.page_width ?? null,
    pageHeight: row.page_height ?? null,
    dismissedRuleIds: row.dismissed_rule_ids ?? [],
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

/**
 * Query options factory for fetching splits by document.
 * Use with queryClient.ensureQueryData() in route loaders.
 */
export function splitsQueryOptions(documentId: string) {
  return queryOptions({
    queryKey: splitKeys.list(documentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("splits")
        .select("*")
        .eq("document_id", documentId)
        .order("split_index", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapRowToSplitExtraction);
    },
  });
}

/**
 * Fetches all splits for a document.
 *
 * @param documentId - The document UUID
 * @returns Query result with splits array
 */
export function useSplits(documentId: string) {
  return useQuery({
    ...splitsQueryOptions(documentId),
    enabled: !!documentId,
  });
}

/**
 * Query options factory for fetching all splits for a case.
 * Joins through documents to get splits for all documents in the case.
 */
export function caseSplitsQueryOptions(caseId: string) {
  return queryOptions({
    queryKey: [...splitKeys.all, "case", caseId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("splits")
        .select("*, documents!inner(case_id)")
        .eq("documents.case_id", caseId)
        .order("split_index", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapRowToSplitExtraction(row));
    },
  });
}

/**
 * Fetches all splits for all documents in a case.
 * Used for case-level validation summary.
 *
 * @param caseId - The case UUID
 * @returns Query result with all splits in the case
 */
export function useCaseSplits(caseId: string) {
  return useQuery({
    ...caseSplitsQueryOptions(caseId),
    enabled: !!caseId,
  });
}

/**
 * Input for dismissing validation rules (batched).
 */
export interface DismissRuleInput {
  /** Split UUID */
  splitId: string;
  /** Document UUID (for cache invalidation) */
  documentId: string;
  /** Rule IDs to dismiss */
  ruleIds: string[];
}

/**
 * Input for updating a split's extracted data.
 */
export interface UpdateSplitInput {
  /** Split UUID */
  id: string;
  /** Document UUID (for cache invalidation) */
  documentId: string;
  /** Updated extracted data */
  extractedData: Record<string, unknown>;
}

/**
 * Updates a split's extracted_data field.
 * Does NOT re-run validation - badges only removable via manual dismiss.
 * Uses optimistic updates for instant UI feedback.
 *
 * @returns Mutation for updating a split
 */
export function useUpdateSplit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, extractedData }: UpdateSplitInput) => {
      const { data, error } = await supabase
        .from("splits")
        .update({
          extracted_data: extractedData as unknown as Json,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapRowToSplitExtraction(data);
    },
    onMutate: async ({ id, documentId, extractedData }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: splitKeys.list(documentId),
      });

      // Snapshot previous value
      const previousSplits = queryClient.getQueryData<SplitExtraction[]>(
        splitKeys.list(documentId)
      );

      // Optimistically update extractedData
      queryClient.setQueryData<SplitExtraction[]>(
        splitKeys.list(documentId),
        (old) =>
          old?.map((s) =>
            s.id === id
              ? { ...s, extractedData }
              : s
          )
      );

      return { previousSplits, documentId };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousSplits) {
        queryClient.setQueryData(
          splitKeys.list(context.documentId),
          context.previousSplits
        );
      }
      console.error("Failed to update split:", err);
      // Invalidate to sync with server state
      queryClient.invalidateQueries({
        queryKey: splitKeys.list(context!.documentId),
      });
    },
    // NOTE: Removed onSuccess invalidation - optimistic update is sufficient
  });
}

/**
 * Dismisses validation rules for a split (batched).
 * Appends ruleIds to dismissed_rule_ids array in database.
 * Uses optimistic updates for instant UI feedback.
 *
 * @returns Mutation for dismissing rules
 */
export function useDismissRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ splitId, ruleIds }: DismissRuleInput) => {
      // First get current dismissed rules
      const { data: current, error: fetchError } = await supabase
        .from("splits")
        .select("dismissed_rule_ids, document_id")
        .eq("id", splitId)
        .single();

      if (fetchError) throw fetchError;

      const currentIds = (current?.dismissed_rule_ids as string[]) ?? [];

      // Filter out duplicates
      const newRuleIds = ruleIds.filter((id) => !currentIds.includes(id));
      if (newRuleIds.length === 0) {
        // All rules already dismissed, return current state
        const { data: fullRow } = await supabase
          .from("splits")
          .select("*")
          .eq("id", splitId)
          .single();
        return mapRowToSplitExtraction(fullRow!);
      }

      const newIds = [...currentIds, ...newRuleIds];

      const { data, error } = await supabase
        .from("splits")
        .update({ dismissed_rule_ids: newIds })
        .eq("id", splitId)
        .select()
        .single();

      if (error) throw error;
      return mapRowToSplitExtraction(data);
    },
    onMutate: async ({ splitId, documentId, ruleIds }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: splitKeys.list(documentId),
      });

      // Snapshot previous value
      const previousSplits = queryClient.getQueryData<SplitExtraction[]>(
        splitKeys.list(documentId)
      );

      // Optimistically update with all ruleIds at once
      queryClient.setQueryData<SplitExtraction[]>(
        splitKeys.list(documentId),
        (old) =>
          old?.map((s) =>
            s.id === splitId
              ? {
                  ...s,
                  dismissedRuleIds: [...(s.dismissedRuleIds ?? []), ...ruleIds],
                }
              : s
          )
      );

      return { previousSplits, documentId };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousSplits) {
        queryClient.setQueryData(
          splitKeys.list(context.documentId),
          context.previousSplits
        );
      }
      // TODO: Replace with toast.error() when sonner is installed
      console.error("Failed to dismiss rule:", err);
      // Only invalidate on error to sync with server state
      queryClient.invalidateQueries({
        queryKey: splitKeys.list(context!.documentId),
      });
    },
    // NOTE: Removed onSettled invalidation - optimistic update is sufficient
    // and invalidation was causing race condition where refetch overwrote optimistic data
  });
}
