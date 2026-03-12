/**
 * TanStack Query hook for the current authenticated client's message quota.
 * @module hooks/use-message-quota
 */
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { resolveClientId } from "@/lib/chat/client-id";
import { supabase } from "@/lib/supabase";
import {
  getMessageQuotaStatus,
  type MessageQuotaStatus,
} from "@/lib/usage/message-quota";

export const messageQuotaKeys = {
  all: ["message-quota"] as const,
  current: ["message-quota", "current"] as const,
};

const MAX_QUERY_TIMER_DELAY_MS = 2_147_483_647;

function getMessageQuotaResetTime(nextResetDate: string): number {
  return new Date(`${nextResetDate}T00:00:00+08:00`).getTime();
}

export function useMessageQuota(initialQuota?: MessageQuotaStatus | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: messageQuotaKeys.current,
    queryFn: async () => {
      const clientId = await resolveClientId(supabase);
      return getMessageQuotaStatus(supabase, clientId);
    },
    initialData: initialQuota ?? undefined,
    staleTime: 30_000,
  });

  useEffect(() => {
    const nextResetDate = query.data?.nextResetDate;

    if (!nextResetDate) {
      return;
    }

    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      const millisecondsUntilReset = getMessageQuotaResetTime(nextResetDate) - Date.now();

      if (millisecondsUntilReset <= 0) {
        void queryClient.invalidateQueries({ queryKey: messageQuotaKeys.all });
        return;
      }

      timeoutId = window.setTimeout(() => {
        scheduleRefresh();
      }, Math.min(millisecondsUntilReset + 1_000, MAX_QUERY_TIMER_DELAY_MS));
    };

    scheduleRefresh();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [query.data?.nextResetDate, queryClient]);

  return query;
}
