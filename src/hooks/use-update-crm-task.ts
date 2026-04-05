/**
 * Mutation hook for updating CRM task fields.
 * @module hooks/use-update-crm-task
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { applyCommittedRecordPatch } from "@/hooks/crm-cache-updates";
import { mergeCustomFieldPatch } from "@/hooks/crm-custom-fields";
import { crmTaskKeys, type CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { type CrmTask } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type CrmTaskUpdate = Partial<Pick<CrmTask, "title" | "status" | "due_date" | "description" | "custom_fields">>;
interface UpdateCrmTaskVariables {
  queryClient: ReturnType<typeof useQueryClient>;
  taskId: string;
  updates: CrmTaskUpdate;
}
type CrmTaskRow = Database["public"]["Tables"]["crm_tasks"]["Row"];
interface PersistCrmTaskUpdateResult {
  beforeSnapshot: CrmTaskRow;
  savedUpdates: CrmTaskUpdate;
  taskId: string;
}

async function persistCrmTaskUpdate({
  queryClient,
  taskId,
  updates,
}: UpdateCrmTaskVariables): Promise<PersistCrmTaskUpdateResult> {
  const cachedSnapshot = queryClient.getQueryData<CrmTaskWithRelations>(crmTaskKeys.detail(taskId));
  const beforeSnapshot: CrmTaskRow = cachedSnapshot
    ?? await supabase
      .from("crm_tasks")
      .select("*")
      .eq("task_id", taskId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }

        return data;
      });

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
    beforeSnapshot,
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

  return useMutation<PersistCrmTaskUpdateResult, Error, Omit<UpdateCrmTaskVariables, "queryClient">>({
    mutationFn: ({ taskId, updates }) =>
      persistCrmTaskUpdate({
        queryClient,
        taskId,
        updates,
      }),
    onSuccess: ({ beforeSnapshot, savedUpdates, taskId }) => {
      applyTaskUpdateSuccess({
        queryClient,
        savedUpdates,
        taskId,
      });

      const afterSnapshot = {
        ...beforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: beforeSnapshot.client_id,
        recordType: "task",
        recordId: taskId,
        action: "updated",
        actorType: "user",
        before: beforeSnapshot,
        after: afterSnapshot,
      });
    },
  });
}

/**
 * Returns a mutation for updating one CRM task row.
 */
export function useUpdateCrmTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation<PersistCrmTaskUpdateResult, Error, CrmTaskUpdate>({
    mutationFn: async (updates: CrmTaskUpdate) =>
      persistCrmTaskUpdate({
        queryClient,
        taskId,
        updates,
      }),
    onSuccess: ({ beforeSnapshot, savedUpdates }) => {
      applyTaskUpdateSuccess({
        queryClient,
        savedUpdates,
        taskId,
      });

      const afterSnapshot = {
        ...beforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: beforeSnapshot.client_id,
        recordType: "task",
        recordId: taskId,
        action: "updated",
        actorType: "user",
        before: beforeSnapshot,
        after: afterSnapshot,
      });
    },
  });
}

export type { CrmTaskUpdate };
