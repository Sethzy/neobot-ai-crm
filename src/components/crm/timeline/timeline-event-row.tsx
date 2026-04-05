/**
 * Shared row chrome for unified timeline entries.
 * @module components/crm/timeline/timeline-event-row
 */
"use client";

import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";

interface TimelineEventRowProps {
  icon: ReactNode;
  timestamp: string;
  children: ReactNode;
}

export function TimelineEventRow({ icon, timestamp, children }: TimelineEventRowProps) {
  return (
    <div className="relative pl-8">
      <div className="absolute left-[13px] top-0 h-full w-px bg-border/70" aria-hidden="true" />
      <div className="absolute left-0 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-card">
        {icon}
      </div>
      <div className="rounded-xl border border-border/50 bg-card px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-sm text-foreground">{children}</div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
