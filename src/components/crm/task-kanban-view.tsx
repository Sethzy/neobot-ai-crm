/**
 * Lazily loaded kanban view for CRM tasks.
 * @module components/crm/task-kanban-view
 */
"use client";

import { KanbanBoard } from "@/components/crm/kanban-board";
import { TaskKanbanCard } from "@/components/crm/task-kanban-card";
import { crmTaskStatusLabelMap } from "@/components/crm/task-status-badge";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { taskStatusTopBorderMap, taskStatusToneClassMap } from "@/lib/crm/display";
import { crmTaskStatusValues } from "@/lib/crm/schemas";

interface TaskKanbanViewProps {
  items: CrmTaskWithRelations[];
  onTaskClick?: (taskId: string) => void;
  onTaskStatusChange?: (taskId: string, fromStatus: string, toStatus: string) => Promise<void>;
}

const taskStatusColumns = crmTaskStatusValues.map((status) => ({
  key: status,
  label: crmTaskStatusLabelMap[status],
  toneClassName: taskStatusToneClassMap[status],
  topBorderClassName: taskStatusTopBorderMap[status],
}));

function getTaskId(task: CrmTaskWithRelations) {
  return task.task_id;
}

function getTaskStatus(task: CrmTaskWithRelations) {
  return task.status;
}

function renderTaskCard(task: CrmTaskWithRelations) {
  return <TaskKanbanCard task={task} />;
}

export function TaskKanbanView({
  items,
  onTaskClick,
  onTaskStatusChange,
}: TaskKanbanViewProps) {
  return (
    <KanbanBoard
      boardLabel="By Status"
      items={items}
      columns={taskStatusColumns}
      groupBy={getTaskStatus}
      getItemId={getTaskId}
      renderCard={renderTaskCard}
      onCardClick={onTaskClick}
      onColumnChange={onTaskStatusChange}
    />
  );
}
