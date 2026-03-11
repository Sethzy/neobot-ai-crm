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
  createdAt?: DealDateRangeFilter;
}

export interface DealDateRangeFilter {
  from?: string;
  to?: string;
}

export interface PaginatedDealFilters extends DealFilters {
  createdAt?: DealDateRangeFilter;
  page?: number;
  pageSize?: number;
}

export interface PaginatedDealsResult {
  rows: DealWithContact[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

/**
 * Query key factory for CRM deals list/detail queries.
 */
export const dealKeys = {
  all: ["deals"] as const,
  lists: () => [...dealKeys.all, "list"] as const,
  list: (filters: DealFilters) => [...dealKeys.lists(), filters] as const,
  paginatedList: (filters: PaginatedDealFilters) =>
    [...dealKeys.lists(), "paginated", filters] as const,
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

  query = applyDealFilters(query, filters);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as DealWithContact[];
}

async function fetchPaginatedDeals({
  search,
  stage,
  createdAt,
  page = 1,
  pageSize = 20,
}: PaginatedDealFilters): Promise<PaginatedDealsResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("deals")
    .select("*, deal_contacts!deal_contacts_deal_id_fkey(contact_id, role, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name)), companies!deals_company_id_fkey(company_id, name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  query = applyDealFilters(query, { search, stage, createdAt });

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const total = count ?? 0;

  return {
    rows: (data ?? []) as DealWithContact[],
    total,
    totalPages: total > 0 ? Math.ceil(total / safePageSize) : 1,
    page: safePage,
    pageSize: safePageSize,
  };
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

export function paginatedDealsQueryOptions(filters: PaginatedDealFilters) {
  return queryOptions({
    queryKey: dealKeys.paginatedList(filters),
    queryFn: () => fetchPaginatedDeals(filters),
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
 * Returns paginated deals for the customers deals list.
 */
export function usePaginatedDeals(filters: PaginatedDealFilters) {
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
    ...paginatedDealsQueryOptions(filters),
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

export { fetchDeals, fetchDeal, fetchPaginatedDeals };

function applyDealFilters<TQuery extends {
  or: (filter: string) => TQuery;
  eq: (column: string, value: string) => TQuery;
  gte: (column: string, value: string) => TQuery;
  lte: (column: string, value: string) => TQuery;
}>(query: TQuery, filters: DealFilters): TQuery {
  let nextQuery = query;

  if (filters.search?.trim()) {
    nextQuery = nextQuery.or(buildSearchExpression(filters.search, ["address", "notes"]));
  }

  if (filters.stage) {
    nextQuery = nextQuery.eq("stage", filters.stage);
  }

  if (filters.createdAt?.from) {
    nextQuery = nextQuery.gte("created_at", filters.createdAt.from);
  }

  if (filters.createdAt?.to) {
    nextQuery = nextQuery.lte("created_at", filters.createdAt.to);
  }

  return nextQuery;
}
