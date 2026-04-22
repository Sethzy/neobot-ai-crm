/**
 * Single day cell inside the CRM tasks month calendar.
 * @module components/crm/calendar-month-day
 */
"use client";

import { useDroppable } from "@dnd-kit/core";
import { format, isSameMonth, isToday, isWeekend } from "date-fns";

import { CalendarDayCard } from "@/components/crm/calendar-day-card";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { cn } from "@/lib/utils";

interface CalendarMonthDayProps {
  day: Date;
  dragDisabled?: boolean;
  isLastDayOfWeek?: boolean;
  month: Date;
  onTaskClick?: (taskId: string) => void;
  tasks: CrmTaskWithRelations[];
}

const maxVisibleTasks = 5;

/**
 * Renders one day with task cards and droppable drag feedback.
 */
export function CalendarMonthDay({
  day,
  dragDisabled = false,
  isLastDayOfWeek = false,
  month,
  onTaskClick,
  tasks,
}: CalendarMonthDayProps) {
  const dateKey = format(day, "yyyy-MM-dd");
  const { isOver, setNodeRef } = useDroppable({
    id: dateKey,
    data: {
      dateKey,
    },
  });
  const isCurrentMonth = isSameMonth(day, month);
  const isCurrentDay = isToday(day);
  const isWeekendDay = isWeekend(day);
  const visibleTasks = tasks.slice(0, maxVisibleTasks);
  const overflowTaskCount = tasks.length - visibleTasks.length;

  return (
    <div
      data-testid={`calendar-day-${dateKey}`}
      data-date-key={dateKey}
      className={cn(
        "flex min-h-[122px] w-[calc(100%/7)] min-w-0 flex-col p-1",
        !isLastDayOfWeek && "border-r border-border/40",
        !isCurrentMonth ? "bg-muted/35" : isWeekendDay ? "bg-muted/20" : "bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption font-medium",
            isCurrentDay ? "bg-primary text-primary-foreground" : "",
            !isCurrentDay && isCurrentMonth ? "text-foreground" : "",
            !isCurrentDay && !isCurrentMonth ? "text-muted-foreground" : "",
          )}
        >
          {format(day, "d")}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "mt-1 flex min-h-[60px] flex-1 flex-col gap-0.5 rounded-lg transition-colors",
          isOver ? "bg-primary/5 outline outline-1 outline-dashed outline-primary/50" : "",
        )}
      >
        {visibleTasks.map((task) => (
          <CalendarDayCard
            key={task.task_id}
            dateKey={dateKey}
            dragDisabled={dragDisabled}
            onTaskClick={onTaskClick}
            task={task}
          />
        ))}

        {overflowTaskCount > 0 ? (
          <span className="px-1 text-caption font-medium text-muted-foreground">
            +{overflowTaskCount} more
          </span>
        ) : null}
      </div>
    </div>
  );
}
