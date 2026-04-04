/**
 * Full month-grid calendar for CRM tasks with drag-to-reschedule.
 * @module components/crm/calendar-month-grid
 */
"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CalendarDayCard } from "@/components/crm/calendar-day-card";
import { CalendarMonthHeader } from "@/components/crm/calendar-month-header";
import { CalendarMonthWeek } from "@/components/crm/calendar-month-week";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { useCalendarMonthRange } from "@/hooks/use-calendar-month-range";

interface CalendarMonthGridProps {
  month: Date;
  onTaskClick?: (taskId: string) => void;
  onTaskDateChange?: (taskId: string, nextDueDate: string) => Promise<void>;
  tasks: CrmTaskWithRelations[];
}

function getTaskDateKey(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  const normalizedValue = dueDate.trim();
  return normalizedValue.length >= 10 ? normalizedValue.slice(0, 10) : null;
}

function toLocalIsoMidnightFromDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const timezoneMinutes = -date.getTimezoneOffset();
  const sign = timezoneMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(timezoneMinutes);
  const offsetHours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const offsetMinutes = String(absoluteMinutes % 60).padStart(2, "0");

  return `${dateKey}T00:00:00${sign}${offsetHours}:${offsetMinutes}`;
}

function replaceDueDateDatePart(dueDate: string | null, nextDateKey: string) {
  const dateSuffix = dueDate?.match(/^\d{4}-\d{2}-\d{2}(T.*)$/)?.[1];
  return dateSuffix ? `${nextDateKey}${dateSuffix}` : toLocalIsoMidnightFromDateKey(nextDateKey);
}

function sortTasksForDay(tasks: CrmTaskWithRelations[]) {
  return [...tasks].sort((left, right) => {
    if (left.due_date && right.due_date && left.due_date !== right.due_date) {
      return left.due_date.localeCompare(right.due_date);
    }

    return left.title.localeCompare(right.title);
  });
}

/**
 * Renders the full month grid and handles optimistic drag-to-reschedule.
 */
export function CalendarMonthGrid({
  month,
  onTaskClick,
  onTaskDateChange,
  tasks,
}: CalendarMonthGridProps) {
  const { weekDayLabels, weeks } = useCalendarMonthRange(month);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [optimisticDateKeys, setOptimisticDateKeys] = useState<Map<string, string>>(() => new Map());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const { taskById, tasksByDate } = useMemo(() => {
    const groupedTasks: Record<string, CrmTaskWithRelations[]> = {};
    const nextTaskById = new Map<string, CrmTaskWithRelations>();

    for (const task of tasks) {
      nextTaskById.set(task.task_id, task);

      const dateKey = optimisticDateKeys.get(task.task_id) ?? getTaskDateKey(task.due_date);

      if (!dateKey) {
        continue;
      }

      const taskBucket = groupedTasks[dateKey] ?? (groupedTasks[dateKey] = []);
      taskBucket.push(task);
    }

    for (const dateKey of Object.keys(groupedTasks)) {
      groupedTasks[dateKey] = sortTasksForDay(groupedTasks[dateKey]);
    }

    return {
      taskById: nextTaskById,
      tasksByDate: groupedTasks,
    };
  }, [optimisticDateKeys, tasks]);

  useEffect(() => {
    if (optimisticDateKeys.size === 0) {
      return;
    }

    setOptimisticDateKeys((currentDateKeys) => {
      if (currentDateKeys.size === 0) {
        return currentDateKeys;
      }

      let nextDateKeys: Map<string, string> | null = null;

      for (const [taskId, optimisticDateKey] of currentDateKeys) {
        const task = taskById.get(taskId);

        if (task && getTaskDateKey(task.due_date) === optimisticDateKey) {
          nextDateKeys ??= new Map(currentDateKeys);
          nextDateKeys.delete(taskId);
        }
      }

      return nextDateKeys ?? currentDateKeys;
    });
  }, [optimisticDateKeys.size, taskById]);

  const activeTask = activeTaskId ? taskById.get(activeTaskId) ?? null : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTaskId(String(active.id));
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveTaskId(null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTaskId(null);

    if (!over || !onTaskDateChange) {
      return;
    }

    const taskId = String(active.id);
    const nextDateKey = String(over.id);
    const task = taskById.get(taskId);
    const currentDateKey = optimisticDateKeys.get(taskId)
      ?? (typeof active.data.current?.dateKey === "string" ? active.data.current.dateKey : null)
      ?? (task ? getTaskDateKey(task.due_date) : null);

    if (!task || !currentDateKey || currentDateKey === nextDateKey) {
      return;
    }

    setOptimisticDateKeys((currentDateKeys) => {
      const nextDateKeys = new Map(currentDateKeys);
      nextDateKeys.set(taskId, nextDateKey);
      return nextDateKeys;
    });

    try {
      await onTaskDateChange(taskId, replaceDueDateDatePart(task.due_date, nextDateKey));
    } catch {
      setOptimisticDateKeys((currentDateKeys) => {
        const nextDateKeys = new Map(currentDateKeys);
        nextDateKeys.delete(taskId);
        return nextDateKeys;
      });
      toast.error("Unable to reschedule task.");
    }
  };

  return (
    <div className="min-w-[720px]">
      <DndContext
        collisionDetection={closestCenter}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="flex flex-col overflow-hidden rounded-[4px] border border-border/40 bg-card">
          <CalendarMonthHeader weekDayLabels={weekDayLabels} />
          <div className="flex flex-col">
            {weeks.map((days, index) => (
              <CalendarMonthWeek
                key={format(days[0], "yyyy-MM-dd")}
                dragDisabled={!onTaskDateChange}
                days={days}
                isLastWeek={index === weeks.length - 1}
                month={month}
                onTaskClick={onTaskClick}
                tasksByDate={tasksByDate}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeTask ? (
            <CalendarDayCard
              dateKey={getTaskDateKey(activeTask.due_date) ?? format(month, "yyyy-MM-dd")}
              isOverlay
              task={activeTask}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
