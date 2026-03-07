/**
 * Card body for CRM task items rendered inside kanban/calendar views.
 * Styled to match Twenty CRM card layout with avatar initials.
 * @module components/crm/task-kanban-card
 */
import { AppIcon } from "@/components/icons/app-icons";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { formatContactFullName, formatCrmDate, getAvatarColor } from "@/lib/crm/display";

interface TaskKanbanCardProps {
  /** CRM task row rendered as card content. */
  task: CrmTaskWithRelations;
}

export function TaskKanbanCard({ task }: TaskKanbanCardProps) {
  const contactName = task.contacts
    ? formatContactFullName(task.contacts)
    : null;
  const initial = task.title.charAt(0).toUpperCase();

  return (
    <div className="space-y-1.5">
      {/* Title with avatar initial */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white ${getAvatarColor(task.title)}`}
        >
          {initial}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {task.title}
        </span>
      </div>

      {/* Metadata rows */}
      <div className="space-y-1 text-xs text-muted-foreground">
        {task.due_date ? (
          <div className="flex items-center gap-1.5">
            <AppIcon name="schedule" className="h-3.5 w-3.5 shrink-0" />
            <span>{formatCrmDate(task.due_date)}</span>
          </div>
        ) : null}
        {task.deals?.address ? (
          <div className="flex items-center gap-1.5">
            <AppIcon name="building" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{task.deals.address}</span>
          </div>
        ) : null}
        {contactName ? (
          <div className="flex items-center gap-1.5">
            <AppIcon name="person" className="h-3.5 w-3.5 shrink-0" />
            <span className="inline-flex items-center gap-1.5 truncate">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-medium text-white ${getAvatarColor(contactName)}`}
              >
                {contactName.charAt(0).toUpperCase()}
              </span>
              {contactName}
            </span>
          </div>
        ) : null}
      </div>

      {/* Description preview */}
      {task.description?.trim().length ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/70">
          {task.description}
        </p>
      ) : null}
    </div>
  );
}
