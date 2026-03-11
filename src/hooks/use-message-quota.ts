/**
 * TanStack Query hook for the current authenticated client's message quota.
 * @module hooks/use-message-quota
 */
"use client";

import { useQuery } from "@tanstack/react-query";

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

export function useMessageQuota(initialQuota?: MessageQuotaStatus | null) {
  return useQuery({
    queryKey: messageQuotaKeys.current,
    queryFn: async () => {
      const clientId = await resolveClientId(supabase);
      return getMessageQuotaStatus(supabase, clientId);
    },
    initialData: initialQuota ?? undefined,
    staleTime: 30_000,
  });
}
