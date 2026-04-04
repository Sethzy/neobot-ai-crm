/**
 * Mutation hook for updating CRM task fields.
 * @module hooks/use-update-crm-task
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applyCommittedRecordPatch } from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { crmTaskKeys, type CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { type CrmTask } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type CrmTaskUpdate = Partial<Pick<CrmTask, "title" | "status" | "due_date" | "description" | "custom_fields">>;
interface UpdateCrmTaskVariables {
  taskId: string;
  updates: CrmTaskUpdate;
}

async function persistCrmTaskUpdate({
  taskId,
  updates,
}: UpdateCrmTaskVariables) {
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

  return {
    savedUpdates: mergedUpdates,
    taskId,
  };
}

function applyTaskUpdateSuccess({
  queryClient,
  savedUpdates,
  taskId,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  savedUpdates: CrmTaskUpdate;
  taskId: string;
}) {
  applyCommittedRecordPatch<CrmTaskWithRelations>({
    queryClient,
    detailKey: crmTaskKeys.detail(taskId),
    listKeyPrefix: crmTaskKeys.lists(),
    idKey: "task_id",
    recordId: taskId,
    updates: savedUpdates,
  });
  void queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
}

/**
 * Returns a generic mutation that updates any CRM task row by id.
 */
export function useUpdateCrmTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: persistCrmTaskUpdate,
    onSuccess: ({ savedUpdates, taskId }) => {
      applyTaskUpdateSuccess({
        queryClient,
        savedUpdates,
        taskId,
      });
    },
  });
}

/**
 * Returns a mutation for updating one CRM task row.
 */
export function useUpdateCrmTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: CrmTaskUpdate) =>
      persistCrmTaskUpdate({
        taskId,
        updates,
      }),
    onSuccess: ({ savedUpdates }) => {
      applyTaskUpdateSuccess({
        queryClient,
        savedUpdates,
        taskId,
      });
    },
  });
}

export type { CrmTaskUpdate };
