/**
 * Shared loading skeleton for CRM record detail surfaces.
 * @module components/crm/crm-record-detail-skeleton
 */
import { Skeleton } from "@/components/ui/skeleton";

interface CrmRecordDetailSkeletonProps {
  tabCount?: number;
}

/**
 * Renders a stable detail-panel skeleton used by company, contact, and deal detail surfaces.
 */
export function CrmRecordDetailSkeleton({
  tabCount = 6,
}: CrmRecordDetailSkeletonProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-5">
          <header className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ml-auto h-3 w-24 shrink-0" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </header>
          <div className="-mx-5 border-b border-border/60 px-5">
            <div className="flex items-center gap-5">
              {Array.from({ length: tabCount }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-10 items-center"
                  data-testid="crm-detail-tab-skeleton"
                >
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-px pt-1">
            <Skeleton className="mb-4 h-3 w-10" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 py-2"
                data-testid="crm-detail-field-skeleton"
              >
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-3 w-16 shrink-0" />
                <Skeleton className="h-3 max-w-[160px] flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
