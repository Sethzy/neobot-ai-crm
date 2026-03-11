/**
 * Calendar view for CRM tasks with a selected-day agenda list.
 * @module components/crm/crm-tasks-calendar
 */
"use client";

import { Calendar } from "@/components/ui/calendar";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { formatContactFullName } from "@/lib/crm/display";
import { format } from "date-fns";
import { useMemo, useState } from "react";

interface CrmTasksCalendarProps {
  tasks: CrmTaskWithRelations[];
  onTaskClick?: (taskId: string) => void;
}

/**
 * Extracts the intended due-date day from the stored ISO string without timezone drift.
 */
function getTaskDateKey(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  const normalizedValue = dueDate.trim();
  return normalizedValue.length >= 10 ? normalizedValue.slice(0, 10) : null;
}

/**
 * Converts a `yyyy-MM-dd` key into a stable local calendar date.
 */
function toCalendarDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

/**
 * Formats a `yyyy-MM-dd` key for the agenda heading.
 */
function formatDateKey(dateKey: string) {
  return format(toCalendarDate(dateKey), "d MMM yyyy");
}

export function CrmTasksCalendar({ tasks, onTaskClick }: CrmTasksCalendarProps) {
  const tasksByDate = useMemo(() => {
    return tasks.reduce<Record<string, CrmTaskWithRelations[]>>((groups, task) => {
      const dateKey = getTaskDateKey(task.due_date);

      if (!dateKey) {
        return groups;
      }

      groups[dateKey] = [...(groups[dateKey] ?? []), task];
      return groups;
    }, {});
  }, [tasks]);

  const scheduledDateKeys = useMemo(
    () => Object.keys(tasksByDate).sort((left, right) => left.localeCompare(right)),
    [tasksByDate],
  );
  const scheduledDates = useMemo(
    () => scheduledDateKeys.map((dateKey) => toCalendarDate(dateKey)),
    [scheduledDateKeys],
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(scheduledDateKeys[0] ?? null);
  const activeSelectedDateKey = selectedDateKey ?? scheduledDateKeys[0] ?? null;
  const selectedTasks = activeSelectedDateKey ? tasksByDate[activeSelectedDateKey] ?? [] : [];
  const undatedTaskCount = tasks.length - scheduledDateKeys.reduce(
    (count, dateKey) => count + tasksByDate[dateKey].length,
    0,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
      <section className="rounded-xl border border-border/40 bg-card shadow-sm">
        <Calendar
          mode="single"
          selected={activeSelectedDateKey ? toCalendarDate(activeSelectedDateKey) : undefined}
          defaultMonth={activeSelectedDateKey ? toCalendarDate(activeSelectedDateKey) : undefined}
          onSelect={(nextDate) => {
            if (!nextDate) {
              return;
            }

            setSelectedDateKey(format(nextDate, "yyyy-MM-dd"));
          }}
          modifiers={{ scheduled: scheduledDates }}
          modifiersClassNames={{
            scheduled: "font-semibold text-foreground after:absolute after:bottom-1.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-foreground/70",
          }}
          className="w-full"
        />
      </section>

      <section className="rounded-xl border border-border/40 bg-card shadow-sm">
        <div className="border-b border-border/40 px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Scheduled tasks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeSelectedDateKey
              ? `Tasks due ${formatDateKey(activeSelectedDateKey)}`
              : "Choose a day with scheduled tasks."}
          </p>
          {undatedTaskCount > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {undatedTaskCount} task{undatedTaskCount === 1 ? "" : "s"} without due dates stay in the table and board views.
            </p>
          ) : null}
        </div>

        {selectedTasks.length > 0 ? (
          <div className="divide-y divide-border/30">
            {selectedTasks.map((task) => (
              <button
                key={task.task_id}
                type="button"
                className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
                onClick={() => onTaskClick?.(task.task_id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{task.title}</p>
                    {task.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                    ) : null}
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>

                {(task.contacts || task.deals) ? (
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {task.contacts ? <span>Contact: {formatContactFullName(task.contacts)}</span> : null}
                    {task.deals ? <span>Deal: {task.deals.address}</span> : null}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {activeSelectedDateKey ? `No tasks due ${formatDateKey(activeSelectedDateKey)}.` : "No scheduled tasks yet."}
          </div>
        )}
      </section>
    </div>
  );
}
