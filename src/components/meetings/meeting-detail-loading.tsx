/**
 * Static loading shell for the meeting detail route.
 * @module components/meetings/meeting-detail-loading
 */
import { ArrowLeft } from "lucide-react";

import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Server-safe fallback for meeting detail transitions.
 */
export function MeetingDetailLoading() {
  return (
    <PageCanvas aria-busy="true" data-testid="meeting-detail-loading-shell">
      <div className="flex items-center gap-1.5 type-control-muted text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        <Skeleton className="h-4 w-16" />
      </div>

      <PageSurface className="space-y-6">
        <div className="border-b border-app-border-subtle pb-4">
          <PageHeader
            title={<Skeleton className="h-8 w-56 max-w-full" />}
            titleClassName="leading-snug"
            meta={
              <>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-18" />
              </>
            }
          />
        </div>

        <section data-testid="meeting-detail-loading-section" className="space-y-4">
          <Skeleton className="h-5 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full max-w-3xl" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-3/4 max-w-xl" />
          </div>
        </section>

        <PageSurface variant="muted">
          <div className="border-t pt-3">
            <Skeleton className="h-5 w-24" />
          </div>
        </PageSurface>

        <section
          data-testid="meeting-detail-loading-section"
          className="space-y-3 border-t border-app-border-subtle pt-3"
        >
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-full max-w-3xl" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-2/3 max-w-xl" />
        </section>
      </PageSurface>

      <div className="border-t border-app-border-subtle pt-3">
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
    </PageCanvas>
  );
}
