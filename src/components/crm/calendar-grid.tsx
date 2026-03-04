/**
 * Generic read-only month grid for CRM records keyed by date.
 * @module components/crm/calendar-grid
 */
"use client";

import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarGridProps<T> {
  /** Records to place on days. */
  items: T[];
  /** Returns the date associated with a record. */
  getDate: (item: T) => Date;
  /** Returns a stable item id used for keys and click payload. */
  getItemId: (item: T) => string;
  /** Renders the selected-day list row content for each item. */
  renderItem: (item: T) => ReactNode;
  /** Optional initial month shown by the calendar. */
  initialMonth?: Date;
  /** Optional callback when an item row is clicked. */
  onItemClick?: (id: string) => void;
}

const weekdayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function getDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function CalendarGrid<T>({
  items,
  getDate,
  getItemId,
  renderItem,
  initialMonth,
  onItemClick,
}: CalendarGridProps<T>) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    startOfMonth(initialMonth ?? new Date()),
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const itemsByDay = useMemo(() => {
    const groupedItems = new Map<string, T[]>();

    for (const item of items) {
      const dayKey = getDayKey(getDate(item));
      const dayItems = groupedItems.get(dayKey) ?? [];
      dayItems.push(item);
      groupedItems.set(dayKey, dayItems);
    }

    return groupedItems;
  }, [getDate, items]);

  const calendarWeeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const weekStarts = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1 },
    );

    return weekStarts.map((weekStart) =>
      eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
      }),
    );
  }, [currentMonth]);

  const selectedItems = useMemo(() => {
    if (!selectedDate) {
      return [];
    }

    return itemsByDay.get(getDayKey(selectedDate)) ?? [];
  }, [itemsByDay, selectedDate]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Previous month"
          onClick={() => {
            setCurrentMonth((previousMonth) =>
              new Date(previousMonth.getFullYear(), previousMonth.getMonth() - 1, 1),
            );
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <h3 className="text-sm font-semibold">{format(currentMonth, "MMMM yyyy")}</h3>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Next month"
          onClick={() => {
            setCurrentMonth((previousMonth) =>
              new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 1),
            );
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="grid grid-cols-7 gap-1">
        {weekdayHeaders.map((weekday) => (
          <div
            key={weekday}
            className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {weekday}
          </div>
        ))}

        {calendarWeeks.flat().map((day) => {
          const dayKey = getDayKey(day);
          const dayItems = itemsByDay.get(dayKey) ?? [];
          const isSelected = Boolean(selectedDate && isSameDay(day, selectedDate));

          return (
            <button
              key={dayKey}
              type="button"
              aria-label={format(day, "d MMMM yyyy")}
              className={cn(
                "flex min-h-12 flex-col items-center justify-start gap-1 rounded-md px-1 py-1.5 text-xs transition-colors",
                isSelected ? "bg-muted" : "hover:bg-muted/60",
                !isSameMonth(day, currentMonth) && "text-muted-foreground/30",
                isToday(day) && "ring-1 ring-blue-500/60",
              )}
              onClick={() => {
                setSelectedDate(day);
              }}
            >
              <span>{format(day, "d")}</span>

              {dayItems.length > 0 ? (
                <span className="mt-auto flex items-center gap-0.5" aria-hidden="true">
                  {dayItems.slice(0, 3).map((_, index) => (
                    <span key={index} className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <section className="space-y-2 rounded-xl border border-border/40 bg-card p-3">
          <h4 className="text-sm font-medium">{format(selectedDate, "d MMMM yyyy")}</h4>

          {selectedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No items for selected day.</p>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((item) => {
                const itemId = getItemId(item);
                return (
                  <button
                    key={itemId}
                    type="button"
                    className="w-full rounded-lg border border-border/30 bg-muted/10 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                    onClick={() => {
                      onItemClick?.(itemId);
                    }}
                  >
                    {renderItem(item)}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
