/**
 * Unified list table used by every authenticated list surface
 * (Tasks, Companies, People, Deals). Visual rhythm matches the Tasks page:
 *
 *   - No outer card — lives on the page canvas directly.
 *   - Column header: `type-table-heading` at 12px uppercase caption.
 *   - Row cell:      14px medium in the primary column, 14px regular elsewhere.
 *   - Row padding:   `px-4 py-2.5`.
 *   - Hover:         `bg-app-hover/70` when clickable.
 *
 * Toolbars (search, filter chips, view tabs, page header) are rendered by the
 * caller above the table — not inside the component — so each page can
 * compose its own chrome without the table primitive getting opinionated.
 *
 * @module components/ui/list-table
 */
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { format } from "date-fns";

import { RowActions, type RowActionItem } from "@/components/ui/row-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ListTablePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export interface ListTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pagination?: ListTablePagination;
  isLoading?: boolean;
  error?: React.ReactNode;
  emptyState?: React.ReactNode;
  rowActions?: (row: TData) => RowActionItem[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string;
  getRowId?: (row: TData) => string;
  /** Initial sort state when the table manages its own sorting. */
  initialSorting?: SortingState;
  className?: string;
}

function isDateColumn(columnId: string): boolean {
  const id = columnId.toLowerCase();
  return (
    id.endsWith("_at") ||
    id.endsWith("date") ||
    id.includes("created") ||
    id.includes("updated")
  );
}

function getTruncationClassName(columnId: string): string {
  const id = columnId.toLowerCase();
  if (
    id.includes("name") ||
    id.includes("email") ||
    id.includes("company") ||
    id.includes("address")
  ) {
    return "max-w-[250px]";
  }
  if (
    id.includes("status") ||
    id.includes("type") ||
    id.includes("source") ||
    id.includes("stage")
  ) {
    return "max-w-[180px]";
  }
  if (isDateColumn(id)) return "max-w-[140px] whitespace-nowrap";
  return "max-w-[160px]";
}

function formatMaybeDateValue(value: unknown, columnId: string): string {
  if (!isDateColumn(columnId) || typeof value !== "string") return String(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "yyyy-MM-dd HH:mm");
}

function renderPrimitiveCellValue(value: unknown, columnId: string): React.ReactNode {
  if (value == null || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const display = formatMaybeDateValue(value, columnId);
    return (
      <span
        className={cn("block truncate", getTruncationClassName(columnId))}
        title={display}
      >
        {display}
      </span>
    );
  }
  return null;
}

function renderTableState(state: React.ReactNode, colSpan: number, className?: string) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn("h-24 px-4 py-6 text-center", className)}>
        {state}
      </td>
    </tr>
  );
}

function getSkeletonCellWidth(columnId: string, rowIndex: number): string {
  const id = columnId.toLowerCase();
  if (id === "__row_actions") return "ml-auto w-5";
  if (id.includes("amount") || id.includes("price")) {
    return (["w-16", "w-20", "w-14", "w-18", "w-16", "w-20"] as const)[rowIndex % 6];
  }
  if (id.includes("stage") || id.includes("type") || id.includes("status")) {
    return (["w-20", "w-24", "w-16", "w-20", "w-24", "w-18"] as const)[rowIndex % 6];
  }
  if (isDateColumn(id)) return "w-20";
  return (["w-32", "w-40", "w-28", "w-44", "w-24", "w-36"] as const)[rowIndex % 6];
}

export function ListTable<TData>({
  columns,
  data,
  pagination,
  isLoading = false,
  error,
  emptyState,
  rowActions,
  onRowClick,
  selectedRowId,
  getRowId,
  initialSorting,
  className,
}: ListTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? []);

  const resolvedColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!rowActions) return columns;
    return [
      ...columns,
      {
        id: "__row_actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div
            className="flex justify-end opacity-0 transition-opacity group-hover/row:opacity-100"
            data-actions-cell
            onClick={(event) => event.stopPropagation()}
          >
            <RowActions items={rowActions(row.original)} />
          </div>
        ),
      },
    ];
  }, [columns, rowActions]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the project-standard table engine.
  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const colSpan = resolvedColumns.length;
  const startResult =
    pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endResult =
    pagination && pagination.total > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.total)
      : 0;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-app-border-subtle">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isActionsColumn = header.column.id === "__row_actions";
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-4 py-2.5 text-left",
                        isActionsColumn && "w-[1%] text-right",
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="type-table-heading inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground"
                          onClick={() =>
                            header.column.toggleSorting(header.column.getIsSorted() === "asc")
                          }
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() ? (
                            <span>{header.column.getIsSorted() === "asc" ? "▲" : "▼"}</span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="type-table-heading inline-flex items-center uppercase">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-app-border-subtle/80">
                    {resolvedColumns.map((col, colIndex) => {
                      const colId = (col.id as string | undefined) ?? `col${colIndex}`;
                      const isActionsCol = colId === "__row_actions";
                      return (
                        <td
                          key={colIndex}
                          className={cn(
                            "px-4 py-2.5",
                            isActionsCol && "w-[1%] text-right",
                          )}
                        >
                          <Skeleton
                            className={cn("h-3.5", getSkeletonCellWidth(colId, rowIndex))}
                            style={{ animationDelay: `${rowIndex * 40}ms` }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              : error
                ? renderTableState(error, colSpan, "text-destructive")
                : table.getRowModel().rows.length > 0
                  ? table.getRowModel().rows.map((row) => {
                      const isSelected = Boolean(
                        selectedRowId && getRowId && getRowId(row.original) === selectedRowId,
                      );
                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            "group/row border-t border-app-border-subtle/80",
                            onRowClick && "cursor-pointer transition-colors hover:bg-app-hover/70",
                            isSelected && "bg-app-hover/80",
                          )}
                          onClick={(event) => {
                            if (!onRowClick) return;
                            if (
                              (event.target as HTMLElement).closest(
                                "a,button,input,select,textarea,label,[role='button'],[data-actions-cell]",
                              )
                            ) {
                              return;
                            }
                            onRowClick(row.original);
                          }}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const columnId = cell.column.id;
                            const isActionsColumn = columnId === "__row_actions";
                            const rawValue = cell.getValue();
                            const renderedContent = cell.column.columnDef.cell
                              ? flexRender(cell.column.columnDef.cell, cell.getContext())
                              : renderPrimitiveCellValue(rawValue, columnId);
                            const resolvedContent =
                              typeof renderedContent === "string" ||
                              typeof renderedContent === "number"
                                ? renderPrimitiveCellValue(renderedContent, columnId)
                                : renderedContent ?? renderPrimitiveCellValue(rawValue, columnId);

                            return (
                              <td
                                key={cell.id}
                                className={cn(
                                  "px-4 py-2.5 text-meta text-foreground",
                                  isActionsColumn && "w-[1%] whitespace-nowrap text-right",
                                )}
                              >
                                {resolvedContent}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  : renderTableState(
                      emptyState ?? <span className="text-muted-foreground">No results.</span>,
                      colSpan,
                    )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t border-app-border-subtle px-4 py-3 text-meta text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {startResult} to {endResult} of {pagination.total} results
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              className="rounded-md border border-app-border-subtle bg-app-surface px-3 py-1.5 text-foreground transition-colors hover:bg-app-hover disabled:pointer-events-none disabled:opacity-50"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <span className="whitespace-nowrap">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              className="rounded-md border border-app-border-subtle bg-app-surface px-3 py-1.5 text-foreground transition-colors hover:bg-app-hover disabled:pointer-events-none disabled:opacity-50"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
