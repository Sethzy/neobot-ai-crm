/**
 * Mutation hook for updating CRM contact fields.
 * @module hooks/use-update-contact
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { contactKeys } from "@/hooks/use-contacts";
import { type Contact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type ContactUpdate = Partial<
  Pick<Contact, "first_name" | "last_name" | "phone" | "email" | "type" | "notes">
>;

/**
 * Returns a mutation for updating one contact row.
 */
export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: ContactUpdate) => {
      const { error } = await supabase.from("contacts").update(updates).eq("contact_id", contactId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

export type { ContactUpdate };
