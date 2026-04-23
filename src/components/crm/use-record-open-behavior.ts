/**
 * Shared CRM record-open behavior for drawer vs full-page navigation.
 * @module components/crm/use-record-open-behavior
 */
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import type { RecordObjectType } from "@/components/crm/record-drawer";
import type { CrmViewOpenMode } from "@/lib/crm/view-state";

type PageableRecordObjectType = Exclude<RecordObjectType, "task">;

/**
 * Returns the canonical CRM detail route for a record type.
 */
export function getCrmRecordHref(
  objectType: PageableRecordObjectType,
  recordId: string,
) {
  switch (objectType) {
    case "contact":
      return `/customers/people/${recordId}`;
    case "company":
      return `/customers/companies/${recordId}`;
    case "deal":
      return `/customers/deals/${recordId}`;
  }
}

interface UseRecordOpenBehaviorOptions {
  objectType: RecordObjectType;
  openDrawer: (recordId: string) => void;
  openMode: CrmViewOpenMode;
}

/**
 * Keeps row-click behavior consistent across list/table/board/calendar surfaces.
 */
export function useRecordOpenBehavior({
  objectType,
  openDrawer,
  openMode,
}: UseRecordOpenBehaviorOptions) {
  const router = useRouter();

  const openRecord = useCallback(
    (recordId: string) => {
      if (objectType === "task" || openMode === "drawer") {
        openDrawer(recordId);
        return;
      }

      router.push(getCrmRecordHref(objectType, recordId));
    },
    [objectType, openDrawer, openMode, router],
  );

  const openFullPage = useCallback(
    (recordId: string) => {
      if (objectType === "task") {
        openDrawer(recordId);
        return;
      }

      router.push(getCrmRecordHref(objectType, recordId));
    },
    [objectType, openDrawer, router],
  );

  return {
    openFullPage,
    openRecord,
  };
}
