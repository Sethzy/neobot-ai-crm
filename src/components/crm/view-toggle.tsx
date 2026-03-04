/**
 * Compact icon-based toggle for CRM table/kanban/calendar views.
 * @module components/crm/view-toggle
 */
"use client";

import { CalendarDays, Columns3, LayoutGrid, type LucideIcon } from "lucide-react";

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

const viewIconMap: Record<ViewType, LucideIcon> = {
  table: LayoutGrid,
  kanban: Columns3,
  calendar: CalendarDays,
};

const viewLabelMap: Record<ViewType, string> = {
  table: "Table view",
  kanban: "Kanban view",
  calendar: "Calendar view",
};

export function ViewToggle({ current, views, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/20 p-0.5">
      {views.map((view) => {
        const Icon = viewIconMap[view];
        const isActive = view === current;

        return (
          <Button
            key={view}
            type="button"
            variant="ghost"
            size="icon-xs"
            data-active={isActive}
            aria-label={viewLabelMap[view]}
            className={cn(isActive ? "bg-background shadow-sm" : "text-muted-foreground")}
            onClick={() => onChange(view)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
