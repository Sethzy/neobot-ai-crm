/**
 * Column defs for the Tasks list table. Rendered by `ListTable` from the
 * Tasks page. Split out so cell components keep their own hook usage
 * without bloating the page file.
 *
 * @module lib/crm/task-columns
 */
"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { useUpdateCrmTask } from "@/hooks/use-update-crm-task";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { formatContactFullName, formatCrmDate, formatCrmEnumLabel } from "@/lib/crm/display";
import { crmTaskStatusValues, type CrmTask } from "@/lib/crm/schemas";

const columnHelper = createColumnHelper<CrmTaskWithRelations>();

const taskStatusOptions = crmTaskStatusValues.map((status) => ({
  value: status,
  label: formatCrmEnumLabel(status),
}));

function TaskStatusCell({ taskId, status }: { taskId: string; status: CrmTask["status"] }) {
  const updateTask = useUpdateCrmTask(taskId);
  return (
    <QuickEditCell
      ariaLabel="Status"
      value={status}
      type="select"
      options={taskStatusOptions}
      onSave={async (nextValue) => {
        if (typeof nextValue !== "string") return;
        await updateTask.mutateAsync({ status: nextValue as CrmTask["status"] });
      }}
    >
      <TaskStatusBadge status={status} />
    </QuickEditCell>
  );
}

function TaskDueDateCell({ taskId, dueDate }: { taskId: string; dueDate: string | null }) {
  const updateTask = useUpdateCrmTask(taskId);
  return (
    <QuickEditCell
      ariaLabel="Due Date"
      value={dueDate}
      type="date"
      onSave={async (nextValue) => {
        await updateTask.mutateAsync({
          due_date: typeof nextValue === "string" ? nextValue : null,
        });
      }}
    >
      <span className="whitespace-nowrap text-muted-foreground">{formatCrmDate(dueDate)}</span>
    </QuickEditCell>
  );
}

export const taskColumns: ColumnDef<CrmTaskWithRelations, unknown>[] = [
  columnHelper.accessor("title", {
    header: "Title",
    cell: (info) => <span className="type-row-title">{info.getValue()}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <TaskStatusCell taskId={info.row.original.task_id} status={info.getValue()} />
    ),
  }),
  columnHelper.accessor("due_date", {
    header: "Due Date",
    cell: (info) => (
      <TaskDueDateCell taskId={info.row.original.task_id} dueDate={info.getValue()} />
    ),
  }),
  columnHelper.accessor("contacts", {
    id: "contact",
    header: "Contact",
    enableSorting: false,
    cell: (info) => {
      const contact = info.getValue();
      if (!contact) return <span className="text-muted-foreground">—</span>;
      return formatContactFullName(contact);
    },
  }),
  columnHelper.accessor("created_at", {
    header: "Created",
    cell: (info) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDistanceToNow(new Date(info.getValue()), { addSuffix: true })}
      </span>
    ),
  }),
] as ColumnDef<CrmTaskWithRelations, unknown>[];
