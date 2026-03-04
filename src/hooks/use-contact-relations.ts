/**
 * TanStack Query hooks for contact-linked deals and interactions.
 * @module hooks/use-contact-relations
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { type DealContact, type Deal, type Interaction } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type DealContactWithDeal = DealContact & {
  deals: Deal | null;
};

export type InteractionWithContact = Interaction & {
  contacts: { first_name: string; last_name: string } | null;
};

/**
 * Query key factory for contact relation queries.
 */
export const contactRelationKeys = {
  all: ["contact-relations"] as const,
  deals: (contactId: string) => [...contactRelationKeys.all, "deals", contactId] as const,
  interactions: (contactId: string) =>
    [...contactRelationKeys.all, "interactions", contactId] as const,
  dealInteractions: (dealId: string) =>
    [...contactRelationKeys.all, "deal-interactions", dealId] as const,
};

/**
 * Returns deal rows linked to a contact.
 */
export function useContactDeals(contactId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "deal_contacts",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactRelationKeys.deals(contactId)],
    enabled: Boolean(clientId && contactId),
  });

  return useQuery({
    queryKey: contactRelationKeys.deals(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .select("*, deals!deal_contacts_deal_id_fkey(*)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as DealContactWithDeal[];
    },
    enabled: Boolean(contactId),
  });
}

/**
 * Returns interaction rows linked to a contact.
 */
export function useContactInteractions(contactId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "interactions",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactRelationKeys.interactions(contactId)],
    enabled: Boolean(clientId && contactId),
  });

  return useQuery({
    queryKey: contactRelationKeys.interactions(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as Interaction[];
    },
    enabled: Boolean(contactId),
  });
}

/**
 * Returns interaction rows linked to a deal with joined contact names.
 */
export function useDealInteractions(dealId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "interactions",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [contactRelationKeys.dealInteractions(dealId)],
    enabled: Boolean(clientId && dealId),
  });

  return useQuery({
    queryKey: contactRelationKeys.dealInteractions(dealId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*, contacts!interactions_contact_id_fkey(first_name, last_name)")
        .eq("deal_id", dealId)
        .order("occurred_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as InteractionWithContact[];
    },
    enabled: Boolean(dealId),
  });
}
