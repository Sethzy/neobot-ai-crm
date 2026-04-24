/**
 * Shared CRM record-open behavior for drawer vs full-page navigation.
 * @module components/crm/use-record-open-behavior
 */
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { RecordObjectType } from "@/components/crm/record-drawer";
import type { CrmViewOpenMode } from "@/lib/crm/view-state";
import {
  getCrmRecordHref,
  getCrmWorkspaceHref,
} from "@/lib/crm/navigation";

interface UseRecordOpenBehaviorOptions {
  objectType: RecordObjectType;
  openDrawer: (recordId: string) => void;
  openMode: CrmViewOpenMode;
}

/**
 * Returns the active CRM workspace href so full-page detail routes can link
 * back to the exact list or board state that opened them.
 */
export function useCurrentCrmWorkspaceHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(
    () => getCrmWorkspaceHref(pathname, searchParams),
    [pathname, searchParams],
  );
}

/**
 * Keeps row-click behavior consistent across list/table/board/calendar surfaces.
 */
export function useRecordOpenBehavior({
  objectType,
  openDrawer,
  openMode,
}: UseRecordOpenBehaviorOptions) {
  const { push } = useRouter();
  const currentWorkspaceHref = useCurrentCrmWorkspaceHref();

  const openRecord = useCallback(
    (recordId: string) => {
      if (objectType === "task" || openMode === "drawer") {
        openDrawer(recordId);
        return;
      }

      push(getCrmRecordHref(objectType, recordId, { returnTo: currentWorkspaceHref }));
    },
    [currentWorkspaceHref, objectType, openDrawer, openMode, push],
  );

  const openFullPage = useCallback(
    (recordId: string) => {
      if (objectType === "task") {
        openDrawer(recordId);
        return;
      }

      push(getCrmRecordHref(objectType, recordId, { returnTo: currentWorkspaceHref }));
    },
    [currentWorkspaceHref, objectType, openDrawer, push],
  );

  return {
    openFullPage,
    openRecord,
  };
}
