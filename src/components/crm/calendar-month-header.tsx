/**
 * Weekday header row for the CRM tasks month calendar.
 * @module components/crm/calendar-month-header
 */
"use client";

interface CalendarMonthHeaderProps {
  weekDayLabels: string[];
}

/**
 * Renders the seven weekday labels above the month grid.
 */
export function CalendarMonthHeader({ weekDayLabels }: CalendarMonthHeaderProps) {
  return (
    <div className="flex border-b border-border/40 bg-muted/20">
      {weekDayLabels.map((label) => (
        <div
          key={label}
          className="flex w-[calc(100%/7)] min-w-0 items-center justify-center px-1 py-2 text-center text-xs font-medium text-muted-foreground"
        >
          {label}
        </div>
      ))}
    </div>
  );
}
