/**
 * Shared CRM workspace shell for People, Companies, Deals, and Tasks.
 * @module components/crm/crm-workspace-shell
 */
"use client";

import type { ReactNode } from "react";

import { ViewPicker } from "@/components/crm/view-picker";
import { ViewToggle } from "@/components/crm/view-toggle";
import { PageCanvas } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar, type FilterDef, type FilterValues } from "@/components/ui/filter-bar";
import type { CrmViewEntityType } from "@/lib/crm/schemas";
import type { ViewType } from "@/hooks/use-view-preference";

interface CrmWorkspaceShellProps {
  activeViewId: string | null;
  bodyByView?: Partial<Record<ViewType, ReactNode>>;
  count?: number;
  description?: ReactNode;
  drawer?: ReactNode;
  entityType: CrmViewEntityType;
  filters?: FilterDef[];
  filterValues?: FilterValues;
  isSavedViewActive?: boolean;
  onFilterApply?: (values: FilterValues) => void;
  onFilterClear?: () => void;
  onSearchChange?: (value: string) => void;
  onViewChange: (viewId: string | null) => void;
  onViewTypeChange?: (viewType: ViewType) => void;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  title: string;
  viewContent?: ReactNode;
  viewType?: ViewType;
  views?: ViewType[];
}

/**
 * Thin composition layer over the existing CRM widgets so all four surfaces
 * share framing, saved-view switching, filter presentation, and view toggles.
 */
export function CrmWorkspaceShell({
  activeViewId,
  bodyByView,
  count,
  description,
  drawer,
  entityType,
  filters,
  filterValues,
  isSavedViewActive = false,
  onFilterApply,
  onFilterClear,
  onSearchChange,
  onViewChange,
  onViewTypeChange,
  primaryAction,
  secondaryActions,
  searchPlaceholder,
  searchValue,
  title,
  viewContent,
  viewType = "table",
  views = ["table"],
}: CrmWorkspaceShellProps) {
  const resolvedViewContent = bodyByView
    ? bodyByView[viewType] ?? bodyByView.table ?? null
    : viewContent;

  return (
    <PageCanvas>
      <PageHeader title={title} description={description} />
      <FilterBar
        filterPosition="trailing"
        leadingSlot={(
          // Pull the cluster back by the picker's internal left padding so the
          // picker's text lines up with the page title's left edge.
          <div className="-ml-2.5 flex flex-wrap items-center gap-1">
            <ViewPicker
              entityType={entityType}
              activeViewId={activeViewId}
              onViewChange={onViewChange}
              count={count}
            />
            <ViewToggle
              current={viewType}
              views={views}
              onChange={onViewTypeChange ?? (() => {})}
              disabled={isSavedViewActive || !onViewTypeChange}
            />
          </div>
        )}
        trailingSlot={(
          <>
            {secondaryActions}
            {primaryAction}
          </>
        )}
        {...(isSavedViewActive
          ? {}
          : {
              filters,
              searchPlaceholder,
              searchValue,
              onSearchChange,
              values: filterValues,
              onApply: onFilterApply,
              onClear: onFilterClear,
            })}
      />

      {resolvedViewContent}
      {drawer}
    </PageCanvas>
  );
}
