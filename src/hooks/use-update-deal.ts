/**
 * Mutation hook for updating CRM deal fields.
 * @module hooks/use-update-deal
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";

import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { dealKeys, type DealWithContact } from "@/hooks/use-deals";
import { type Deal } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type DealUpdate = Partial<
  Pick<Deal, "address" | "stage" | "price" | "notes" | "company_id" | "custom_fields">
>;

/**
 * Returns a mutation for updating one deal row.
 */
export function useUpdateDeal(dealId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: DealUpdate) => {
      let previousStage: string | null = null;
      let previousPrice: number | null = null;

      if (updates.stage) {
        const cachedDeal = queryClient.getQueryData<DealWithContact>(dealKeys.detail(dealId));

        if (cachedDeal) {
          previousStage = cachedDeal.stage;
          previousPrice = cachedDeal.price;
        } else {
          const { data: currentDeal } = await supabase
            .from("deals")
            .select("stage, price")
            .eq("deal_id", dealId)
            .maybeSingle();

          previousStage = currentDeal?.stage ?? null;
          previousPrice = currentDeal?.price ?? null;
        }
      }

      const mergedUpdates = await mergeCustomFieldPatch({
        table: "deals",
        idColumn: "deal_id",
        recordId: dealId,
        updates,
      });

      const { error } = await supabase
        .from("deals")
        .update(mergedUpdates)
        .eq("deal_id", dealId);

      if (error) {
        throw error;
      }

      if (updates.stage && previousStage && previousStage !== updates.stage) {
        posthog.capture("deal_stage_changed", {
          from_stage: previousStage,
          to_stage: updates.stage,
          deal_value:
            typeof mergedUpdates.price === "number"
              ? mergedUpdates.price
              : previousPrice,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export type { DealUpdate };
