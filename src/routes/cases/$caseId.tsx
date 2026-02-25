/**
 * Case detail route loader.
 * Page component is in ./$caseId.lazy.tsx for route-level code splitting.
 */
import { createFileRoute } from "@tanstack/react-router";
import { caseDetailQueryOptions } from "@/hooks/use-cases";
import {
  documentsQueryOptions,
  documentsWithStatusQueryOptions,
} from "@/hooks/use-documents";
import { caseSplitsQueryOptions } from "@/hooks/use-splits";
import { clientConfigIdQueryOptions } from "@/hooks/use-client-config";
import { reportHistoryQueryOptions } from "@/hooks/use-docgen";

export const Route = createFileRoute("/cases/$caseId")({
  loader: async ({ context: { queryClient }, params: { caseId } }) => {
    // Fetch all in parallel, wait for all before rendering
    await Promise.all([
      queryClient.ensureQueryData(caseDetailQueryOptions(caseId)),
      queryClient.ensureQueryData(documentsQueryOptions(caseId)),
      queryClient.ensureQueryData(documentsWithStatusQueryOptions(caseId)),
      queryClient.ensureQueryData(caseSplitsQueryOptions(caseId)),
      queryClient.ensureQueryData(reportHistoryQueryOptions(caseId)),
      queryClient.ensureQueryData(clientConfigIdQueryOptions),
    ]);
  },
});
