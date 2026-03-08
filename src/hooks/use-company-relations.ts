/**
 * TanStack Query hooks for company-linked contacts and deals.
 * @module hooks/use-company-relations
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import type { Contact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

import type { DealWithContact } from "./use-deals";

export const companyRelationKeys = {
  all: ["company-relations"] as const,
  contacts: (companyId: string) => [...companyRelationKeys.all, "contacts", companyId] as const,
  deals: (companyId: string) => [...companyRelationKeys.all, "deals", companyId] as const,
  counts: () => [...companyRelationKeys.all, "counts"] as const,
};

export type CompanyRelationCounts = Record<string, {
  contactCount: number;
  dealCount: number;
}>;

function countByCompanyId(rows: Array<{ company_id: string | null }>) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.company_id) {
      continue;
    }

    counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
  }

  return counts;
}

/**
 * Fetches aggregated contact/deal counts keyed by company id.
 */
export async function fetchCompanyRelationCounts(
  companyIds?: string[],
): Promise<CompanyRelationCounts> {
  if (companyIds && companyIds.length === 0) {
    return {};
  }

  let contactQuery = supabase.from("contacts").select("company_id");
  let dealQuery = supabase.from("deals").select("company_id");

  if (companyIds) {
    contactQuery = contactQuery.in("company_id", companyIds);
    dealQuery = dealQuery.in("company_id", companyIds);
  } else {
    contactQuery = contactQuery.not("company_id", "is", null);
    dealQuery = dealQuery.not("company_id", "is", null);
  }

  const [{ data: contactRows, error: contactError }, { data: dealRows, error: dealError }] =
    await Promise.all([contactQuery, dealQuery]);

  if (contactError) {
    throw contactError;
  }

  if (dealError) {
    throw dealError;
  }

  const contactCounts = countByCompanyId(
    (contactRows ?? []) as Array<{ company_id: string | null }>,
  );
  const dealCounts = countByCompanyId(
    (dealRows ?? []) as Array<{ company_id: string | null }>,
  );
  const allCompanyIds = new Set([...contactCounts.keys(), ...dealCounts.keys()]);

  return Object.fromEntries(
    Array.from(allCompanyIds).map((companyId) => [
      companyId,
      {
        contactCount: contactCounts.get(companyId) ?? 0,
        dealCount: dealCounts.get(companyId) ?? 0,
      },
    ]),
  );
}

/**
 * Returns contact rows linked to a company.
 */
export function useCompanyContacts(companyId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "contacts",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyRelationKeys.contacts(companyId)],
    enabled: Boolean(clientId && companyId),
  });

  return useQuery({
    queryKey: companyRelationKeys.contacts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as Contact[];
    },
    enabled: Boolean(companyId),
  });
}

/**
 * Returns deal rows linked to a company with joined contact summaries.
 */
export function useCompanyDeals(companyId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "deals",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyRelationKeys.deals(companyId)],
    enabled: Boolean(clientId && companyId),
  });

  return useQuery({
    queryKey: companyRelationKeys.deals(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, deal_contacts!deal_contacts_deal_id_fkey(contact_id, role, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name))")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as DealWithContact[];
    },
    enabled: Boolean(companyId),
  });
}

/**
 * Returns aggregated contact/deal counts for all linked companies.
 */
export function useCompanyRelationCounts() {
  const { data: clientId } = useClientId();
  const realtimeFilter = clientId ? `client_id=eq.${clientId}` : undefined;

  useRealtimeTable({
    table: "contacts",
    filter: realtimeFilter,
    queryKeys: [companyRelationKeys.counts()],
    enabled: Boolean(clientId),
  });

  useRealtimeTable({
    table: "deals",
    filter: realtimeFilter,
    queryKeys: [companyRelationKeys.counts()],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: companyRelationKeys.counts(),
    queryFn: () => fetchCompanyRelationCounts(),
    enabled: Boolean(clientId),
  });
}
