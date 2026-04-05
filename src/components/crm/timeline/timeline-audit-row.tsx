/**
 * Unified timeline row for audit entries.
 * @module components/crm/timeline/timeline-audit-row
 */
"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import type { TimelineActivity } from "@/lib/crm/schemas";

import { TimelineEventIcon } from "./timeline-event-icon";
import { TimelineEventRow } from "./timeline-event-row";
import { TimelineFieldDiff } from "./timeline-field-diff";
import {
  getAuditAction,
  getRecordLabel,
  getRecordSnapshot,
  getTimelineActorLabel,
  getTimelineFieldDiffs,
} from "./utils";

interface TimelineAuditRowProps {
  activity: TimelineActivity;
}

export function TimelineAuditRow({ activity }: TimelineAuditRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const action = getAuditAction(activity);
  const actorLabel = getTimelineActorLabel(activity.actor_type, activity.actor_label);
  const recordLabel = getRecordLabel(activity.record_type, getRecordSnapshot(activity));
  const fieldDiffs = getTimelineFieldDiffs(activity);

  let content = <p>{recordLabel}</p>;

  if (action === "created") {
    content = <p>{recordLabel} was created by {actorLabel}</p>;
  } else if (action === "deleted") {
    content = <p>{recordLabel} was deleted by {actorLabel}</p>;
  } else if (fieldDiffs.length <= 1) {
    const fieldDiff = fieldDiffs[0];

    content = fieldDiff ? (
      <p className="flex flex-wrap items-center gap-1.5">
        <span>{actorLabel} updated</span>
        <TimelineFieldDiff diff={fieldDiff} inline />
      </p>
    ) : (
      <p>{actorLabel} updated {recordLabel}</p>
    );
  } else {
    content = (
      <div className="space-y-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span>
            {actorLabel} updated {fieldDiffs.length} fields on {recordLabel}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {isExpanded ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            {fieldDiffs.map((diff) => (
              <TimelineFieldDiff key={diff.fieldKey} diff={diff} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <TimelineEventRow
      icon={<TimelineEventIcon action={action} />}
      timestamp={activity.happened_at}
    >
      {content}
    </TimelineEventRow>
  );
}
