/**
 * Static loading shell for the Tasks workspace.
 * Matches the toolbar + list framing of the real route without client logic.
 * @module components/tasks/tasks-page-loading
 */
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Tasks route loading UI used by App Router during protected navigation.
 */
export function TasksPageLoading() {
  return (
    <PageCanvas aria-busy="true" data-testid="tasks-page-loading-shell">
      <PageHeader title="Todos" />

      <div className="flex flex-col gap-4">
        <div className="-ml-2.5 flex flex-wrap items-center gap-1">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-60 rounded-md" />
          <div className="ml-auto flex items-center gap-1">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-app-border-subtle/80">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-3 border-b border-app-border-subtle/80 px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-6" />
          </div>

          <div className="divide-y divide-app-border-subtle/80">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                data-testid="tasks-loading-row"
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-3 px-4 py-3"
              >
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-4 w-5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageCanvas>
  );
}
