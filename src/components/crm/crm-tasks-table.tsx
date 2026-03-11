/**
 * CRM tasks table with sortable columns for status and due date.
 * @module components/crm/crm-tasks-table
 */
"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState, type MouseEvent } from "react";

import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { useUpdateCrmTask } from "@/hooks/use-update-crm-task";
import { formatContactFullName, formatCrmDate, formatCrmEnumLabel } from "@/lib/crm/display";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";
import { crmTaskStatusValues, type CrmTask } from "@/lib/crm/schemas";

const columnHelper = createColumnHelper<CrmTaskWithRelations>();
const taskStatusOptions = crmTaskStatusValues.map((status) => ({
  value: status,
  label: formatCrmEnumLabel(status),
}));

function TaskStatusCell({ taskId, status }: { taskId: string; status: CrmTask["status"] }) {
  const updateTask = useUpdateCrmTask(taskId);

  return (
    <div className="flex min-w-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <TaskStatusBadge status={status} />
      <QuickEditCell
        ariaLabel="Status"
        value={status}
        hideDisplayValue
        type="select"
        options={taskStatusOptions}
        onSave={async (nextValue) => {
          if (typeof nextValue !== "string") {
            return;
          }

          await updateTask.mutateAsync({ status: nextValue as CrmTask["status"] });
        }}
      />
    </div>
  );
}

function TaskDueDateCell({ taskId, dueDate }: { taskId: string; dueDate: string | null }) {
  const updateTask = useUpdateCrmTask(taskId);

  return (
    <div className="flex min-w-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <span className="whitespace-nowrap text-muted-foreground">{formatCrmDate(dueDate)}</span>
      <QuickEditCell
        ariaLabel="Due Date"
        value={dueDate}
        hideDisplayValue
        type="date"
        onSave={async (nextValue) => {
          await updateTask.mutateAsync({ due_date: typeof nextValue === "string" ? nextValue : null });
        }}
      />
    </div>
  );
}

interface CrmTasksTableProps {
  tasks: CrmTaskWithRelations[];
  /** Called when a user clicks a row outside inline link/button controls. */
  onRowClick?: (taskId: string) => void;
}

export function CrmTasksTable({ tasks, onRowClick }: CrmTasksTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "due_date", desc: false }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Title",
        cell: (info) => <span className="font-medium text-foreground/90">{info.getValue()}</span>,
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
          if (!contact) {
            return <span className="text-muted-foreground">—</span>;
          }

          return formatContactFullName(contact);
        },
      }),
      columnHelper.accessor("deals", {
        id: "deal",
        header: "Deal",
        enableSorting: false,
        cell: (info) => {
          const deal = info.getValue();
          if (!deal) {
            return <span className="text-muted-foreground">—</span>;
          }

          return deal.address;
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, taskId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }

    onRowClick?.(taskId);
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground">No tasks yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 md:px-5 md:py-4"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t border-border/30 transition-colors hover:bg-muted/40"
              onClick={(event) => handleRowClick(event, row.original.task_id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-3 text-[13px] text-foreground/80 md:px-5 md:py-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
