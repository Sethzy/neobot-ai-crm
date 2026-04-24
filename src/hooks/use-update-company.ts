/**
 * Mutation hook for updating CRM company fields.
 * @module hooks/use-update-company
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  applyCommittedRecordPatch,
  captureRecordCacheSnapshot,
  restoreRecordCacheSnapshot,
} from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { companyKeys, type CompanyWithCounts } from "@/hooks/use-companies";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import {
  validateEmailForSave,
  validatePhoneForSave,
  validateWebsiteForSave,
} from "@/lib/crm/normalize";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { type Company } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type CompanyUpdate = Partial<
  Pick<
    Company,
    "name" | "industry" | "website" | "phone" | "email" | "address" | "custom_fields"
  >
>;
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
interface UpdateCompanyResult {
  beforeSnapshot: CompanyRow;
  savedUpdates: CompanyUpdate;
}
interface UpdateCompanyContext {
  cacheSnapshot?: ReturnType<typeof captureRecordCacheSnapshot>;
  didOptimisticUpdate: boolean;
}

/**
 * Returns a mutation for updating one company row.
 */
function normalizeCompanyUpdatesForSave(updates: CompanyUpdate): CompanyUpdate {
  const normalizedUpdates: CompanyUpdate = { ...updates };

  if ("website" in normalizedUpdates) {
    const validation = validateWebsiteForSave(normalizedUpdates.website);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
    normalizedUpdates.website = validation.value;
  }

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

export function useUpdateCompany(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation<UpdateCompanyResult, Error, CompanyUpdate, UpdateCompanyContext>({
    mutationFn: async (updates: CompanyUpdate) => {
      const normalizedUpdates = normalizeCompanyUpdatesForSave(updates);

      const beforeSnapshot = await supabase
        .from("companies")
        .select("*")
        .eq("company_id", companyId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            throw error;
          }

          return data;
        });

      const mergedUpdates = await mergeCustomFieldPatch({
        table: "companies",
        idColumn: "company_id",
        recordId: companyId,
        updates: normalizedUpdates,
      });

      const { error } = await supabase
        .from("companies")
        .update(mergedUpdates)
        .eq("company_id", companyId);

      if (error) {
        throw error;
      }

      return {
        beforeSnapshot,
        savedUpdates: mergedUpdates,
      };
    },
    onMutate: async (updates) => {
      let normalizedUpdates: CompanyUpdate;

      try {
        normalizedUpdates = normalizeCompanyUpdatesForSave(updates);
      } catch {
        return { didOptimisticUpdate: false };
      }

      await queryClient.cancelQueries({ queryKey: companyKeys.all });

      const cacheSnapshot = captureRecordCacheSnapshot({
        queryClient,
        detailKey: companyKeys.detail(companyId),
        listKeyPrefix: companyKeys.lists(),
      });

      applyCommittedRecordPatch<CompanyWithCounts>({
        queryClient,
        detailKey: companyKeys.detail(companyId),
        listKeyPrefix: companyKeys.lists(),
        idKey: "company_id",
        recordId: companyId,
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
        detailKey: companyKeys.detail(companyId),
        ...context.cacheSnapshot,
      });
    },
    onSuccess: ({ beforeSnapshot, savedUpdates }) => {
      applyCommittedRecordPatch<CompanyWithCounts>({
        queryClient,
        detailKey: companyKeys.detail(companyId),
        listKeyPrefix: companyKeys.lists(),
        idKey: "company_id",
        recordId: companyId,
        updates: savedUpdates,
      });

      const afterSnapshot = {
        ...beforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: beforeSnapshot.client_id,
        recordType: "company",
        recordId: companyId,
        action: "updated",
        actorType: "user",
        before: beforeSnapshot,
        after: afterSnapshot,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("company", companyId),
          });
        }
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export type { CompanyUpdate };
