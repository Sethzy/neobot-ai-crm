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
      <diff.Icon className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-foreground">{diff.label}</span>
      {showBefore ? (
        <>
          <span className="text-muted-foreground line-through">{diff.beforeValue}</span>
          <span className="text-muted-foreground">&rarr;</span>
        </>
      ) : null}
      <span className="text-foreground">{diff.afterValue}</span>
    </>
  );

  if (inline) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {content}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2")}>
      {content}
    </div>
  );
}
