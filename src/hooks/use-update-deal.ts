/**
 * Mutation hook for updating CRM deal fields.
 * @module hooks/use-update-deal
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";

import { applyCommittedRecordPatch } from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { dealKeys, type DealWithContact } from "@/hooks/use-deals";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { type Deal } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type DealUpdate = Partial<
  Pick<Deal, "address" | "stage" | "amount" | "company_id" | "custom_fields">
>;
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
interface UpdateDealResult {
  beforeSnapshot: DealRow;
  savedUpdates: DealUpdate;
}

/**
 * Returns a mutation for updating one deal row.
 */
export function useUpdateDeal(dealId: string) {
  const queryClient = useQueryClient();

  return useMutation<UpdateDealResult, Error, DealUpdate>({
    mutationFn: async (updates: DealUpdate) => {
      const cachedSnapshot = queryClient.getQueryData(dealKeys.detail(dealId)) as DealRow | undefined;
      const beforeSnapshot: DealRow = cachedSnapshot
        ?? await supabase
          .from("deals")
          .select("*")
          .eq("deal_id", dealId)
          .single()
          .then(({ data, error }) => {
            if (error) {
              throw error;
            }

            return data;
          });

      const previousStage = beforeSnapshot.stage ?? null;
      const previousAmount = beforeSnapshot.amount ?? null;

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
            typeof mergedUpdates.amount === "number"
              ? mergedUpdates.amount
              : previousAmount,
        });
      }

      return {
        beforeSnapshot,
        savedUpdates: mergedUpdates,
      };
    },
    onSuccess: ({ beforeSnapshot, savedUpdates }) => {
      applyCommittedRecordPatch<DealWithContact>({
        queryClient,
        detailKey: dealKeys.detail(dealId),
        listKeyPrefix: dealKeys.lists(),
        idKey: "deal_id",
        recordId: dealId,
        updates: savedUpdates,
      });

      const afterSnapshot = {
        ...beforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: beforeSnapshot.client_id,
        recordType: "deal",
        recordId: dealId,
        action: "updated",
        actorType: "user",
        before: beforeSnapshot,
        after: afterSnapshot,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("deal", dealId),
          });
        }
      });

      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export type { DealUpdate };
