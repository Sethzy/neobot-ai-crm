/**
 * CRM-task-specific record drawer body.
 * @module components/crm/record-drawer/task-drawer-content
 */
"use client";

import { type ReactNode, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckSquare2, Clock3, House } from "lucide-react";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { UnifiedTimeline } from "@/components/crm/timeline/unified-timeline";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmConfig } from "@/hooks/use-crm-config";
import { useCrmTask } from "@/hooks/use-crm-tasks";
import { useUpdateCrmTask } from "@/hooks/use-update-crm-task";
import {
  formatCrmEnumLabel,
  parseCustomFieldInputValue,
  formatContactFullName,
  toNullableValue,
} from "@/lib/crm/display";
import { crmTaskStatusValues, type CrmTask } from "@/lib/crm/schemas";

import { CustomFieldEditors } from "./custom-field-editors";
import { DrawerSection } from "./drawer-section";
import { RecordDetailPanelShell } from "./record-detail-panel-shell";

interface TaskDrawerContentProps {
  /** CRM task id selected in the drawer. */
  taskId: string;
}

type TaskDrawerTab = "home" | "timeline";

/**
 * Renders CRM task details with linked records and the unified activity timeline.
 */
export function TaskDrawerContent({ taskId }: TaskDrawerContentProps) {
  const { data: task, isLoading, isError } = useCrmTask(taskId);
  const { data: crmConfigResult } = useCrmConfig();
  const updateTask = useUpdateCrmTask(taskId);
  const [activeTab, setActiveTab] = useState<TaskDrawerTab>("home");

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            <header className="space-y-2">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-3 w-24 shrink-0" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </header>
            <div className="-mx-5 border-b border-border/60 px-5">
              <div className="flex items-center gap-5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex h-10 items-center">
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-px pt-1">
              <Skeleton className="mb-4 h-3 w-12" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-3 w-16 shrink-0" />
                  <Skeleton className="h-3 max-w-[160px] flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !task) {
    return <div className="p-6 text-sm text-destructive">Failed to load task.</div>;
  }

  const taskCustomFields = crmConfigResult?.config.task_custom_fields ?? [];
  const tabs: Array<{ id: TaskDrawerTab; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <House className="h-4 w-4" /> },
    { id: "timeline", label: "Timeline", icon: <Clock3 className="h-4 w-4" /> },
  ];

  return (
    <RecordDetailPanelShell
      title={task.title}
      meta={`Updated ${formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}`}
      avatar={(
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/10 text-primary">
            <CheckSquare2 className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
      )}
      badge={<TaskStatusBadge status={task.status} />}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      maxVisibleTabs={2}
    >
      {activeTab === "home" ? (
        <div className="space-y-5">
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
                options={crmTaskStatusValues.map((status) => ({ value: status, label: formatCrmEnumLabel(status) }))}
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

          {(task.contacts || task.deals) ? (
            <DrawerSection title="Linked Records">
              <div className="space-y-2 text-sm">
                {task.contacts ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Contact</span>
                    <span className="text-foreground/80">{formatContactFullName(task.contacts)}</span>
                  </div>
                ) : null}
                {task.deals ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Deal</span>
                    <span className="text-foreground/80">{task.deals.address}</span>
                  </div>
                ) : null}
              </div>
            </DrawerSection>
          ) : null}
        </div>
      ) : null}

      {activeTab === "timeline" ? (
        <DrawerSection title="Activity">
          <UnifiedTimeline
            recordType="task"
            recordId={taskId}
          />
        </DrawerSection>
      ) : null}
    </RecordDetailPanelShell>
  );
}
