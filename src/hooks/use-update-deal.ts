/**
 * Mutation hook for updating CRM deal fields.
 * @module hooks/use-update-deal
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dealKeys } from "@/hooks/use-deals";
import { type Deal } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type DealUpdate = Partial<Pick<Deal, "address" | "stage" | "price" | "notes">>;

/**
 * Returns a mutation for updating one deal row.
 */
export function useUpdateDeal(dealId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: DealUpdate) => {
      const { error } = await supabase.from("deals").update(updates).eq("deal_id", dealId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export type { DealUpdate };
