/**
 * Unified timeline row for existing CRM interactions.
 * @module components/crm/timeline/timeline-interaction-row
 */
import type { UnifiedTimelineInteraction } from "@/lib/crm/schemas";

import { TimelineEventIcon } from "./timeline-event-icon";
import { TimelineEventRow } from "./timeline-event-row";
import { getInteractionTitle } from "./utils";

interface TimelineInteractionRowProps {
  interaction: UnifiedTimelineInteraction;
}

export function TimelineInteractionRow({ interaction }: TimelineInteractionRowProps) {
  return (
    <TimelineEventRow
      icon={<TimelineEventIcon interactionType={interaction.type} />}
      timestamp={interaction.occurred_at}
    >
      <div className="space-y-1">
        <p>{getInteractionTitle(interaction)}</p>
        {interaction.summary ? (
          <p className="text-sm text-muted-foreground">{interaction.summary}</p>
        ) : null}
      </div>
    </TimelineEventRow>
  );
}
