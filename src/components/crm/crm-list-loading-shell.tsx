/**
 * Shared static loading shell for CRM list routes.
 * Mirrors the real list-toolbar + table layout without pulling in client hooks.
 * @module components/crm/crm-list-loading-shell
 */
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface CrmListLoadingShellProps {
  /** Route title shown in the page header. */
  title: string;
  /** Optional supporting copy used by some list routes. */
  description?: string;
  /** Whether the real route exposes a secondary view toggle. */
  showViewToggle?: boolean;
  /** Number of placeholder rows to render. */
  rowCount?: number;
}

/**
 * Server-safe CRM loading state used by People, Companies, and Deals routes.
 */
export function CrmListLoadingShell({
  title,
  description,
  showViewToggle = false,
  rowCount = 6,
}: CrmListLoadingShellProps) {
  return (
    <PageCanvas aria-busy="true">
      <PageHeader title={title} description={description} />

      <div className="flex flex-col gap-4">
        <div className="-ml-2.5 flex flex-wrap items-center gap-1">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className={`h-8 rounded-md ${showViewToggle ? "w-44" : "w-20"}`} />

          <div className="ml-auto flex items-center gap-1">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-app-border-subtle/80">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-3 border-b border-app-border-subtle/80 px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="ml-auto h-3 w-6" />
          </div>

          <div className="divide-y divide-app-border-subtle/80">
            {Array.from({ length: rowCount }).map((_, index) => (
              <div
                key={index}
                data-testid="crm-loading-row"
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-3 px-4 py-3"
              >
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-auto h-4 w-5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageCanvas>
  );
}
