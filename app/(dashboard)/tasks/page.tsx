/**
 * Agent Tasks page backed by CRM tasks in v1.
 * @module app/(dashboard)/tasks/page
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AppIcon } from "@/components/icons/app-icons";
import { CrmTasksCalendar } from "@/components/crm/crm-tasks-calendar";
import { CrmTasksTable } from "@/components/crm/crm-tasks-table";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { TaskKanbanCard } from "@/components/crm/task-kanban-card";
import { ViewPicker } from "@/components/crm/view-picker";
import { crmTaskStatusLabelMap } from "@/components/crm/task-status-badge";
import { ViewToggle } from "@/components/crm/view-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crmTaskKeys } from "@/hooks/use-crm-tasks";
import { useCrmTasks } from "@/hooks/use-crm-tasks";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmViews } from "@/hooks/use-crm-views";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useUpdateCrmTaskMutation } from "@/hooks/use-update-crm-task";
import { useViewPreference } from "@/hooks/use-view-preference";
import {
  taskStatusTopBorderMap,
  taskStatusToneClassMap,
} from "@/lib/crm/display";
import { crmTaskStatusValues } from "@/lib/crm/schemas";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { supabase } from "@/lib/supabase";

/** Static kanban column definitions for task statuses (all inputs are module-level constants). */
const taskStatusColumns = crmTaskStatusValues.map((status) => ({
  key: status,
  label: crmTaskStatusLabelMap[status],
  toneClassName: taskStatusToneClassMap[status],
  topBorderClassName: taskStatusTopBorderMap[status],
}));

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const { isOpen, recordId, open, close } = useRecordDrawer();
  const { view, setView } = useViewPreference("tasks");
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const updateTask = useUpdateCrmTaskMutation();
  const savedViewId = searchParams?.get("savedView") ?? null;
  const { data: views } = useCrmViews("tasks");
  const activeSavedView = views?.find((viewItem) => viewItem.view_id === savedViewId) ?? null;

  const createTask = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("crm_tasks")
        .insert({ client_id: clientId, title: "New Task", status: "todo" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (createdTask) => {
      void captureTimelineActivity({
        supabase,
        clientId: createdTask.client_id,
        recordType: "task",
        recordId: createdTask.task_id,
        action: "created",
        actorType: "user",
        after: createdTask,
      }).then((ok) => {
        if (ok) {
          void queryClient.invalidateQueries({
            queryKey: timelineActivityKeys.record("task", createdTask.task_id),
          });
        }
      });

      await queryClient.invalidateQueries({ queryKey: crmTaskKeys.all });
      open(createdTask.task_id);
    },
    onError: () => {
      toast.error("Unable to create task.");
    },
  });

  const handleBoardColumnChange = useCallback(
    async (taskId: string, _fromStatus: string, toStatus: string) => {
      await updateTask.mutateAsync({
        taskId,
        updates: { status: toStatus as (typeof crmTaskStatusValues)[number] },
      });
    },
    [updateTask],
  );

  const handleCalendarTaskDateChange = useCallback(
    async (taskId: string, nextDueDate: string) => {
      await updateTask.mutateAsync({
        taskId,
        updates: { due_date: nextDueDate },
      });
    },
    [updateTask],
  );

  const filters = useMemo(() => {
    if (activeSavedView) {
      return {
        viewFilters: activeSavedView.filters as Record<string, unknown>,
        viewSort: activeSavedView.sort as { column: string; ascending: boolean } | undefined,
      };
    }

    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [activeSavedView, search]);

  const { data: tasks = [], isLoading, isError, refetch } = useCrmTasks(filters);
  const hasLocalFilters = search.trim().length > 0;
  const hasActiveFiltering = Boolean(activeSavedView) || hasLocalFilters;

  function handleViewChange(viewId: string | null) {
    const params = new URLSearchParams(searchParams?.toString());
    if (viewId) {
      params.set("savedView", viewId);
    } else {
      params.delete("savedView");
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? "?" + nextQuery : "/tasks");
  }

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Review follow-ups in a table, board, or calendar without leaving the workspace.
        </p>
      </div>

      <div className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ViewPicker
            entityType="tasks"
            activeViewId={activeSavedView?.view_id ?? null}
            onViewChange={handleViewChange}
          />

          {!activeSavedView && (
            <div className="relative flex-1">
              <AppIcon
                name="search"
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks by title or description..."
                className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
              />
            </div>
          )}

          <ViewToggle current={view} views={["table", "kanban", "calendar"]} onChange={setView} />

          <Button size="sm" onClick={() => createTask.mutate()} disabled={!clientId || createTask.isPending}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load tasks</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <AppIcon name="tasks" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {hasActiveFiltering ? "No tasks match your filters" : "No tasks yet"}
            </p>
          </div>
        ) : view === "table" ? (
          <CrmTasksTable tasks={tasks} onRowClick={open} />
        ) : view === "calendar" ? (
          <CrmTasksCalendar
            onTaskClick={open}
            onTaskDateChange={handleCalendarTaskDateChange}
            tasks={tasks}
          />
        ) : (
          <KanbanBoard
            boardLabel="By Status"
            items={tasks}
            columns={taskStatusColumns}
            groupBy={(task) => task.status}
            getItemId={(task) => task.task_id}
            renderCard={(task) => <TaskKanbanCard task={task} />}
            onCardClick={open}
            onColumnChange={handleBoardColumnChange}
          />
        )}
      </div>

      <RecordDrawer isOpen={isOpen} recordId={recordId} objectType="task" onClose={close} />
    </div>
  );
}
