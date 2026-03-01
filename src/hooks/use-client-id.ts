/**
 * TanStack Query hook for resolving auth user to client_id.
 * @module hooks/use-client-id
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/hooks/use-session";
import { resolveClientId } from "@/lib/chat/client-id";
import { supabase } from "@/lib/supabase";

export const clientIdKeys = {
  all: ["client-id"] as const,
  byUser: (userId: string) => ["client-id", userId] as const,
};

/**
 * Resolves client_id for the currently authenticated user.
 * Cache key is scoped by user id to avoid cross-user stale data.
 */
export function useClientId() {
  const { user, isLoading } = useSession();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: clientIdKeys.byUser(userId ?? "anonymous"),
    queryFn: async (): Promise<string> => resolveClientId(supabase, userId as string),
    enabled: !isLoading && Boolean(userId),
    staleTime: Infinity,
  });
}
