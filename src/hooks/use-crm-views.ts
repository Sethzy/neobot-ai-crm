/**
 * TanStack Query hook for CRM saved views with realtime invalidation.
 * @module hooks/use-crm-views
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { CrmView, CrmViewEntityType } from "@/lib/crm/schemas";
import { normalizeCrmView } from "@/lib/crm/view-state";
import { supabase } from "@/lib/supabase";

/** Query key factory for CRM views. */
export const crmViewKeys = {
  all: ["crm-views"] as const,
  byEntity: (entityType: CrmViewEntityType) =>
    [...crmViewKeys.all, entityType] as const,
};

/**
 * Fetches saved CRM views for an entity type.
 * Subscribes to Supabase realtime so pill tabs update when the agent creates/deletes views.
 */
export function useCrmViews(entityType: CrmViewEntityType) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "crm_views",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [crmViewKeys.byEntity(entityType)],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: crmViewKeys.byEntity(entityType),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_views")
        .select("*")
        .eq("entity_type", entityType)
        .order("is_seeded", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []).map((view) => normalizeCrmView(view)) as CrmView[];
    },
    enabled: Boolean(clientId),
  });
}
