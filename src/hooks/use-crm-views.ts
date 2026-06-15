/**
 * TanStack Query hook for CRM saved views with realtime invalidation.
 * @module hooks/use-crm-views
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { CrmView, CrmViewEntityType } from "@/lib/crm/schemas";
import { normalizeCrmView } from "@/lib/crm/view-state";
import { supabase } from "@/lib/supabase";

function customFieldKeysFor(
  entityType: CrmViewEntityType,
  config: ReturnType<typeof useCrmConfig>["data"],
): string[] {
  if (!config?.config) return [];
  switch (entityType) {
    case "contacts":
      return (config.config.contact_custom_fields ?? []).map((f) => f.key);
    case "companies":
      return (config.config.company_custom_fields ?? []).map((f) => f.key);
    case "deals":
      return (config.config.deal_custom_fields ?? []).map((f) => f.key);
    case "tasks":
      return (config.config.task_custom_fields ?? []).map((f) => f.key);
    default:
      return [];
  }
}

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
  const { data: crmConfig } = useCrmConfig();

  useRealtimeTable({
    table: "crm_views",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [crmViewKeys.byEntity(entityType)],
    enabled: Boolean(clientId),
  });

  const customFieldKeys = customFieldKeysFor(entityType, crmConfig);

  return useQuery({
    // Include custom-field keys in the query key so the cache invalidates when
    // configure_crm adds a new field — without this, normalizeCrmView would
    // strip filters using the stale key set.
    queryKey: [...crmViewKeys.byEntity(entityType), customFieldKeys],
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

      return (data ?? []).map((view) =>
        normalizeCrmView(view, { customFieldKeys }),
      ) as CrmView[];
    },
    enabled: Boolean(clientId),
  });
}
