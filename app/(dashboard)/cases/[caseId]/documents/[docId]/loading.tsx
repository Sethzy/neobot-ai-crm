import { Loader2 } from "@/components/icons/lucide-compat";

/** Skeleton shown while /cases/[caseId]/documents/[docId] route loads. */
export default function DocumentDetailLoading() {
  return (
    <div className="flex h-screen animate-pulse flex-col bg-background">
      <div className="flex items-center gap-4 border-b border-border/40 px-5 py-3">
        <div className="h-8 w-8 rounded bg-muted/40" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 items-center justify-center border-r border-[#E5E5E5] bg-neutral-50/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <div className="w-1/2 bg-muted/10 p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
