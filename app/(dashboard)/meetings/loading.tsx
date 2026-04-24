/**
 * Route-level loading shell for the meetings list route.
 * @module app/(dashboard)/meetings/loading
 */
import { AppIcon } from "@/components/icons/app-icons";
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageCanvas aria-busy="true" data-testid="meetings-page-loading-shell">
      <PageHeader
        title="Meetings"
        actions={<Skeleton className="h-9 w-28 rounded-md" />}
      />

      <div className="space-y-4">
        {["Today", "Yesterday"].map((label) => (
          <section key={label}>
            <h2 className="mb-2 px-1 type-table-heading text-muted-foreground/50">{label}</h2>
            <div className="surface-app overflow-hidden p-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`${label}-${index}`}
                  className="flex items-center justify-between rounded-xl px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AppIcon name="meeting" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Skeleton className="h-4 w-44 max-w-full" />
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-3">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageCanvas>
  );
}
