/**
 * Dropdown button for switching between saved CRM views.
 * Always renders the active label so the count chip always has a home —
 * collapses to a plain text label when no saved views exist.
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
  /** Optional row count rendered as `· {count}` after the label. */
  count?: number;
}

/** Default label shown when no saved view is active. */
const allLabel: Record<CrmViewEntityType, string> = {
  deals: "All Deals",
  contacts: "All People",
  companies: "All Companies",
  tasks: "All Tasks",
};

export function ViewPicker({ entityType, activeViewId, onViewChange, count }: ViewPickerProps) {
  const { data: views, isLoading } = useCrmViews(entityType);
  const savedViews = views ?? [];

  // Avoid layout flash while we wait for the first views fetch.
  if (isLoading) {
    return null;
  }

  const activeView = savedViews.find((v) => v.view_id === activeViewId);
  const triggerLabel = activeView ? activeView.name : allLabel[entityType];
  const formattedCount = typeof count === "number" ? count.toLocaleString() : null;

  // No saved views — there's nothing to switch between, so render a quiet text label.
  if (savedViews.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-1 type-control font-medium text-foreground">
        {triggerLabel}
        {formattedCount ? (
          <span className="text-muted-foreground">· {formattedCount}</span>
        ) : null}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5 px-2 font-medium text-foreground hover:bg-accent/60"
        >
          <span>{triggerLabel}</span>
          {formattedCount ? (
            <span className="text-muted-foreground">· {formattedCount}</span>
          ) : null}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={() => onViewChange(null)}>
          <Check
            className={cn(
              "mr-2 h-4 w-4 shrink-0",
              activeViewId === null ? "opacity-100" : "opacity-0",
            )}
          />
          {allLabel[entityType]}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

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
