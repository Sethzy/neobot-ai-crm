/**
 * TanStack Query hooks for CRM contacts.
 * @module hooks/use-contacts
 */
"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildContactSearchOrFilter } from "@/lib/crm/postgrest-filters";
import { contactTypeValues, type Contact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type ContactType = (typeof contactTypeValues)[number];

export interface ContactFilters {
  search?: string;
  type?: ContactType;
}

/**
 * Query key factory for contact list and detail queries.
 */
export const contactKeys = {
  all: ["contacts"] as const,
  lists: () => [...contactKeys.all, "list"] as const,
  list: (filters: ContactFilters) => [...contactKeys.lists(), filters] as const,
  details: () => [...contactKeys.all, "detail"] as const,
  detail: (contactId: string) => [...contactKeys.details(), contactId] as const,
};

async function fetchContacts({ search, type }: ContactFilters): Promise<Contact[]> {
  let query = supabase.from("contacts").select("*").order("updated_at", { ascending: false });

  if (search?.trim()) {
    query = query.or(buildContactSearchOrFilter(search));
  }

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as Contact[];
}

export function contactsQueryOptions(filters: ContactFilters) {
  return queryOptions({
    queryKey: contactKeys.list(filters),
    queryFn: () => fetchContacts(filters),
  });
}

export function contactDetailQueryOptions(contactId: string) {
  return queryOptions({
    queryKey: contactKeys.detail(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("contact_id", contactId)
        .single();

      if (error) {
        throw error;
      }

      return data as Contact;
    },
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

  return useQuery({
    ...contactsQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns a single contact by id.
 */
export function useContact(contactId: string) {
  return useQuery({
    ...contactDetailQueryOptions(contactId),
    enabled: Boolean(contactId),
  });
}
