/**
 * Month-grid calendar view for CRM tasks.
 * @module components/crm/crm-tasks-calendar
 */
"use client";

import { addMonths, format, subMonths } from "date-fns";
import { useMemo, useState } from "react";

import { CalendarMonthGrid } from "@/components/crm/calendar-month-grid";
import { CalendarTopBar } from "@/components/crm/calendar-top-bar";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { useCalendarMonthRange } from "@/hooks/use-calendar-month-range";

interface CrmTasksCalendarProps {
  onTaskDateChange?: (taskId: string, nextDueDate: string) => Promise<void>;
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

export function CrmTasksCalendar({
  onTaskClick,
  onTaskDateChange,
  tasks,
}: CrmTasksCalendarProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const { firstDay, lastDay } = useCalendarMonthRange(selectedMonth);
  const selectedMonthKey = format(selectedMonth, "yyyy-MM");
  const {
    selectedMonthTaskCount,
    undatedTaskCount,
    visibleRangeTaskCount,
  } = useMemo(() => {
    const firstDateKey = format(firstDay, "yyyy-MM-dd");
    const lastDateKey = format(lastDay, "yyyy-MM-dd");
    let nextSelectedMonthTaskCount = 0;
    let nextUndatedTaskCount = 0;
    let nextVisibleRangeTaskCount = 0;

    for (const task of tasks) {
      const dateKey = getTaskDateKey(task.due_date);

      if (!dateKey) {
        nextUndatedTaskCount += 1;
        continue;
      }

      if (dateKey.startsWith(selectedMonthKey)) {
        nextSelectedMonthTaskCount += 1;
      }

      if (dateKey >= firstDateKey && dateKey <= lastDateKey) {
        nextVisibleRangeTaskCount += 1;
      }
    }

    return {
      selectedMonthTaskCount: nextSelectedMonthTaskCount,
      undatedTaskCount: nextUndatedTaskCount,
      visibleRangeTaskCount: nextVisibleRangeTaskCount,
    };
  }, [firstDay, lastDay, selectedMonthKey, tasks]);

  return (
    <div className="space-y-4">
      <CalendarTopBar
        onNextMonth={() => setSelectedMonth((currentMonth) => addMonths(currentMonth, 1))}
        onPreviousMonth={() => setSelectedMonth((currentMonth) => subMonths(currentMonth, 1))}
        onToday={() => setSelectedMonth(new Date())}
        selectedMonth={selectedMonth}
      />

      <section className="rounded-xl border border-border/40 bg-card shadow-sm">
        <div className="border-b border-border/40 px-5 py-4">
          <h2 className="type-section-title text-foreground">Scheduled tasks</h2>
          <p className="mt-1 type-control-muted text-muted-foreground">
            {selectedMonthTaskCount > 0
              ? `${selectedMonthTaskCount} task${selectedMonthTaskCount === 1 ? "" : "s"} scheduled this month.`
              : "No tasks scheduled this month."}
          </p>
          {visibleRangeTaskCount > 0 && selectedMonthTaskCount !== visibleRangeTaskCount ? (
            <p className="mt-1 type-row-meta text-muted-foreground">
              Adjacent weeks show {visibleRangeTaskCount - selectedMonthTaskCount} task
              {visibleRangeTaskCount - selectedMonthTaskCount === 1 ? "" : "s"} from neighboring months.
            </p>
          ) : null}
          {undatedTaskCount > 0 ? (
            <p className="mt-2 type-row-meta text-muted-foreground">
              {undatedTaskCount} task{undatedTaskCount === 1 ? "" : "s"} without due dates stay in the table and board views.
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto p-4">
          <CalendarMonthGrid
            month={selectedMonth}
            onTaskClick={onTaskClick}
            onTaskDateChange={onTaskDateChange}
            tasks={tasks}
          />
        </div>
      </section>
    </div>
  );
}
