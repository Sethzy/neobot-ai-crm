/**
 * Local storage-backed view preference hook for CRM list surfaces.
 * @module hooks/use-view-preference
 */
"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ViewType = "table" | "kanban";

const validViews = new Set<ViewType>(["table", "kanban"]);
const viewPreferenceEventName = "view-preference-change";

function getStorageKey(objectType: string): string {
  return `view-${objectType}`;
}

function isViewType(value: string | null): value is ViewType {
  return Boolean(value && validViews.has(value as ViewType));
}

function getSnapshot(objectType: string): ViewType {
  if (typeof window === "undefined") {
    return "table";
  }

  const storedValue = window.localStorage.getItem(getStorageKey(objectType));
  return isViewType(storedValue) ? storedValue : "table";
}

function getServerSnapshot(): ViewType {
  return "table";
}

/**
 * Returns and updates the persisted view type for a CRM object list.
 */
export function useViewPreference(objectType: string) {
  const storageKey = getStorageKey(objectType);

  const subscribe = useCallback(
    (callback: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) {
          callback();
        }
      };

      const onCustom = (event: Event) => {
        const customEvent = event as CustomEvent<{ key?: string }>;
        if (customEvent.detail?.key === storageKey) {
          callback();
        }
      };

      window.addEventListener("storage", onStorage);
      window.addEventListener(viewPreferenceEventName, onCustom as EventListener);

      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(viewPreferenceEventName, onCustom as EventListener);
      };
    },
    [storageKey],
  );

  const view = useSyncExternalStore(
    subscribe,
    () => getSnapshot(objectType),
    getServerSnapshot,
  );

  const setView = useCallback(
    (nextView: ViewType) => {
      if (!validViews.has(nextView)) {
        return;
      }

      window.localStorage.setItem(storageKey, nextView);
      window.dispatchEvent(
        new CustomEvent<{ key: string }>(viewPreferenceEventName, {
          detail: { key: storageKey },
        }),
      );
    },
    [storageKey],
  );

  return { view, setView };
}
