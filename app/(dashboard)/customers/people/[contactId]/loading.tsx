/**
 * Route-level loading shell for the full-page people detail view.
 * @module app/(dashboard)/customers/people/[contactId]/loading
 */
import { ArrowLeft } from "lucide-react";

import { CrmRecordDetailSkeleton } from "@/components/crm/crm-record-detail-skeleton";
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageCanvas aria-busy="true">
      <div className="flex items-center gap-1.5 text-meta text-muted-foreground">
        <ArrowLeft className="size-4" />
        <Skeleton className="h-4 w-20" />
      </div>
      <PageSurface padding="none" className="overflow-hidden">
        <CrmRecordDetailSkeleton tabCount={5} />
      </PageSurface>
    </PageCanvas>
  );
}
