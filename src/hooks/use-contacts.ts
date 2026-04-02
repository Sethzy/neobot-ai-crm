/**
 * TanStack Query hooks for CRM contacts.
 * @module hooks/use-contacts
 */
"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildSearchExpression } from "@/lib/crm/postgrest-filters";
import { type Company, type Contact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type ContactType = Contact["type"];
export type ContactWithCompany = Contact & {
  companies: Pick<Company, "company_id" | "name"> | null;
};

export interface ContactFilters {
  search?: string;
  type?: ContactType;
}

export interface ContactDateRangeFilter {
  from?: string;
  to?: string;
}

export interface PaginatedContactFilters extends ContactFilters {
  hasEmail?: boolean;
  hasPhone?: boolean;
  createdAt?: ContactDateRangeFilter;
  page?: number;
  pageSize?: number;
}

export interface PaginatedContactsResult {
  rows: ContactWithCompany[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

/**
 * Query key factory for contact list and detail queries.
 */
export const contactKeys = {
  all: ["contacts"] as const,
  lists: () => [...contactKeys.all, "list"] as const,
  list: (filters: ContactFilters) => [...contactKeys.lists(), filters] as const,
  paginatedList: (filters: PaginatedContactFilters) =>
    [...contactKeys.lists(), "paginated", filters] as const,
  details: () => [...contactKeys.all, "detail"] as const,
  detail: (contactId: string) => [...contactKeys.details(), contactId] as const,
};

async function fetchContacts({ search, type }: ContactFilters): Promise<ContactWithCompany[]> {
  let query = supabase
    .from("contacts")
    .select("*, companies!contacts_company_id_fkey(company_id, name)")
    .order("created_at", { ascending: false });

  if (search?.trim()) {
    query = query.or(buildSearchExpression(search, ["first_name", "last_name", "email", "phone"]));
  }

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as ContactWithCompany[];
}

async function fetchPaginatedContacts({
  search,
  type,
  hasEmail,
  hasPhone,
  createdAt,
  page = 1,
  pageSize = 20,
}: PaginatedContactFilters): Promise<PaginatedContactsResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("contacts")
    .select("*, companies!contacts_company_id_fkey(company_id, name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search?.trim()) {
    query = query.or(buildSearchExpression(search, ["first_name", "last_name", "email", "phone"]));
  }

  if (type) {
    query = query.eq("type", type);
  }

  if (hasEmail === true) {
    query = query.not("email", "is", null);
  }

  if (hasEmail === false) {
    query = query.is("email", null);
  }

  if (hasPhone === true) {
    query = query.not("phone", "is", null);
  }

  if (hasPhone === false) {
    query = query.is("phone", null);
  }

  if (createdAt?.from) {
    query = query.gte("created_at", createdAt.from);
  }

  if (createdAt?.to) {
    query = query.lte("created_at", createdAt.to);
  }

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const total = count ?? 0;

  return {
    rows: (data ?? []) as ContactWithCompany[],
    total,
    totalPages: total > 0 ? Math.ceil(total / safePageSize) : 1,
    page: safePage,
    pageSize: safePageSize,
  };
}

export function contactsQueryOptions(filters: ContactFilters) {
  return queryOptions({
    queryKey: contactKeys.list(filters),
    queryFn: () => fetchContacts(filters),
  });
}

export function paginatedContactsQueryOptions(filters: PaginatedContactFilters) {
  return queryOptions({
    queryKey: contactKeys.paginatedList(filters),
    queryFn: () => fetchPaginatedContacts(filters),
  });
}

export function contactDetailQueryOptions(contactId: string) {
  return queryOptions({
    queryKey: contactKeys.detail(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, companies!contacts_company_id_fkey(company_id, name)")
        .eq("contact_id", contactId)
        .single();

      if (error) {
        throw error;
      }

      return data as ContactWithCompany;
    },
    staleTime: 30_000,
  });
}

/**
 * Subscribes to contact row changes and returns contacts list query state.
 */
export function useContacts(filters: ContactFilters) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "contacts",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "companies",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...contactsQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns paginated contacts for the customers people list.
 */
export function usePaginatedContacts(filters: PaginatedContactFilters) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "contacts",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "companies",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...paginatedContactsQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns a single contact by id.
 */
export function useContact(contactId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "contacts",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactKeys.detail(contactId)],
    enabled: Boolean(clientId && contactId),
  });

  useRealtimeTable({
    table: "companies",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactKeys.detail(contactId)],
    enabled: Boolean(clientId && contactId),
  });

  return useQuery({
    ...contactDetailQueryOptions(contactId),
    enabled: Boolean(contactId),
    placeholderData: keepPreviousData,
  });
}

export { fetchPaginatedContacts };
