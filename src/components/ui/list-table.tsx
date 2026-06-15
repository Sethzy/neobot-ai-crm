/**
 * Unified list table used by every authenticated list surface
 * (Tasks, Companies, People, Deals). Visual rhythm matches the Tasks page:
 *
 *   - No outer card — lives on the page canvas directly.
 *   - Column header: compact `h-8` chrome for header/content contrast.
 *   - Row cell:      `h-[41px]` for breathing room, 14px text.
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
  type ColumnSizingState,
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

export interface ListTableMobileCardHelpers {
  actions: React.ReactNode;
  isSelected: boolean;
  openRow: () => void;
  rowId?: string;
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
  /** Freezes the first column to the left of the scroll container (Attio-style). */
  pinFirstColumn?: boolean;
  /** Called after a config-backed column finishes resizing. */
  onColumnResize?: (columnId: string, width: number) => void;
  mobileCardRenderer?: (row: TData, helpers: ListTableMobileCardHelpers) => React.ReactNode;
  className?: string;
}

/** Shared sticky-left classes for the pinned first column's header and cells. */
const PINNED_FIRST_COL_CLASSES =
  "sticky left-0 z-10 bg-background transition-colors duration-[var(--duration-hover)] group-hover/row:bg-app-hover/70";

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
    return null;
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

