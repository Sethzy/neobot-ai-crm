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
      <div className="space-y-3">
        {entries.map((entry) =>
          entry.kind === "audit" ? (
            <TimelineAuditRow key={entry.data.id} activity={entry.data} />
          ) : (
            <TimelineInteractionRow key={entry.data.interaction_id} interaction={entry.data} />
          ),
        )}
      </div>
    </section>
  );
}
