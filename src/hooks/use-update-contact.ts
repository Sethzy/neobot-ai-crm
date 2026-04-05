/**
 * Mutation hook for updating CRM contact fields.
 * @module hooks/use-update-contact
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applyCommittedRecordPatch } from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { contactKeys, type ContactWithCompany } from "@/hooks/use-contacts";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { type Contact } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ContactUpdate = Partial<
  Pick<
    Contact,
    "first_name" | "last_name" | "phone" | "email" | "type" | "company_id" | "custom_fields"
  >
>;
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
interface UpdateContactResult {
  beforeSnapshot: ContactRow;
  savedUpdates: ContactUpdate;
}

/**
 * Returns a mutation for updating one contact row.
 */
export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation<UpdateContactResult, Error, ContactUpdate>({
    mutationFn: async (updates: ContactUpdate) => {
      const cachedSnapshot = queryClient.getQueryData(contactKeys.detail(contactId)) as ContactRow | undefined;
      const beforeSnapshot: ContactRow = cachedSnapshot
        ?? await supabase
          .from("contacts")
          .select("*")
          .eq("contact_id", contactId)
          .single()
          .then(({ data, error }) => {
            if (error) {
              throw error;
            }

            return data;
          });

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

      return {
        beforeSnapshot,
        savedUpdates: mergedUpdates,
      };
    },
    onSuccess: ({ beforeSnapshot, savedUpdates }) => {
      applyCommittedRecordPatch<ContactWithCompany>({
        queryClient,
        detailKey: contactKeys.detail(contactId),
        listKeyPrefix: contactKeys.lists(),
        idKey: "contact_id",
        recordId: contactId,
        updates: savedUpdates,
      });

      const afterSnapshot = {
        ...beforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: beforeSnapshot.client_id,
        recordType: "contact",
        recordId: contactId,
        action: "updated",
        actorType: "user",
        before: beforeSnapshot,
        after: afterSnapshot,
      });

      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

export type { ContactUpdate };
