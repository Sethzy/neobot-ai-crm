/** Skeleton shown while /cases/[caseId] route loads. */
export default function CaseDetailLoading() {
  return (
    <div className="flex h-full animate-pulse flex-col bg-muted/5">
      <div className="z-10 flex flex-col bg-background">
        <div className="px-6 pb-1 pt-3">
          <div className="mb-1 h-3 w-32 rounded bg-muted/40" />
          <div className="mt-2 h-6 w-64 rounded bg-muted" />
        </div>
        <div className="border-b border-border/40 px-6">
          <div className="flex gap-4 py-2">
            {["w-12", "w-12", "w-20", "w-16"].map((width, idx) => (
              <div key={idx} className={`h-5 ${width} rounded bg-muted/50`} />
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-16 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
