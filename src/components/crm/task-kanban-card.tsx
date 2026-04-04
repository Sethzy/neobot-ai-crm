/**
 * Card body for CRM task items rendered inside kanban/calendar views.
 * Layout mirrors Twenty CRM: title, status badge, due date, contact, created date.
 * @module components/crm/task-kanban-card
 */
import { formatDistanceToNow } from "date-fns";

import { AppIcon } from "@/components/icons/app-icons";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { formatContactFullName, formatCrmDate } from "@/lib/crm/display";

interface TaskKanbanCardProps {
  /** CRM task row rendered as card content. */
  task: CrmTaskWithRelations;
}

export function TaskKanbanCard({ task }: TaskKanbanCardProps) {
  const contactName = task.contacts
    ? formatContactFullName(task.contacts)
    : null;

  return (
    <div className="space-y-1.5">
      {/* Title */}
      <span className="block truncate text-sm font-medium text-foreground">
        {task.title}
      </span>

      {/* Field rows */}
      <div className="space-y-1 text-xs text-muted-foreground">
        {/* Status */}
        <div className="flex items-center gap-1.5">
          <AppIcon name="check" className="h-3.5 w-3.5 shrink-0" />
          <TaskStatusBadge status={task.status} />
        </div>

        {/* Due Date */}
        <div className="flex items-center gap-1.5">
          <AppIcon name="calendar" className="h-3.5 w-3.5 shrink-0" />
          <span className={task.due_date ? "" : "text-muted-foreground/40"}>
            {task.due_date ? formatCrmDate(task.due_date) : "Due Date"}
          </span>
        </div>

        {/* Contact */}
        <div className="flex items-center gap-1.5">
          <AppIcon name="person" className="h-3.5 w-3.5 shrink-0" />
          <span className={contactName ? "truncate" : "text-muted-foreground/40"}>
            {contactName ?? "Contact"}
          </span>
        </div>

        {/* Created date */}
        <div className="flex items-center gap-1.5">
          <AppIcon name="schedule" className="h-3.5 w-3.5 shrink-0" />
          <span>
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
