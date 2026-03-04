/**
 * Manages record drawer state via `?detail=` URL query param.
 * @module hooks/use-record-drawer
 */
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const detailParamKey = "detail";

interface UseRecordDrawerResult {
  /** Whether the detail drawer should be shown. */
  isOpen: boolean;
  /** Record id extracted from `?detail=` when present. */
  recordId: string | null;
  /** Opens the drawer for a specific record id. */
  open: (recordId: string) => void;
  /** Closes the drawer by removing the `detail` query param. */
  close: () => void;
}

/**
 * Provides a single, reusable contract for query-param-driven drawer state.
 *
 * `open` uses `router.push` so browser Back closes the drawer naturally.
 * `close` uses `router.replace` to drop the param without creating extra history entries.
 */
export function useRecordDrawer(): UseRecordDrawerResult {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const recordId = searchParams?.get(detailParamKey) ?? null;

  const open = useCallback(
    (nextRecordId: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set(detailParamKey, nextRecordId);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete(detailParamKey);

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return useMemo(
    () => ({
      isOpen: Boolean(recordId),
      recordId,
      open,
      close,
    }),
    [close, open, recordId],
  );
}

