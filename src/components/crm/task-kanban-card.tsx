/**
 * Card body for CRM task items rendered inside list kanban/calendar views.
 * @module components/crm/task-kanban-card
 */
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { formatContactFullName, formatCrmDate } from "@/lib/crm/display";

interface TaskKanbanCardProps {
  /** CRM task row rendered as card content. */
  task: CrmTaskWithRelations;
}

export function TaskKanbanCard({ task }: TaskKanbanCardProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{task.title}</p>
      {task.due_date ? <p className="text-xs text-muted-foreground">{formatCrmDate(task.due_date)}</p> : null}
      {task.contacts ? (
        <p className="text-xs text-muted-foreground">{formatContactFullName(task.contacts)}</p>
      ) : null}
    </div>
  );
}
