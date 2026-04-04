/**
 * Mutation hook for updating CRM company fields.
 * @module hooks/use-update-company
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applyCommittedRecordPatch } from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { companyKeys, type CompanyWithCounts } from "@/hooks/use-companies";
import { type Company } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type CompanyUpdate = Partial<
  Pick<
    Company,
    "name" | "industry" | "website" | "phone" | "email" | "address" | "custom_fields"
  >
>;

/**
 * Returns a mutation for updating one company row.
 */
export function useUpdateCompany(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: CompanyUpdate) => {
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

      return mergedUpdates;
    },
    onSuccess: (savedUpdates) => {
      applyCommittedRecordPatch<CompanyWithCounts>({
        queryClient,
        detailKey: companyKeys.detail(companyId),
        listKeyPrefix: companyKeys.lists(),
        idKey: "company_id",
        recordId: companyId,
        updates: savedUpdates,
      });
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export type { CompanyUpdate };
