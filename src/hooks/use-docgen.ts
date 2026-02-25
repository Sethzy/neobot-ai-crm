/**
 * TanStack Query hooks for DocGen.
 * @module hooks/use-docgen
 */
import { useMutation, useQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Query key factory for docgen.
 */
export const docgenKeys = {
  all: ["docgen"] as const,
  history: (caseId: string) => [...docgenKeys.all, "history", caseId] as const,
};

/**
 * Query options for report history.
 * Use with queryClient.ensureQueryData() in route loaders.
 */
export function reportHistoryQueryOptions(caseId: string) {
  return queryOptions({
    queryKey: docgenKeys.history(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_history")
        .select("*")
        .eq("case_id", caseId)
        .order("generated_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Fetches report history for a case.
 */
export function useReportHistory(caseId: string) {
  return useQuery({
    ...reportHistoryQueryOptions(caseId),
    enabled: !!caseId,
  });
}

/**
 * Downloads an existing report (generates fresh signed URL).
 * Uses Content-Disposition header to ensure proper filename on download.
 */
export function useDownloadReport() {
  return useMutation({
    mutationFn: async (filePath: string) => {
      const filename = filePath.split("/").pop() ?? "download";

      const { data, error } = await supabase.storage
        .from("reports")
        .createSignedUrl(filePath, 60, { download: filename });

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    },
  });
}
