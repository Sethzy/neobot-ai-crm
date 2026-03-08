/**
 * TanStack Query hooks for CRM deals queries.
 * @module hooks/use-deals
 */
"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildSearchExpression } from "@/lib/crm/postgrest-filters";
import { type Company, type Contact, type Deal, type DealContact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type DealContactJoin = Pick<DealContact, "contact_id" | "role" | "is_primary"> & {
  contacts: Pick<Contact, "first_name" | "last_name"> | null;
};

export type DealWithContact = Deal & {
  deal_contacts: DealContactJoin[];
  companies: Pick<Company, "company_id" | "name"> | null;
};

export interface DealFilters {
  search?: string;
  stage?: Deal["stage"];
}

/**
 * Query key factory for CRM deals list/detail queries.
 */
export const dealKeys = {
  all: ["deals"] as const,
  lists: () => [...dealKeys.all, "list"] as const,
  list: (filters: DealFilters) => [...dealKeys.lists(), filters] as const,
  details: () => [...dealKeys.all, "detail"] as const,
  detail: (dealId: string) => [...dealKeys.details(), dealId] as const,
};

/**
 * Fetches deals with optional free-text and stage filtering.
 */
async function fetchDeals(filters: DealFilters): Promise<DealWithContact[]> {
  let query = supabase
    .from("deals")
    .select("*, deal_contacts!deal_contacts_deal_id_fkey(contact_id, role, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name)), companies!deals_company_id_fkey(company_id, name)")
    .order("updated_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.or(buildSearchExpression(filters.search, ["address", "notes"]));
  }

  if (filters.stage) {
    query = query.eq("stage", filters.stage);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as DealWithContact[];
}

/**
 * Fetches a single deal by deal id with joined contact name.
 */
async function fetchDeal(dealId: string): Promise<DealWithContact> {
  const { data, error } = await supabase
    .from("deals")
    .select("*, deal_contacts!deal_contacts_deal_id_fkey(contact_id, role, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name)), companies!deals_company_id_fkey(company_id, name)")
    .eq("deal_id", dealId)
    .single();

  if (error) {
    throw error;
  }

  return data as DealWithContact;
}

export function dealsQueryOptions(filters: DealFilters) {
  return queryOptions({
    queryKey: dealKeys.list(filters),
    queryFn: () => fetchDeals(filters),
  });
}

export function dealDetailQueryOptions(dealId: string) {
  return queryOptions({
    queryKey: dealKeys.detail(dealId),
    queryFn: () => fetchDeal(dealId),
  });
}

/**
 * Returns deals list query state and subscribes to deals realtime invalidation.
 */
export function useDeals(filters: DealFilters) {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "deals",
    filter: realtimeFilter,
    queryKeys: [dealKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "deal_contacts",
    filter: realtimeFilter,
    queryKeys: [dealKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "companies",
    filter: realtimeFilter,
    queryKeys: [dealKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...dealsQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns a single deal query state by id.
 */
export function useDeal(dealId: string) {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "deals",
    filter: realtimeFilter,
    queryKeys: [dealKeys.detail(dealId)],
    enabled: Boolean(clientId && dealId),
  });

  useRealtimeTable({
    table: "deal_contacts",
    filter: realtimeFilter,
    queryKeys: [dealKeys.detail(dealId)],
    enabled: Boolean(clientId && dealId),
  });

  useRealtimeTable({
    table: "companies",
    filter: realtimeFilter,
    queryKeys: [dealKeys.detail(dealId)],
    enabled: Boolean(clientId && dealId),
  });

  return useQuery({
    ...dealDetailQueryOptions(dealId),
    enabled: Boolean(dealId),
  });
}

export { fetchDeals, fetchDeal };
