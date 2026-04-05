/**
 * Month-grouped section for the unified timeline.
 * @module components/crm/timeline/timeline-month-group
 */
import type { UnifiedTimelineEntry } from "@/lib/crm/schemas";

import { TimelineAuditRow } from "./timeline-audit-row";
import { TimelineInteractionRow } from "./timeline-interaction-row";

interface TimelineMonthGroupProps {
  label: string;
  entries: UnifiedTimelineEntry[];
}

export function TimelineMonthGroup({ label, entries }: TimelineMonthGroupProps) {
  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <div className="h-px bg-border/70" aria-hidden="true" />
      </div>
      <div>
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;

          return entry.kind === "audit" ? (
            <TimelineAuditRow key={entry.data.id} activity={entry.data} isLast={isLast} />
          ) : (
            <TimelineInteractionRow key={entry.data.interaction_id} interaction={entry.data} isLast={isLast} />
          );
        })}
      </div>
    </section>
  );
}
