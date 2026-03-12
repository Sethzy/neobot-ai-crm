/**
 * Linked task list used by people and deal detail pages.
 * @module components/crm/detail/linked-tasks-section
 */
"use client";

import Link from "next/link";

import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import type { ContactTask } from "@/hooks/use-contact-relations";
import { formatCrmDate } from "@/lib/crm/display";

interface LinkedTasksSectionProps {
  tasks: ContactTask[];
  emptyLabel?: string;
}

/**
 * Renders linked tasks as a stacked list with status and due date metadata.
 */
export function LinkedTasksSection({
  tasks,
  emptyLabel = "No linked tasks yet.",
}: LinkedTasksSectionProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Link
          key={task.task_id}
          href={`/tasks?detail=${task.task_id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-card p-4 shadow-sm transition-colors hover:bg-muted/20"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">{task.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Due {formatCrmDate(task.due_date)}
            </p>
          </div>
          <TaskStatusBadge status={task.status} />
        </Link>
      ))}
    </div>
  );
}
