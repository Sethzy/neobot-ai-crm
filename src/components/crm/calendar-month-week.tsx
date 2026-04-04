/**
 * Single week row for the CRM tasks month calendar.
 * @module components/crm/calendar-month-week
 */
"use client";

import { format } from "date-fns";

import { CalendarMonthDay } from "@/components/crm/calendar-month-day";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";

interface CalendarMonthWeekProps {
  days: Date[];
  dragDisabled?: boolean;
  isLastWeek?: boolean;
  month: Date;
  onTaskClick?: (taskId: string) => void;
  tasksByDate: Record<string, CrmTaskWithRelations[]>;
}

/**
 * Renders one week row with seven day cells.
 */
export function CalendarMonthWeek({
  days,
  dragDisabled = false,
  isLastWeek = false,
  month,
  onTaskClick,
  tasksByDate,
}: CalendarMonthWeekProps) {
  return (
    <div className={isLastWeek ? "flex" : "flex border-b border-border/40"}>
      {days.map((day, index) => {
        const dateKey = format(day, "yyyy-MM-dd");

        return (
          <CalendarMonthDay
            key={dateKey}
            day={day}
            dragDisabled={dragDisabled}
            isLastDayOfWeek={index === days.length - 1}
            month={month}
            onTaskClick={onTaskClick}
            tasks={tasksByDate[dateKey] ?? []}
          />
        );
      })}
    </div>
  );
}
