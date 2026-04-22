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

  return (
    <div className="space-y-1">
      <p className="truncate text-caption font-medium text-foreground">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex rounded px-1.5 py-0.5 text-caption font-medium",
            taskStatusToneClassMap[task.status],
          )}
        >
          {crmTaskStatusLabelMap[task.status]}
        </span>
        {dueTimeLabel ? <span className="shrink-0 text-caption text-muted-foreground">{dueTimeLabel}</span> : null}
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
        "rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-sm transition hover:bg-muted/10",
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
      <div className="rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-lg">
        <CalendarDayCardBody task={props.task} />
      </div>
    );
  }

  return <DraggableCalendarDayCard {...props} />;
}
