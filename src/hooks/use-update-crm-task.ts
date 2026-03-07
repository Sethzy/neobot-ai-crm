/**
 * Mutation hook for updating CRM task fields.
 * @module hooks/use-update-crm-task
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { crmTaskKeys } from "@/hooks/use-crm-tasks";
import { type CrmTask } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type CrmTaskUpdate = Partial<Pick<CrmTask, "title" | "status" | "due_date" | "description" | "custom_fields">>;

/**
 * Returns a mutation for updating one CRM task row.
 */
export function useUpdateCrmTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: CrmTaskUpdate) => {
      const mergedUpdates = await mergeCustomFieldPatch({
        table: "crm_tasks",
        idColumn: "task_id",
        recordId: taskId,
        updates,
      });

      const { error } = await supabase
        .from("crm_tasks")
        .update(mergedUpdates)
        .eq("task_id", taskId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
    },
  });
}

export type { CrmTaskUpdate };
