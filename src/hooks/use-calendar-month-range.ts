/**
 * Builds the visible full-week range for the tasks month calendar.
 * @module hooks/use-calendar-month-range
 */
"use client";

import {
  addDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useMemo } from "react";

const calendarWeekStartsOn = 0;

export interface CalendarMonthRange {
  firstDay: Date;
  lastDay: Date;
  weekDayLabels: string[];
  weeks: Date[][];
}

/**
 * Returns the full visible range for a month view, padded to whole weeks.
 */
export function buildCalendarMonthRange(selectedMonth: Date): CalendarMonthRange {
  const firstDay = startOfWeek(startOfMonth(selectedMonth), {
    weekStartsOn: calendarWeekStartsOn,
  });
  const lastDay = endOfWeek(endOfMonth(selectedMonth), {
    weekStartsOn: calendarWeekStartsOn,
  });
  const weekStarts = eachWeekOfInterval(
    {
      start: firstDay,
      end: lastDay,
    },
    {
      weekStartsOn: calendarWeekStartsOn,
    },
  );
  const weeks = weekStarts.map((weekStart) =>
    eachDayOfInterval({
      start: weekStart,
      end: addDays(weekStart, 6),
    }),
  );
  const weekDayLabels = weeks[0]?.map((day) => format(day, "EE").slice(0, 2)) ?? [];

  return {
    firstDay,
    lastDay,
    weekDayLabels,
    weeks,
  };
}

/**
 * Memoized hook wrapper used by the month-grid components.
 */
export function useCalendarMonthRange(selectedMonth: Date) {
  return useMemo(() => buildCalendarMonthRange(selectedMonth), [selectedMonth]);
}
