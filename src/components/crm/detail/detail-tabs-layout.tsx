/**
 * Underline-tab layout used by customer detail pages.
 * @module components/crm/detail/detail-tabs-layout
 */
"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DetailTabDefinition<TId extends string = string> {
  id: TId;
  label: ReactNode;
}

export interface DetailSectionAction {
  label: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  onAction: () => void;
}

interface DetailTabsLayoutProps<TId extends string = string> {
  tabs: DetailTabDefinition<TId>[];
  activeTab: TId;
  navAriaLabel: string;
  onTabChange: (id: TId) => void;
  sectionAction?: DetailSectionAction | null;
  className?: string;
  children: ReactNode;
}

/**
 * Mirrors Open Mercato's compact underline tabs with an optional contextual action.
 */
export function DetailTabsLayout<TId extends string = string>({
  tabs,
  activeTab,
  navAriaLabel,
  onTabChange,
  sectionAction,
  className,
  children,
}: DetailTabsLayoutProps<TId>) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={navAriaLabel}
          className="flex flex-nowrap items-center gap-4 overflow-x-auto text-sm"
          role="tablist"
        >
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                "h-auto rounded-none border-b-2 px-0 py-1 hover:bg-transparent",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>

        {sectionAction ? (
          <Button
            type="button"
            size="sm"
            disabled={sectionAction.disabled}
            onClick={sectionAction.onAction}
          >
            {sectionAction.icon ?? <Plus className="mr-2 h-4 w-4" />}
            {sectionAction.label}
          </Button>
        ) : null}
      </div>

      <div>{children}</div>
    </div>
  );
}
