/** Skeleton shown while /cases route loads. */
export default function CasesLoading() {
  return (
    <div className="animate-pulse px-12 py-10">
      <div className="h-7 w-40 rounded bg-muted" />
      <div className="mt-2 h-4 w-96 rounded bg-muted/60" />

      <div className="mt-6 flex justify-end">
        <div className="h-7 w-16 rounded-lg bg-muted" />
      </div>

      <div className="mt-3 h-12 w-full rounded-md bg-muted/40" />

      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-14 rounded-lg bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
