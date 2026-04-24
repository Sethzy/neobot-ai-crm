/**
 * Lazily loaded calendar view for CRM tasks.
 * @module components/crm/task-calendar-view
 */
"use client";

import { CrmTasksCalendar } from "@/components/crm/crm-tasks-calendar";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";

interface TaskCalendarViewProps {
  onTaskClick?: (taskId: string) => void;
  onTaskDateChange?: (taskId: string, nextDueDate: string) => Promise<void>;
  tasks: CrmTaskWithRelations[];
}

export function TaskCalendarView({
  onTaskClick,
  onTaskDateChange,
  tasks,
}: TaskCalendarViewProps) {
  return (
    <CrmTasksCalendar
      onTaskClick={onTaskClick}
      onTaskDateChange={onTaskDateChange}
      tasks={tasks}
    />
  );
}
