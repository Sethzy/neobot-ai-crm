/**
 * Renders one field-level diff in the unified timeline.
 * @module components/crm/timeline/timeline-field-diff
 */
import { cn } from "@/lib/utils";

import type { TimelineFieldDiffData } from "./utils";

interface TimelineFieldDiffProps {
  diff: TimelineFieldDiffData;
  inline?: boolean;
}

export function TimelineFieldDiff({ diff, inline = false }: TimelineFieldDiffProps) {
  const showBefore = diff.beforeValue !== "—";

  const content = (
    <>
      <diff.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium text-foreground">{diff.label}</span>
      {showBefore ? (
        <>
          <span className="min-w-0 truncate text-muted-foreground line-through">{diff.beforeValue}</span>
          <span className="shrink-0 text-muted-foreground">&rarr;</span>
        </>
      ) : null}
      <span className="min-w-0 truncate text-foreground">{diff.afterValue}</span>
    </>
  );

  if (inline) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {content}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 overflow-hidden")}>
      {content}
    </div>
  );
}
