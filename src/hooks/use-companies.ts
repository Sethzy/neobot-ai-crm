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
import { supabase } from "@/lib/supabase";

import { fetchCompanyRelationCounts } from "./use-company-relations";

export interface CompanyFilters {
  search?: string;
  industry?: NonNullable<Company["industry"]>;
}

export type CompanyWithCounts = Company & {
  contact_count: number;
  deal_count: number;
};

/**
 * Query key factory for company list and detail queries.
 */
export const companyKeys = {
  all: ["companies"] as const,
  lists: () => [...companyKeys.all, "list"] as const,
  list: (filters: CompanyFilters) => [...companyKeys.lists(), filters] as const,
  details: () => [...companyKeys.all, "detail"] as const,
  detail: (companyId: string) => [...companyKeys.details(), companyId] as const,
};

async function fetchCompanies(filters: CompanyFilters): Promise<CompanyWithCounts[]> {
  let query = supabase
    .from("companies")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.or(
      buildSearchExpression(filters.search, ["name", "website", "phone", "email", "address", "notes"]),
    );
  }

  if (filters.industry) {
    query = query.eq("industry", filters.industry);
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

export function companiesQueryOptions(filters: CompanyFilters) {
  return queryOptions({
    queryKey: companyKeys.list(filters),
    queryFn: () => fetchCompanies(filters),
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
  });
}