function renderMobileState(state: React.ReactNode, className?: string) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-app-border-subtle p-4 text-center text-muted-foreground md:hidden",
        className,
      )}
    >
      {state}
    </div>
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
  pinFirstColumn = false,
  onColumnResize,
  mobileCardRenderer,
  className,
}: ListTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting ?? []);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const previousColumnSizingRef = React.useRef<ColumnSizingState>({});
  const isColumnResizeEnabled = typeof onColumnResize === "function";

  const resolvedColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!rowActions) return columns;
    return [
      ...columns,
      {
        id: "__row_actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableResizing: false,
        size: 52,
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
    state: {
      sorting,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: isColumnResizeEnabled,
    columnResizeMode: "onEnd",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  React.useEffect(() => {
    if (!onColumnResize) {
      return;
    }

    const previousColumnSizing = previousColumnSizingRef.current;

    for (const [columnId, width] of Object.entries(columnSizing)) {
      if (previousColumnSizing[columnId] !== width) {
        onColumnResize(columnId, width);
      }
    }

    previousColumnSizingRef.current = columnSizing;
  }, [columnSizing, onColumnResize]);

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const colSpan = visibleLeafColumns.length;
  const startResult =
    pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endResult =
    pagination && pagination.total > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.total)
      : 0;
  const mobileRows = table.getRowModel().rows;

  const renderMobileCards = () => {
    if (!mobileCardRenderer) {
      return null;
    }

    if (isLoading) {
      return (
        <div className="space-y-2 md:hidden" data-testid="list-table-mobile-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-md border border-app-border-subtle bg-app-surface p-3"
            >
              <Skeleton className="mb-3 h-4 w-2/3" />
              <Skeleton className="mb-2 h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return renderMobileState(error, "border-solid border-destructive/20 text-destructive");
    }

    if (mobileRows.length === 0) {
      return renderMobileState(emptyState ?? "No results.");
    }

    return (
      <div className="space-y-2 md:hidden" data-testid="list-table-mobile-cards">
        {mobileRows.map((row) => {
          const rowId = getRowId?.(row.original);
          const isSelected = Boolean(selectedRowId && rowId === selectedRowId);
          const actions = rowActions ? (
            <RowActions
              items={rowActions(row.original)}
              triggerClassName="touch-target text-muted-foreground"
            />
          ) : null;
          const card = mobileCardRenderer(row.original, {
            actions,
            isSelected,
            rowId,
            openRow: () => onRowClick?.(row.original),
          });

          if (React.isValidElement<{ className?: string }>(card)) {
            return React.cloneElement(card, {
              key: row.id,
              className: cn(card.props.className, "md:hidden"),
            });
          }

          return (
            <div key={row.id} className="md:hidden">
              {card}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={cn("w-full min-w-0 overflow-hidden [contain:inline-size]", className)}>
      {renderMobileCards()}
      <div
        className={cn(
          "max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border border-app-border-subtle bg-app-surface [contain:inline-size] [scrollbar-gutter:stable]",
          mobileCardRenderer && "max-md:hidden",
        )}
      >
        <table
          className={cn(
            "w-full",
            mobileCardRenderer && "max-md:hidden",
            isColumnResizeEnabled && "min-w-full table-fixed",
          )}
          style={isColumnResizeEnabled ? { width: table.getTotalSize() } : undefined}
        >
          <thead className="border-b border-app-border-subtle bg-app-surface-muted/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, headerIndex) => {
                  const isActionsColumn = header.column.id === "__row_actions";
                  const isPinnedColumn = pinFirstColumn && headerIndex === 0;
                  const headerWidth = header.getSize();
                  const canResize = isColumnResizeEnabled && header.column.getCanResize();
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        "h-9 px-3 text-left text-meta font-medium text-muted-foreground",
                        canResize && "group/header relative",
                        isActionsColumn && "w-[1%] text-right",
                        isPinnedColumn && "sticky left-0 z-10 bg-background",
                      )}
                      style={isColumnResizeEnabled ? { width: headerWidth } : undefined}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 transition-colors duration-[var(--duration-hover)] hover:text-foreground"
                          onClick={() =>
                            header.column.toggleSorting(header.column.getIsSorted() === "asc")
                          }
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() ? (
                            <span className="text-muted-foreground">
                              {header.column.getIsSorted() === "asc" ? "▲" : "▼"}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="inline-flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                      {canResize ? (
                        <button
                          type="button"
                          aria-label={`Resize ${header.column.id} column`}
                          className={cn(
                            "absolute inset-y-0 right-0 z-20 hidden w-3 translate-x-1/2 cursor-col-resize touch-none sm:block",
                            "after:absolute after:inset-y-1 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-app-border",
                            "opacity-0 transition-opacity group-hover/header:opacity-100",
                            header.column.getIsResizing() && "opacity-100",
                          )}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="group/row border-t border-app-border-subtle/40">
                    {visibleLeafColumns.map((column, colIndex) => {
                      const colId = column.id;
                      const isActionsCol = colId === "__row_actions";
                      const isPinnedCol = pinFirstColumn && colIndex === 0;
                      return (
                        <td
                          key={colIndex}
                          className={cn(
                            "h-[44px] px-3",
                            isActionsCol && "w-[1%] text-right",
                            isPinnedCol && PINNED_FIRST_COL_CLASSES,
                          )}
                          style={isColumnResizeEnabled ? { width: column.getSize() } : undefined}
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
                            "group/row border-t border-app-border-subtle/40",
                            onRowClick && "cursor-pointer transition-colors duration-[var(--duration-hover)] hover:bg-app-hover/70",
                            isSelected && "bg-[var(--selection)] transition-colors duration-[var(--duration-select)]",
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
                          {row.getVisibleCells().map((cell, cellIndex) => {
                            const columnId = cell.column.id;
                            const isActionsColumn = columnId === "__row_actions";
                            const isPinnedCell = pinFirstColumn && cellIndex === 0;
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
                                  "h-[44px] px-3 text-meta text-foreground",
                                  isActionsColumn && "w-[1%] whitespace-nowrap text-right",
                                  isPinnedCell && PINNED_FIRST_COL_CLASSES,
                                  isPinnedCell && isSelected && "bg-[var(--selection)]",
                                )}
                                style={isColumnResizeEnabled ? { width: cell.column.getSize() } : undefined}
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
              className="min-h-11 rounded-md border border-app-border-subtle bg-app-surface px-3 py-1.5 text-foreground transition-colors duration-[var(--duration-hover)] hover:bg-app-hover disabled:pointer-events-none disabled:opacity-50 sm:min-h-0"
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
              className="min-h-11 rounded-md border border-app-border-subtle bg-app-surface px-3 py-1.5 text-foreground transition-colors duration-[var(--duration-hover)] hover:bg-app-hover disabled:pointer-events-none disabled:opacity-50 sm:min-h-0"
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
