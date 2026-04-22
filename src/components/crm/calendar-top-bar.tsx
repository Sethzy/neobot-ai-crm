/**
 * Calendar navigation controls for the CRM tasks month view.
 * @module components/crm/calendar-top-bar
 */
"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CalendarTopBarProps {
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onToday: () => void;
  selectedMonth: Date;
}

/**
 * Renders the current month label with previous/next and today controls.
 */
export function CalendarTopBar({
  onNextMonth,
  onPreviousMonth,
  onToday,
  selectedMonth,
}: CalendarTopBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="type-control text-foreground">Calendar</p>
        <h2 className="type-section-title text-foreground">{format(selectedMonth, "MMMM yyyy")}</h2>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" aria-label="Previous month" onClick={onPreviousMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Next month" onClick={onNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
      </div>
    </div>
  );
}
