/**
 * Shared route-state helpers for CRM list pages.
 * @module components/crm/use-crm-list-route-state
 */
"use client";

import { useCallback, useMemo } from "react";

interface SearchParamsLike {
  get(name: string): string | null;
  toString(): string;
}

interface UseCrmListRouteStateProps {
  basePath: string;
  replace: (href: string) => void;
  searchParams: SearchParamsLike | null | undefined;
}

/**
 * Builds the next href after changing only the `savedView` query parameter.
 */
export function buildCrmListSavedViewHref(
  basePath: string,
  searchParamsString: string,
  viewId: string | null,
) {
  const params = new URLSearchParams(searchParamsString);

  if (viewId) {
    params.set("savedView", viewId);
  } else {
    params.delete("savedView");
  }

  const nextQuery = params.toString();
  return nextQuery.length > 0 ? `${basePath}?${nextQuery}` : basePath;
}

/**
 * Provides stable saved-view query-param helpers for CRM list pages.
 */
export function useCrmListRouteState({
  basePath,
  replace,
  searchParams,
}: UseCrmListRouteStateProps) {
  const searchParamsString = searchParams?.toString() ?? "";
  const savedViewId = searchParams?.get("savedView") ?? null;

  const getSavedViewHref = useCallback(
    (viewId: string | null) => buildCrmListSavedViewHref(basePath, searchParamsString, viewId),
    [basePath, searchParamsString],
  );

  const handleSavedViewChange = useCallback(
    (viewId: string | null) => {
      replace(getSavedViewHref(viewId));
    },
    [getSavedViewHref, replace],
  );

  return useMemo(
    () => ({
      getSavedViewHref,
      handleSavedViewChange,
      savedViewId,
    }),
    [getSavedViewHref, handleSavedViewChange, savedViewId],
  );
}
