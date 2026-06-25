/**
 * Compact task card rendered inside a calendar day cell.
 * @module components/crm/calendar-day-card
 */
"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";

import { crmTaskStatusLabelMap } from "@/components/crm/task-status-badge";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { taskStatusToneClassMap } from "@/lib/crm/display";
import { cn } from "@/lib/utils";

interface CalendarDayCardProps {
  dateKey: string;
  dragDisabled?: boolean;
  isOverlay?: boolean;
  onTaskClick?: (taskId: string) => void;
  task: CrmTaskWithRelations;
}

function getDueTimeLabel(dueDate: string | null) {
  if (!dueDate || /T00:00(:00(?:\.000)?)?/.test(dueDate)) {
    return null;
  }

  const parsedDate = new Date(dueDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return format(parsedDate, "p");
}

function CalendarDayCardBody({ task }: { task: CrmTaskWithRelations }) {
  const dueTimeLabel = getDueTimeLabel(task.due_date);
  const statusLabel = crmTaskStatusLabelMap[task.status];

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="truncate text-caption leading-4 font-medium text-foreground" title={task.title}>
        {task.title}
      </p>
      <div className="flex min-w-0 items-center gap-1">
        <span
          title={statusLabel}
          className={cn(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded px-1 py-0.5 text-caption leading-4 font-medium",
            taskStatusToneClassMap[task.status],
          )}
        >
          {statusLabel}
        </span>
        {dueTimeLabel ? (
          <span className="min-w-0 truncate whitespace-nowrap text-caption leading-4 text-muted-foreground">
            {dueTimeLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCalendarDayCard({
  dateKey,
  dragDisabled = false,
  onTaskClick,
  task,
}: CalendarDayCardProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: task.task_id,
    data: {
      dateKey,
    },
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-10 min-w-0 rounded-md border border-border/60 bg-card px-1.5 py-1 shadow-xs transition hover:bg-muted/10",
        onTaskClick ? "cursor-pointer" : "",
        isDragging ? "opacity-30" : "",
      )}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      onClick={() => onTaskClick?.(task.task_id)}
      {...attributes}
      {...listeners}
    >
      <CalendarDayCardBody task={task} />
    </div>
  );
}

/**
 * Renders a draggable compact task card for constrained day-cell layouts.
 */
export function CalendarDayCard(props: CalendarDayCardProps) {
  if (props.isOverlay) {
    return (
      <div className="rounded-md border border-border/60 bg-card px-1.5 py-1 shadow-lg">
        <CalendarDayCardBody task={props.task} />
      </div>
    );
  }

  return <DraggableCalendarDayCard {...props} />;
}
