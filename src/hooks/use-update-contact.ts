/**
 * Mutation hook for updating CRM contact fields.
 * @module hooks/use-update-contact
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  applyCommittedRecordPatch,
  captureRecordCacheSnapshot,
  restoreRecordCacheSnapshot,
} from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { contactKeys, type ContactWithCompany } from "@/hooks/use-contacts";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import {
  validateEmailForSave,
  validatePhoneForSave,
} from "@/lib/crm/normalize";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
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
interface UpdateContactContext {
  cacheSnapshot?: ReturnType<typeof captureRecordCacheSnapshot>;
  didOptimisticUpdate: boolean;
}

/**
 * Returns a mutation for updating one contact row.
 */
function normalizeContactUpdatesForSave(updates: ContactUpdate): ContactUpdate {
  const normalizedUpdates: ContactUpdate = { ...updates };

  if ("phone" in normalizedUpdates) {
    const validation = validatePhoneForSave(normalizedUpdates.phone);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
    normalizedUpdates.phone = validation.value;
  }

  if ("email" in normalizedUpdates) {
    const validation = validateEmailForSave(normalizedUpdates.email);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
    normalizedUpdates.email = validation.value;
  }

  return normalizedUpdates;
}

export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation<UpdateContactResult, Error, ContactUpdate, UpdateContactContext>({
    mutationFn: async (updates: ContactUpdate) => {
      const normalizedUpdates = normalizeContactUpdatesForSave(updates);

      const beforeSnapshot = await supabase
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
        updates: normalizedUpdates,
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
    onMutate: async (updates) => {
      let normalizedUpdates: ContactUpdate;

      try {
        normalizedUpdates = normalizeContactUpdatesForSave(updates);
      } catch {
        return { didOptimisticUpdate: false };
      }

      await queryClient.cancelQueries({ queryKey: contactKeys.all });

      const cacheSnapshot = captureRecordCacheSnapshot({
        queryClient,
        detailKey: contactKeys.detail(contactId),
        listKeyPrefix: contactKeys.lists(),
      });

      applyCommittedRecordPatch<ContactWithCompany>({
        queryClient,
        detailKey: contactKeys.detail(contactId),
        listKeyPrefix: contactKeys.lists(),
        idKey: "contact_id",
        recordId: contactId,
        updates: normalizedUpdates,
      });

      return { cacheSnapshot, didOptimisticUpdate: true };
    },
    onError: (_error, _updates, context) => {
      if (!context?.didOptimisticUpdate || !context.cacheSnapshot) {
        return;
      }

      restoreRecordCacheSnapshot({
        queryClient,
        detailKey: contactKeys.detail(contactId),
        ...context.cacheSnapshot,
      });
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
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("contact", contactId),
          });
        }
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

export type { ContactUpdate };
