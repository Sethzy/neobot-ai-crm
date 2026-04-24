/**
 * TanStack Query hooks for CRM companies.
 * @module hooks/use-companies
 */
"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildSearchExpression } from "@/lib/crm/postgrest-filters";
import { type Company } from "@/lib/crm/schemas";
import { applyViewFilters, resolveSymbolicDates } from "@/lib/crm/view-filters";
import { supabase } from "@/lib/supabase";

import { fetchCompanyRelationCounts } from "./use-company-relations";

export interface CompanyFilters {
  search?: string;
  industry?: NonNullable<Company["industry"]>;
  viewFilters?: Record<string, unknown>;
  viewSort?: { column: string; ascending: boolean };
}

export const EMPTY_COMPANY_FILTERS: CompanyFilters = {};

export interface CompanyDateRangeFilter {
  from?: string;
  to?: string;
}

export interface PaginatedCompanyFilters extends CompanyFilters {
  hasEmail?: boolean;
  hasPhone?: boolean;
  createdAt?: CompanyDateRangeFilter;
  page?: number;
  pageSize?: number;
}

export type CompanyWithCounts = Company & {
  contact_count: number;
  deal_count: number;
};

export interface PaginatedCompaniesResult {
  rows: CompanyWithCounts[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

/**
 * Query key factory for company list and detail queries.
 */
const companyAllKey = ["companies"] as const;
const companyListsKey = [...companyAllKey, "list"] as const;
const emptyCompanyListKey = [...companyListsKey, EMPTY_COMPANY_FILTERS] as const;

export const companyKeys = {
  all: companyAllKey,
  lists: () => companyListsKey,
  list: (filters: CompanyFilters) =>
    filters === EMPTY_COMPANY_FILTERS ? emptyCompanyListKey : [...companyListsKey, filters] as const,
  paginatedList: (filters: PaginatedCompanyFilters) =>
    [...companyKeys.lists(), "paginated", filters] as const,
  details: () => [...companyKeys.all, "detail"] as const,
  detail: (companyId: string) => [...companyKeys.details(), companyId] as const,
};

async function fetchCompanies(filters: CompanyFilters): Promise<CompanyWithCounts[]> {
  let query = supabase
    .from("companies")
    .select("*");

  if (filters.viewSort) {
    query = query.order(filters.viewSort.column, { ascending: filters.viewSort.ascending });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  if (filters.search?.trim()) {
    query = query.or(
      buildSearchExpression(filters.search, ["name", "website", "phone", "email", "address"]),
    );
  }

  if (filters.industry) {
    query = query.eq("industry", filters.industry);
  }

  if (filters.viewFilters && Object.keys(filters.viewFilters).length > 0) {
    const resolved = resolveSymbolicDates(filters.viewFilters);
    query = applyViewFilters(query, resolved);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const companies = (data ?? []) as Company[];

  if (companies.length === 0) {
    return [];
  }

  const relationCounts = await fetchCompanyRelationCounts(
    companies.map((company) => company.company_id),
  );

  return companies.map((company) => ({
    ...company,
    contact_count: relationCounts[company.company_id]?.contactCount ?? 0,
    deal_count: relationCounts[company.company_id]?.dealCount ?? 0,
  }));
}

async function fetchPaginatedCompanies({
  search,
  industry,
  hasEmail,
  hasPhone,
  createdAt,
  viewFilters,
  viewSort,
  page = 1,
  pageSize = 20,
}: PaginatedCompanyFilters): Promise<PaginatedCompaniesResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("companies")
    .select("*", { count: "exact" })
    .range(from, to);

  if (viewSort) {
    query = query.order(viewSort.column, { ascending: viewSort.ascending });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  if (search?.trim()) {
    query = query.or(
      buildSearchExpression(search, ["name", "website", "phone", "email", "address"]),
    );
  }

  if (industry) {
    query = query.eq("industry", industry);
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

  if (viewFilters && Object.keys(viewFilters).length > 0) {
    const resolved = resolveSymbolicDates(viewFilters);
    query = applyViewFilters(query, resolved);
  }

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const companies = (data ?? []) as Company[];
  const relationCounts = await fetchCompanyRelationCounts(
    companies.map((company) => company.company_id),
  );
  const total = count ?? 0;

  return {
    rows: companies.map((company) => ({
      ...company,
      contact_count: relationCounts[company.company_id]?.contactCount ?? 0,
      deal_count: relationCounts[company.company_id]?.dealCount ?? 0,
    })),
    total,
    totalPages: total > 0 ? Math.ceil(total / safePageSize) : 1,
    page: safePage,
    pageSize: safePageSize,
  };
}

export function companiesQueryOptions(filters: CompanyFilters) {
  return queryOptions({
    queryKey: companyKeys.list(filters),
    queryFn: () => fetchCompanies(filters),
    staleTime: 5 * 60_000,
  });
}

export function paginatedCompaniesQueryOptions(filters: PaginatedCompanyFilters) {
  return queryOptions({
    queryKey: companyKeys.paginatedList(filters),
    queryFn: () => fetchPaginatedCompanies(filters),
  });
}

export function companyDetailQueryOptions(companyId: string) {
  return queryOptions({
    queryKey: companyKeys.detail(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("company_id", companyId)
        .single();

      if (error) {
        throw error;
      }

      return data as Company;
    },
    staleTime: 30_000,
  });
}

/**
 * Returns company list query state and subscribes to relation-driven invalidation.
 */
export function useCompanies(filters: CompanyFilters) {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "companies",
    filter: realtimeFilter,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "contacts",
    filter: realtimeFilter,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "deals",
    filter: realtimeFilter,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...companiesQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns paginated companies for the customers companies list.
 */
export function usePaginatedCompanies(filters: PaginatedCompanyFilters) {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "companies",
    filter: realtimeFilter,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "contacts",
    filter: realtimeFilter,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "deals",
    filter: realtimeFilter,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...paginatedCompaniesQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns a single company by id.
 */
export function useCompany(companyId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "companies",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyKeys.detail(companyId)],
    enabled: Boolean(clientId && companyId),
  });

  return useQuery({
    ...companyDetailQueryOptions(companyId),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
  });
}

export { fetchPaginatedCompanies };
