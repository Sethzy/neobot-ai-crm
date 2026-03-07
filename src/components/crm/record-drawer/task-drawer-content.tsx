/**
 * CRM-task-specific record drawer body.
 * @module components/crm/record-drawer/task-drawer-content
 */
"use client";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmTask } from "@/hooks/use-crm-tasks";
import { useUpdateCrmTask } from "@/hooks/use-update-crm-task";
import {
  parseCustomFieldInputValue,
  formatContactFullName,
  toNullableValue,
} from "@/lib/crm/display";
import { crmTaskStatusValues, type CrmTask } from "@/lib/crm/schemas";

import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";

interface TaskDrawerContentProps {
  /** CRM task id selected in the drawer. */
  taskId: string;
}

/**
 * Renders CRM task details with linked contact/deal context.
 */
export function TaskDrawerContent({ taskId }: TaskDrawerContentProps) {
  const { data: task, isLoading, isError } = useCrmTask(taskId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateTask = useUpdateCrmTask(taskId);

  const toTitleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (isError || !task) {
    return <div className="p-6 text-sm text-destructive">Failed to load task.</div>;
  }

  const taskCustomFields = crmConfigResult?.config.task_custom_fields ?? [];

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{task.title}</h2>
        <TaskStatusBadge status={task.status} />
      </header>

      <DrawerSection title="Details">
        <div className="space-y-0.5">
          <InlineEditField
            label="Title"
            value={task.title}
            onSave={async (nextValue) => {
              await updateTask.mutateAsync({ title: nextValue.trim() });
            }}
          />
          <InlineEditField
            label="Status"
            value={task.status}
            type="select"
            options={crmTaskStatusValues.map((status) => ({ value: status, label: toTitleCase(status) }))}
            onSave={async (nextValue) => {
              await updateTask.mutateAsync({ status: nextValue as CrmTask["status"] });
            }}
          />
          <InlineEditField
            label="Due Date"
            value={task.due_date}
            type="date"
            onSave={async (nextValue) => {
              await updateTask.mutateAsync({ due_date: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Description"
            value={task.description}
            type="textarea"
            onSave={async (nextValue) => {
              await updateTask.mutateAsync({ description: toNullableValue(nextValue) });
            }}
          />
        </div>
      </DrawerSection>

      {taskCustomFields.length > 0 ? (
        <DrawerSection title="Custom Fields">
          <CustomFieldEditors
            definitions={taskCustomFields}
            values={(task.custom_fields as Record<string, unknown> | null | undefined) ?? {}}
            onSaveField={async (definition, nextValue) => {
              await updateTask.mutateAsync({
                custom_fields: {
                  [definition.key]: parseCustomFieldInputValue(definition.type, nextValue),
                },
              });
            }}
          />
        </DrawerSection>
      ) : null}

      {(task.contacts || task.deals) && (
        <DrawerSection title="Linked Records">
          <div className="space-y-2 text-sm">
            {task.contacts && (
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">Contact</span>
                <span className="text-foreground/80">{formatContactFullName(task.contacts)}</span>
              </div>
            )}
            {task.deals && (
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">Deal</span>
                <span className="text-foreground/80">{task.deals.address}</span>
              </div>
            )}
          </div>
        </DrawerSection>
      )}
    </div>
  );
}
