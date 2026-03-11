/**
 * Compact labelled toggle for CRM table, board, and calendar views.
 * @module components/crm/view-toggle
 */
"use client";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import type { ViewType } from "@/hooks/use-view-preference";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  /** Currently selected view mode. */
  current: ViewType;
  /** Ordered set of views to show. */
  views: ViewType[];
  /** Called when the user chooses a different view. */
  onChange: (view: ViewType) => void;
}

const viewIconMap: Record<ViewType, AppIconName> = {
  table: "table",
  kanban: "kanban",
  calendar: "calendar",
};

const viewLabelMap: Record<ViewType, string> = {
  table: "Table",
  kanban: "Board",
  calendar: "Calendar",
};

export function ViewToggle({ current, views, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/20 p-0.5">
      {views.map((view) => {
        const isActive = view === current;

        return (
          <Button
            key={view}
            type="button"
            variant="ghost"
            size="xs"
            data-active={isActive}
            aria-label={`${viewLabelMap[view]} view`}
            aria-pressed={isActive}
            className={cn(
              "gap-1.5 px-2.5",
              isActive ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => onChange(view)}
          >
            <AppIcon name={viewIconMap[view]} className="h-3.5 w-3.5" />
            <span>{viewLabelMap[view]}</span>
          </Button>
        );
      })}
    </div>
  );
}
