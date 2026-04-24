/**
 * Compact labelled toggle for CRM table, board, and calendar views.
 * @module components/crm/view-toggle
 */
"use client";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import type { ViewType } from "@/hooks/use-view-preference";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ViewToggleProps {
  /** Currently selected view mode. */
  current: ViewType;
  /** Ordered set of views to show. */
  views: ViewType[];
  /** Called when the user chooses a different view. */
  onChange: (view: ViewType) => void;
  /** When true, all pills render locked — used when the active saved view
   * freezes the layout or the surface only supports one view. */
  disabled?: boolean;
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

export function ViewToggle({ current, views, onChange, disabled = false }: ViewToggleProps) {
  const isLocked = disabled || views.length === 1;

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={current}
      onValueChange={(value) => {
        if (value) onChange(value as ViewType);
      }}
    >
      {views.map((view) => (
        <ToggleGroupItem
          key={view}
          value={view}
          aria-label={`${viewLabelMap[view]} view`}
          disabled={isLocked}
          className={isLocked ? "cursor-default opacity-100" : undefined}
        >
          <AppIcon name={viewIconMap[view]} className="size-3.5" />
          <span>{viewLabelMap[view]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
