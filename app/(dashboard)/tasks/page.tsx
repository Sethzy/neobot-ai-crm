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
import { applyViewColumns } from "@/components/crm/apply-view-columns";
import { CrmWorkspaceShell } from "@/components/crm/crm-workspace-shell";
import { CrmTasksCalendar } from "@/components/crm/crm-tasks-calendar";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { TaskKanbanCard } from "@/components/crm/task-kanban-card";
import { crmTaskStatusLabelMap } from "@/components/crm/task-status-badge";
import { useActiveCrmViewState } from "@/components/crm/use-active-crm-view-state";
import { useRecordOpenBehavior } from "@/components/crm/use-record-open-behavior";
import { PageSurface } from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { taskColumns } from "@/lib/crm/task-columns";
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
  const {
    activeSavedView,
    activeState,
    activeViewType,
    isSavedViewActive,
    openMode,
  } = useActiveCrmViewState({
    activeViewId: savedViewId,
    adHocViewType: view,
    supportedViewTypes: ["table", "kanban", "calendar"],
    views,
  });
  const { openRecord } = useRecordOpenBehavior({
    objectType: "task",
    openDrawer: open,
    openMode,
  });

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
    if (isSavedViewActive) {
      return {
        viewFilters: activeState?.filters ?? {},
        viewSort: activeState?.sort ?? undefined,
      };
    }

    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [activeState?.filters, activeState?.sort, isSavedViewActive, search]);

  const { data: tasks = [], isLoading, isError, refetch } = useCrmTasks(filters);
  const hasLocalFilters = search.trim().length > 0;
  const hasActiveFiltering = isSavedViewActive || hasLocalFilters;
  const visibleTableColumns = useMemo(
    () => applyViewColumns(taskColumns, activeState),
    [activeState],
  );

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
    <CrmWorkspaceShell
      title="Todos"
      description="Review follow-ups in a table, board, or calendar without leaving the workspace."
      entityType="tasks"
      activeViewId={activeSavedView?.view_id ?? null}
      onViewChange={handleViewChange}
      isSavedViewActive={isSavedViewActive}
      searchValue={search}
      searchPlaceholder="Search tasks by title or description..."
      onSearchChange={setSearch}
      primaryAction={(
        <Button size="sm" onClick={() => createTask.mutate()} disabled={!clientId || createTask.isPending}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      )}
      viewType={activeViewType}
      views={["table", "kanban", "calendar"]}
      onViewTypeChange={(nextView) => setView(nextView)}
      bodyByView={{
        table: isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : isError ? (
          <PageSurface className="border-destructive/20 bg-destructive/5 p-6">
            <p className="type-control text-destructive">Unable to load tasks</p>
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
          </PageSurface>
        ) : tasks.length === 0 ? (
          <PageSurface className="p-10 text-center md:p-20">
            <AppIcon name="tasks" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 type-empty-title text-muted-foreground">
              {hasActiveFiltering ? "No tasks match your filters" : "No tasks yet"}
            </p>
          </PageSurface>
        ) : (
          <ListTable
            columns={visibleTableColumns}
            data={tasks}
            initialSorting={[{ id: "due_date", desc: false }]}
            onRowClick={(task) => openRecord(task.task_id)}
          />
        ),
        calendar: isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : isError ? (
          <PageSurface className="border-destructive/20 bg-destructive/5 p-6">
            <p className="type-control text-destructive">Unable to load tasks</p>
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
          </PageSurface>
        ) : tasks.length === 0 ? (
          <PageSurface className="p-10 text-center md:p-20">
            <AppIcon name="tasks" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 type-empty-title text-muted-foreground">
              {hasActiveFiltering ? "No tasks match your filters" : "No tasks yet"}
            </p>
          </PageSurface>
        ) : (
          <CrmTasksCalendar
            onTaskClick={openRecord}
            onTaskDateChange={handleCalendarTaskDateChange}
            tasks={tasks}
          />
        ),
        kanban: isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : isError ? (
          <PageSurface className="border-destructive/20 bg-destructive/5 p-6">
            <p className="type-control text-destructive">Unable to load tasks</p>
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
          </PageSurface>
        ) : tasks.length === 0 ? (
          <PageSurface className="p-10 text-center md:p-20">
            <AppIcon name="tasks" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 type-empty-title text-muted-foreground">
              {hasActiveFiltering ? "No tasks match your filters" : "No tasks yet"}
            </p>
          </PageSurface>
        ) : (
          <KanbanBoard
            boardLabel="By Status"
            items={tasks}
            columns={taskStatusColumns}
            groupBy={(task) => task.status}
            getItemId={(task) => task.task_id}
            renderCard={(task) => <TaskKanbanCard task={task} />}
            onCardClick={openRecord}
            onColumnChange={handleBoardColumnChange}
          />
        ),
      }}
      drawer={<RecordDrawer isOpen={isOpen} recordId={recordId} objectType="task" onClose={close} />}
    />
  );
}
