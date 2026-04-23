/**
 * Resolves the active saved-view state for CRM pages.
 * @module components/crm/use-active-crm-view-state
 */
"use client";

import { useMemo } from "react";

import type { CrmView } from "@/lib/crm/schemas";
import type { CrmViewOpenMode } from "@/lib/crm/view-state";
import type { ViewType } from "@/hooks/use-view-preference";

interface UseActiveCrmViewStateOptions {
  activeViewId: string | null;
  allowPageOpen?: boolean;
  adHocViewType: ViewType;
  supportedViewTypes: ViewType[];
  views: CrmView[] | undefined;
}

/**
 * Saved views are authoritative when present. "All" falls back to local ad hoc state.
 */
export function useActiveCrmViewState({
  activeViewId,
  allowPageOpen = false,
  adHocViewType,
  supportedViewTypes,
  views,
}: UseActiveCrmViewStateOptions) {
  return useMemo(() => {
    const activeSavedView = views?.find((view) => view.view_id === activeViewId) ?? null;
    const isSavedViewActive = Boolean(activeSavedView);
    const nextViewType = activeSavedView?.state.viewType ?? adHocViewType;
    const activeViewType = supportedViewTypes.includes(nextViewType as ViewType)
      ? (nextViewType as ViewType)
      : supportedViewTypes[0] ?? "table";

    const requestedOpenMode = activeSavedView?.state.openMode ?? "drawer";
    const openMode: CrmViewOpenMode =
      allowPageOpen && requestedOpenMode === "page" ? "page" : "drawer";

    return {
      activeSavedView,
      activeState: activeSavedView?.state ?? null,
      activeViewType,
      hasInvalidSavedView: Boolean(activeViewId) && !activeSavedView,
      isSavedViewActive,
      openMode,
    };
  }, [activeViewId, adHocViewType, allowPageOpen, supportedViewTypes, views]);
}
