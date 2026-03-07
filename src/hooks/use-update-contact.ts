/**
 * Mutation hook for updating CRM contact fields.
 * @module hooks/use-update-contact
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { contactKeys } from "@/hooks/use-contacts";
import { type Contact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type ContactUpdate = Partial<
  Pick<Contact, "first_name" | "last_name" | "phone" | "email" | "type" | "notes" | "custom_fields">
>;

/**
 * Returns a mutation for updating one contact row.
 */
export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: ContactUpdate) => {
      const mergedUpdates = await mergeCustomFieldPatch({
        table: "contacts",
        idColumn: "contact_id",
        recordId: contactId,
        updates,
      });

      const { error } = await supabase
        .from("contacts")
        .update(mergedUpdates)
        .eq("contact_id", contactId);

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
