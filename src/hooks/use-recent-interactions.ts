/**
 * TanStack Query hook for the latest CRM interactions across all contacts.
 * @module hooks/use-recent-interactions
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { Contact, Interaction } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type RecentInteraction = Interaction & {
  contacts: Pick<Contact, "contact_id" | "first_name" | "last_name"> | null;
};

export const recentInteractionKeys = {
  all: ["recent-interactions"] as const,
  lists: () => [...recentInteractionKeys.all, "list"] as const,
  list: (limit: number) => [...recentInteractionKeys.lists(), limit] as const,
};

/**
 * Fetches the latest interactions globally, including contact names for dashboard links.
 */
export async function fetchRecentInteractions(
  limit: number,
): Promise<RecentInteraction[]> {
  const { data, error } = await supabase
    .from("interactions")
    .select(
      "*, contacts!interactions_contact_id_fkey(contact_id, first_name, last_name)",
    )
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as RecentInteraction[];
}

/**
 * Returns the latest interactions list and refreshes it when interactions or contact names change.
 */
export function useRecentInteractions(limit: number = 5) {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;
  const isEnabled = Boolean(clientId && limit > 0);

  useRealtimeTable({
    table: "interactions",
    filter: realtimeFilter,
    queryKeys: [recentInteractionKeys.all],
    enabled: isEnabled,
  });

  useRealtimeTable({
    table: "contacts",
    filter: realtimeFilter,
    queryKeys: [recentInteractionKeys.all],
    enabled: isEnabled,
  });

  return useQuery({
    queryKey: recentInteractionKeys.list(limit),
    queryFn: () => fetchRecentInteractions(limit),
    enabled: isEnabled,
  });
}
