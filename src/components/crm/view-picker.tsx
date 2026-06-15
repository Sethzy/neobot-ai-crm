/**
 * Dropdown button for switching between saved CRM views.
 * Renders the default label immediately so the toolbar layout is stable
 * from first paint, then upgrades to show saved views once they resolve.
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
  const { data: views } = useCrmViews(entityType);
  const savedViews = views ?? [];
  const activeView = savedViews.find((v) => v.view_id === activeViewId);
  const triggerLabel = activeView ? activeView.name : allLabel[entityType];
  const formattedCount = typeof count === "number" ? count.toLocaleString() : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={`view-picker-${entityType}`}
          variant="ghost"
          size="sm"
          className="max-w-full gap-1.5 rounded-md px-2.5 font-medium text-foreground ring-1 ring-transparent transition-colors hover:bg-app-hover/60 hover:ring-app-border-subtle max-sm:h-11"
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <span className="flex items-center gap-1 text-muted-foreground" aria-hidden={formattedCount === null}>
            <span>·</span>
            {formattedCount !== null ? (
              <span>{formattedCount}</span>
            ) : (
              // Reserve width with a muted shimmer so the chevron doesn't jump
              // when the count query resolves.
              <span className="inline-block h-2.5 w-5 animate-pulse rounded-sm bg-muted-foreground/25" />
            )}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
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

        {savedViews.length > 0 ? <DropdownMenuSeparator /> : null}

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
