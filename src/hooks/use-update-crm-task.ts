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
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
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

interface OptimisticTaskUpdateContext {
  previousDetail: CrmTaskWithRelations | undefined;
  previousLists: Array<[readonly unknown[], unknown]>;
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

function applyTaskUpdatePatch({
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
  applyTaskUpdatePatch({
    queryClient,
    savedUpdates,
    taskId,
  });
  void queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
}

async function applyOptimisticTaskUpdate({
  queryClient,
  taskId,
  updates,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  taskId: string;
  updates: CrmTaskUpdate;
}): Promise<OptimisticTaskUpdateContext> {
  await queryClient.cancelQueries({ queryKey: crmTaskKeys.all });

  const previousDetail = queryClient.getQueryData<CrmTaskWithRelations>(crmTaskKeys.detail(taskId));
  const previousLists = queryClient.getQueriesData({ queryKey: crmTaskKeys.lists() });

  applyTaskUpdatePatch({
    queryClient,
    savedUpdates: updates,
    taskId,
  });

  return {
    previousDetail,
    previousLists,
    taskId,
  };
}

function rollbackOptimisticTaskUpdate({
  context,
  queryClient,
}: {
  context: OptimisticTaskUpdateContext | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  if (!context) {
    return;
  }

  if (context.previousDetail !== undefined) {
    queryClient.setQueryData(crmTaskKeys.detail(context.taskId), context.previousDetail);
  }

  for (const [queryKey, cachedData] of context.previousLists) {
    queryClient.setQueryData(queryKey, cachedData);
  }
}

/**
 * Returns a generic mutation that updates any CRM task row by id.
 */
export function useUpdateCrmTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    PersistCrmTaskUpdateResult,
    Error,
    Omit<UpdateCrmTaskVariables, "queryClient">,
    OptimisticTaskUpdateContext
  >({
    mutationFn: ({ taskId, updates }) =>
      persistCrmTaskUpdate({
        queryClient,
        taskId,
        updates,
      }),
    onMutate: async ({ taskId, updates }) =>
      applyOptimisticTaskUpdate({
        queryClient,
        taskId,
        updates,
      }),
    onError: (_error, _variables, context) => {
      rollbackOptimisticTaskUpdate({
        context,
        queryClient,
      });
      void queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
    },
    onSuccess: ({ beforeSnapshot, savedUpdates, taskId }, _variables, context) => {
      applyTaskUpdateSuccess({
        queryClient,
        savedUpdates,
        taskId,
      });

      const timelineBeforeSnapshot = context?.previousDetail ?? beforeSnapshot;
      const afterSnapshot = {
        ...timelineBeforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: timelineBeforeSnapshot.client_id,
        recordType: "task",
        recordId: taskId,
        action: "updated",
        actorType: "user",
        before: timelineBeforeSnapshot,
        after: afterSnapshot,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("task", taskId),
          });
        }
      });
    },
  });
}

/**
 * Returns a mutation for updating one CRM task row.
 */
export function useUpdateCrmTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation<PersistCrmTaskUpdateResult, Error, CrmTaskUpdate, OptimisticTaskUpdateContext>({
    mutationFn: async (updates: CrmTaskUpdate) =>
      persistCrmTaskUpdate({
        queryClient,
        taskId,
        updates,
      }),
    onMutate: async (updates) =>
      applyOptimisticTaskUpdate({
        queryClient,
        taskId,
        updates,
      }),
    onError: (_error, _variables, context) => {
      rollbackOptimisticTaskUpdate({
        context,
        queryClient,
      });
      void queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
    },
    onSuccess: ({ beforeSnapshot, savedUpdates }, _variables, context) => {
      applyTaskUpdateSuccess({
        queryClient,
        savedUpdates,
        taskId,
      });

      const timelineBeforeSnapshot = context?.previousDetail ?? beforeSnapshot;
      const afterSnapshot = {
        ...timelineBeforeSnapshot,
        ...savedUpdates,
      };

      void captureTimelineActivity({
        supabase,
        clientId: timelineBeforeSnapshot.client_id,
        recordType: "task",
        recordId: taskId,
        action: "updated",
        actorType: "user",
        before: timelineBeforeSnapshot,
        after: afterSnapshot,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("task", taskId),
          });
        }
      });
    },
  });
}

export type { CrmTaskUpdate };
