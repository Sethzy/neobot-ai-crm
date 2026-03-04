/**
 * CRM-task-specific record drawer body.
 * @module components/crm/record-drawer/task-drawer-content
 */
"use client";

import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmTask } from "@/hooks/use-crm-tasks";
import { formatContactFullName, formatCrmDate } from "@/lib/crm/display";

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

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{task.title}</h2>
        <TaskStatusBadge status={task.status} />
      </header>

      <DrawerSection title="Details">
        <div className="space-y-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">Due Date</span>
            <span className="text-foreground/80">{formatCrmDate(task.due_date)}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">Description</span>
            <span className="max-w-[220px] text-right text-foreground/80">{task.description ?? "—"}</span>
          </div>
        </div>
      </DrawerSection>

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

