/**
 * Dropdown button for switching between saved CRM views.
 * Renders nothing when there are no saved views for the entity type.
 * @module components/crm/view-picker
 */
"use client";

import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCrmViews } from "@/hooks/use-crm-views";
import type { CrmViewEntityType } from "@/lib/crm/schemas";
import { cn } from "@/lib/utils";

interface ViewPickerProps {
  entityType: CrmViewEntityType;
  activeViewId: string | null;
  onViewChange: (viewId: string | null) => void;
}

/** Default label shown when no saved view is active. */
const allLabel: Record<CrmViewEntityType, string> = {
  deals: "All Deals",
  contacts: "All People",
  companies: "All Companies",
  tasks: "All Tasks",
};

export function ViewPicker({ entityType, activeViewId, onViewChange }: ViewPickerProps) {
  const { data: views, isLoading } = useCrmViews(entityType);
  const savedViews = views ?? [];

  // Don't render the picker until we know views exist — avoids layout flash.
  if (isLoading || savedViews.length === 0) {
    return null;
  }

  const activeView = savedViews.find((v) => v.view_id === activeViewId);
  const triggerLabel = activeView ? activeView.name : allLabel[entityType];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 font-medium">
          {triggerLabel}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        {/* "All" option — clears active view */}
        <DropdownMenuItem onClick={() => onViewChange(null)}>
          <Check
            className={cn(
              "mr-2 h-4 w-4 shrink-0",
              activeViewId === null ? "opacity-100" : "opacity-0",
            )}
          />
          {allLabel[entityType]}
        </DropdownMenuItem>

        {savedViews.length > 0 && <DropdownMenuSeparator />}

        {savedViews.map((view) => (
          <DropdownMenuItem
            key={view.view_id}
            onClick={() => onViewChange(view.view_id)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4 shrink-0",
                activeViewId === view.view_id ? "opacity-100" : "opacity-0",
              )}
            />
            {view.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
