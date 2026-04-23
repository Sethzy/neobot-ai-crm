/**
 * Small "OPEN" affordance chip rendered next to a CRM list-table Name cell.
 *
 * Only visible on row hover (`group/row`) so it doesn't clutter the default
 * view. Signals to the user that clicking the Name opens the record drawer
 * rather than inline-editing — matches Attio's `⌘ OPEN` pattern.
 *
 * This is a purely visual helper; the surrounding Name button handles the
 * click. The hint itself has `pointer-events-none` so it never steals focus.
 *
 * @module components/crm/open-record-hint
 */
import { SquareArrowOutUpRight } from "lucide-react";

export function OpenRecordHint() {
  return (
    <span
      aria-hidden
      className="pointer-events-none ml-2 inline-flex shrink-0 items-center gap-1 rounded-sm border border-app-border-subtle bg-app-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100"
    >
      <SquareArrowOutUpRight className="size-2.5" />
      Open
    </span>
  );
}
