/**
 * Agent Tasks page backed by CRM tasks in v1.
 * @module app/(dashboard)/tasks/page
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppIcon } from "@/components/icons/app-icons";
import { applyViewColumns } from "@/components/crm/apply-view-columns";
import { CrmWorkspaceShell } from "@/components/crm/crm-workspace-shell";
import { MobileRecordCard } from "@/components/crm/mobile-record-card";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { useActiveCrmViewState } from "@/components/crm/use-active-crm-view-state";
import { useCrmListRouteState } from "@/components/crm/use-crm-list-route-state";
import { useRecordOpenBehavior } from "@/components/crm/use-record-open-behavior";
import { PageSurface } from "@/components/layout/page-canvas";
import { Button } from "@/components/ui/button";
import type { FilterDef, FilterValues } from "@/components/ui/filter-overlay";
import { ListTable } from "@/components/ui/list-table";
import { buildTaskColumns } from "@/lib/crm/task-columns";
import type { CustomFieldDefinition } from "@/lib/crm/config";
import { crmTaskKeys } from "@/hooks/use-crm-tasks";
import { useCrmTasks } from "@/hooks/use-crm-tasks";
import { useClientId } from "@/hooks/use-client-id";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmViews } from "@/hooks/use-crm-views";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { useUpdateCrmTaskMutation } from "@/hooks/use-update-crm-task";
import { useViewPreference } from "@/hooks/use-view-preference";
import { crmTaskStatusValues, type CrmTask } from "@/lib/crm/schemas";
import {
  getBooleanCustomFields,
  getCustomFieldFilterKeys,
  pickBooleanCustomFieldFilters,
} from "@/lib/crm/custom-field-filters";
import { formatContactFullName, formatCrmDate, formatCrmEnumLabel } from "@/lib/crm/display";
import { captureTimelineActivity } from "@/lib/crm/timeline-capture";
import { timelineActivityKeys } from "@/hooks/use-unified-timeline";
import { supabase } from "@/lib/supabase";

function TaskViewLoading() {
  return (
    <div className="h-48 animate-pulse rounded-md border border-app-border-subtle bg-app-surface" />
  );
}

const TaskKanbanView = dynamic(
  () => import("@/components/crm/task-kanban-view").then((mod) => mod.TaskKanbanView),
  { loading: () => <TaskViewLoading /> },
);

const TaskCalendarView = dynamic(
  () => import("@/components/crm/task-calendar-view").then((mod) => mod.TaskCalendarView),
  { loading: () => <TaskViewLoading /> },
);

const EMPTY_TASK_CUSTOM_FIELDS: CustomFieldDefinition[] = [];

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOpen, recordId, open, close } = useRecordDrawer();
  const { view, setView } = useViewPreference("tasks");
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const updateTask = useUpdateCrmTaskMutation();
  const { data: crmConfigResult } = useCrmConfig();
  const {
    savedViewId,
    handleSavedViewChange: handleSavedViewRouteChange,
  } = useCrmListRouteState({
    basePath: "/tasks",
    replace: router.replace,
    searchParams,
  });
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
  const taskCustomFields = crmConfigResult?.config.task_custom_fields ?? EMPTY_TASK_CUSTOM_FIELDS;
  const taskBooleanCustomFields = useMemo(
    () => getBooleanCustomFields(taskCustomFields),
    [taskCustomFields],
  );
  const taskCustomFieldFilterKeys = useMemo(
    () => getCustomFieldFilterKeys(taskCustomFields),
    [taskCustomFields],
  );

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
        updates: { status: toStatus as CrmTask["status"] },
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

  const taskFilterDefs = useMemo<FilterDef[]>(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: crmTaskStatusValues.map((status) => ({
          value: status,
          label: formatCrmEnumLabel(status),
        })),
      },
      ...taskBooleanCustomFields.map((field) => ({
        id: field.key,
        label: field.label,
        type: "checkbox" as const,
      })),
    ],
    [taskBooleanCustomFields],
  );

  const filters = useMemo(() => {
    if (isSavedViewActive) {
      return {
        viewFilters: activeState?.filters ?? {},
        viewSort: activeState?.sort ?? undefined,
        customFieldFilterKeys: taskCustomFieldFilterKeys,
      };
    }

    return {
      status:
        typeof filterValues.status === "string"
          ? (filterValues.status as CrmTask["status"])
          : undefined,
      viewFilters: pickBooleanCustomFieldFilters(filterValues, taskBooleanCustomFields),
      customFieldFilterKeys: taskCustomFieldFilterKeys,
    };
  }, [activeState?.filters, activeState?.sort, filterValues, isSavedViewActive, taskBooleanCustomFields, taskCustomFieldFilterKeys]);

  const { data: tasks = [], isLoading, isError, refetch } = useCrmTasks(filters);
  const hasLocalFilters = Object.keys(filterValues).length > 0;
  const hasActiveFiltering = isSavedViewActive || hasLocalFilters;
  const tableColumns = useMemo(
    () => buildTaskColumns(taskCustomFields),
    [taskCustomFields],
  );
  const visibleTableColumns = useMemo(
    () => applyViewColumns(tableColumns, activeState),
    [activeState, tableColumns],
  );
  const handleRowClick = useCallback(
    (task: (typeof tasks)[number]) => {
      openRecord(task.task_id);
    },
    [openRecord],
  );

  function handleViewChange(viewId: string | null) {
    handleSavedViewRouteChange(viewId);
  }

  return (
    <CrmWorkspaceShell
      title="Todos"
      entityType="tasks"
      activeViewId={activeSavedView?.view_id ?? null}
      onViewChange={handleViewChange}
      count={isLoading ? undefined : tasks.length}
      filters={taskFilterDefs}
      filterValues={filterValues}
      isSavedViewActive={isSavedViewActive}
      onFilterApply={(nextValues: FilterValues) => setFilterValues(nextValues)}
      onFilterClear={() => setFilterValues({})}
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
            onRowClick={handleRowClick}
            getRowId={(task) => task.task_id}
            selectedRowId={recordId ?? undefined}
            mobileCardRenderer={(task, helpers) => (
              <MobileRecordCard
                title={task.title}
                eyebrow={formatCrmEnumLabel(task.status)}
                meta={task.due_date ? formatCrmDate(task.due_date) : "No due date"}
                isSelected={helpers.isSelected}
                actions={helpers.actions}
                onOpen={helpers.openRow}
                fields={[
                  {
                    label: "Contact",
                    value: task.contacts ? (
                      formatContactFullName(task.contacts)
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    ),
                  },
                  {
                    label: "Deal",
                    value: task.deals?.address ?? <span className="text-muted-foreground">None</span>,
                  },
                  { label: "Updated", value: formatCrmDate(task.updated_at) },
                ]}
              />
            )}
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
          <TaskCalendarView
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
          <TaskKanbanView
            items={tasks}
            onTaskClick={openRecord}
            onTaskStatusChange={handleBoardColumnChange}
          />
        ),
      }}
      drawer={<RecordDrawer isOpen={isOpen} recordId={recordId} objectType="task" onClose={close} />}
    />
  );
}
