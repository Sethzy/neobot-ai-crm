/**
 * Cases dashboard route loader.
 * Component is defined in ./index.lazy.tsx for route-level code splitting.
 */
import { createFileRoute } from "@tanstack/react-router";
import { casesQueryOptions } from "@/hooks/use-cases";

export const Route = createFileRoute("/cases/")({
  loader: async ({ context: { queryClient } }) => {
    // Prefetch default cases list to avoid loading flash on navigation
    await queryClient.ensureQueryData(
      casesQueryOptions({ filter: "all", search: "" })
    );
  },
});
