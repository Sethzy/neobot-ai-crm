/**
 * Drawer timeline entry point for audit events plus interactions.
 * @module components/crm/timeline/unified-timeline
 */
"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useUnifiedTimeline } from "@/hooks/use-unified-timeline";
import type { TimelineRecordType } from "@/lib/crm/schemas";

import { TimelineMonthGroup } from "./timeline-month-group";
import { groupTimelineEntriesByMonth } from "./utils";

interface UnifiedTimelineProps {
  recordType: TimelineRecordType;
  recordId: string;
}

export function UnifiedTimeline({ recordType, recordId }: UnifiedTimelineProps) {
  const { entries, isLoading, isError, refetch } = useUnifiedTimeline(recordType, recordId);

  if (isLoading) {
    return (
      <div className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        <span>Loading activity...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">Unable to load activity timeline</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            void refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded</p>;
  }

  const groupedEntries = groupTimelineEntriesByMonth(entries);

  return (
    <div className="space-y-5">
      {groupedEntries.map((group) => (
        <TimelineMonthGroup key={group.label} label={group.label} entries={group.entries} />
      ))}
    </div>
  );
}
