/**
 * Mutation hook for updating CRM company fields.
 * @module hooks/use-update-company
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applyCommittedRecordPatch } from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { companyKeys, type CompanyWithCounts } from "@/hooks/use-companies";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
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

/**
 * Returns a mutation for updating one company row.
 */
export function useUpdateCompany(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation<UpdateCompanyResult, Error, CompanyUpdate>({
    mutationFn: async (updates: CompanyUpdate) => {
      const cachedSnapshot = queryClient.getQueryData(companyKeys.detail(companyId)) as CompanyRow | undefined;
      const beforeSnapshot: CompanyRow = cachedSnapshot
        ?? await supabase
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
        updates,
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

      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export type { CompanyUpdate };
