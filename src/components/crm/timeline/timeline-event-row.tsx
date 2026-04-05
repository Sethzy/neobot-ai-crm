/**
 * Shared row chrome for unified timeline entries.
 * @module components/crm/timeline/timeline-event-row
 */
"use client";

import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface TimelineEventRowProps {
  icon: ReactNode;
  timestamp: string;
  children: ReactNode;
  isLast?: boolean;
}

export function TimelineEventRow({ icon, timestamp, children, isLast = false }: TimelineEventRowProps) {
  return (
    <div className={cn("relative pl-8", !isLast && "pb-4")}>
      {!isLast && (
        <div className="absolute left-[11px] top-0 h-full w-px bg-border/30" aria-hidden="true" />
      )}
      <div className="absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border/40 bg-background">
        {icon}
      </div>
      <div className="flex items-start justify-between gap-3 py-0.5">
        <div className="min-w-0 flex-1 text-sm text-foreground">{children}</div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
