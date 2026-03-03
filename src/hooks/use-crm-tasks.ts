/**
 * TanStack Query hooks for CRM tasks queries.
 * @module hooks/use-crm-tasks
 */
"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildCrmTaskSearchOrFilter } from "@/lib/crm/postgrest-filters";
import { type Contact, type CrmTask, type Deal } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type CrmTaskWithRelations = CrmTask & {
  contacts: Pick<Contact, "first_name" | "last_name"> | null;
  deals: Pick<Deal, "address"> | null;
};

export interface CrmTaskFilters {
  status?: CrmTask["status"];
  search?: string;
}

/**
 * Query key factory for CRM tasks list queries.
 */
export const crmTaskKeys = {
  all: ["crm-tasks"] as const,
  lists: () => [...crmTaskKeys.all, "list"] as const,
  list: (filters: CrmTaskFilters) => [...crmTaskKeys.lists(), filters] as const,
};

/**
 * Fetches CRM tasks with optional status and text filters.
 */
async function fetchCrmTasks(filters: CrmTaskFilters): Promise<CrmTaskWithRelations[]> {
  let query = supabase
    .from("crm_tasks")
    .select("*, contacts(first_name, last_name), deals(address)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.search?.trim()) {
    query = query.or(buildCrmTaskSearchOrFilter(filters.search));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as CrmTaskWithRelations[];
}

export function crmTasksQueryOptions(filters: CrmTaskFilters) {
  return queryOptions({
    queryKey: crmTaskKeys.list(filters),
    queryFn: () => fetchCrmTasks(filters),
  });
}

/**
 * Returns CRM tasks list query state and subscribes to task table realtime invalidation.
 */
export function useCrmTasks(filters: CrmTaskFilters) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "crm_tasks",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [crmTaskKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...crmTasksQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

export { fetchCrmTasks };
