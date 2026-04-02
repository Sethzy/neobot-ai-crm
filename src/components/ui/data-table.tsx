/**
 * Shared CRM data table shell for people, companies, and deals list pages.
 * It wraps TanStack Table with the shared title, filters, loading states,
 * pagination footer, and trailing row action column.
 * @module components/ui/data-table
 */
"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal } from "lucide-react"

import { FilterBar, type FilterDef, type FilterValues } from "@/components/ui/filter-bar"
import { Button } from "@/components/ui/button"
import { RowActions, type RowActionItem } from "@/components/ui/row-actions"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * Describes the pagination contract used by the shared CRM list tables.
 */
export interface DataTablePagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
}

/**
 * Defines the simplified shared CRM table props that list pages consume directly.
 */
export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  title?: React.ReactNode
  actions?: React.ReactNode
  refreshButton?: React.ReactNode
  pagination?: DataTablePagination
  isLoading?: boolean
  error?: React.ReactNode
  emptyState?: React.ReactNode
  rowActions?: (row: TData) => RowActionItem[]
  onRowClick?: (row: TData) => void
  /** Highlights the row matching this id (used by the inline detail panel). */
  selectedRowId?: string
  /** Extracts a unique id from a row for selection highlighting. */
  getRowId?: (row: TData) => string
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterDef[]
  filterValues?: FilterValues
  onFiltersApply?: (values: FilterValues) => void
  onFiltersClear?: () => void
  className?: string
}

function isDateColumn(columnId: string): boolean {
  const normalizedColumnId = columnId.toLowerCase()

  return (
    normalizedColumnId.endsWith("_at") ||
    normalizedColumnId.endsWith("date") ||
    normalizedColumnId.includes("created") ||
    normalizedColumnId.includes("updated")
  )
}

function getTruncationClassName(columnId: string): string {
  const normalizedColumnId = columnId.toLowerCase()

  if (
    normalizedColumnId.includes("name") ||
    normalizedColumnId.includes("email") ||
    normalizedColumnId.includes("company") ||
    normalizedColumnId.includes("address")
  ) {
    return "max-w-[250px]"
  }

  if (
    normalizedColumnId.includes("status") ||
    normalizedColumnId.includes("type") ||
    normalizedColumnId.includes("source") ||
    normalizedColumnId.includes("stage")
  ) {
    return "max-w-[180px]"
  }

  if (isDateColumn(normalizedColumnId)) {
    return "max-w-[140px] whitespace-nowrap"
  }

  return "max-w-[160px]"
}

function formatMaybeDateValue(value: unknown, columnId: string): string {
  if (!isDateColumn(columnId) || typeof value !== "string") {
    return String(value)
  }

  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return value
  }

  return format(parsedValue, "yyyy-MM-dd HH:mm")
}

function renderPrimitiveCellValue(value: unknown, columnId: string): React.ReactNode {
  if (value == null || value === "") {
    return <span className="text-muted-foreground">—</span>
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const displayValue = formatMaybeDateValue(value, columnId)

    return (
      <span
        className={cn("block truncate", getTruncationClassName(columnId))}
        title={displayValue}
      >
        {displayValue}
      </span>
    )
  }

  return null
}

function renderTableState(state: React.ReactNode, colSpan: number, className?: string) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn("h-24 px-4 py-6 text-center", className)}>
        {state}
      </td>
    </tr>
  )
}

/**
 * Renders the shared CRM data table.
 */
export function DataTable<TData>({
  columns,
  data,
  title,
  actions,
  refreshButton,
  pagination,
  isLoading = false,
  error,
  emptyState,
  rowActions,
  onRowClick,
  selectedRowId,
  getRowId,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search",
  filters = [],
  filterValues = {},
  onFiltersApply,
  onFiltersClear,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const resolvedColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!rowActions) {
      return columns
    }

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
    ]
  }, [columns, rowActions])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the project-standard table engine for interactive grids in this codebase.
  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const hasToolbar =
    Boolean(onSearchChange) || filters.length > 0 || Boolean(onFiltersApply) || Boolean(onFiltersClear)
  const colSpan = resolvedColumns.length
  const startResult =
    pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const endResult =
    pagination && pagination.total > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.total)
      : 0

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden",
        className
      )}
    >
      {(title || refreshButton || actions) && (
        <div className="flex items-center justify-between pb-3">
          <div className="min-w-0">
            {typeof title === "string" ? (
              <h2 className="text-lg font-semibold">{title}</h2>
            ) : (
              title
            )}
          </div>
          {(refreshButton || actions) && (
            <div className="flex items-center gap-2">
              {refreshButton}
              <Button type="button" variant="ghost" size="icon" aria-label="More table actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm">
                Export
              </Button>
              {actions}
            </div>
          )}
        </div>
      )}
      {hasToolbar ? (
        <div className="flex min-w-0 items-center justify-between pb-2">
          <FilterBar
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            filters={filters}
            values={filterValues}
            onApply={onFiltersApply}
            onClear={onFiltersClear}
          />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-y border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id
                  const isActionsColumn = columnId === "__row_actions"

                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-3 py-1.5 text-left text-xs font-medium text-muted-foreground",
                        isActionsColumn ? "w-[1%] text-right" : ""
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() =>
                            header.column.toggleSorting(header.column.getIsSorted() === "asc")
                          }
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() ? (
                            <span className="text-[10px]">
                              {header.column.getIsSorted() === "asc" ? "▲" : "▼"}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading
              ? renderTableState(
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Spinner />
                    <span>Loading data...</span>
                  </div>,
                  colSpan
                )
              : error
                ? renderTableState(error, colSpan, "text-destructive")
                : table.getRowModel().rows.length > 0
                  ? table.getRowModel().rows.map((row) => {
                      const isSelected = Boolean(selectedRowId && getRowId && getRowId(row.original) === selectedRowId)
                      return (
                      <tr
                        key={row.id}
                        className={cn(
                          "group/row border-b border-border",
                          onRowClick ? "cursor-pointer transition-colors hover:bg-muted/50" : "",
                          isSelected && "bg-muted/60"
                        )}
                        onClick={(event) => {
                          if (!onRowClick) {
                            return
                          }

                          if (
                            (event.target as HTMLElement).closest(
                              "a,button,input,select,textarea,label,[role='button'],[data-actions-cell]"
                            )
                          ) {
                            return
                          }

                          onRowClick(row.original)
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const columnId = cell.column.id
                          const isActionsColumn = columnId === "__row_actions"
                          const rawValue = cell.getValue()
                          const renderedContent = cell.column.columnDef.cell
                            ? flexRender(cell.column.columnDef.cell, cell.getContext())
                            : renderPrimitiveCellValue(rawValue, columnId)
                          const resolvedContent =
                            typeof renderedContent === "string" ||
                            typeof renderedContent === "number"
                              ? renderPrimitiveCellValue(renderedContent, columnId)
                              : renderedContent ?? renderPrimitiveCellValue(rawValue, columnId)

                          return (
                            <td
                              key={cell.id}
                              className={cn(
                                "px-3 py-1 text-sm text-foreground",
                                isActionsColumn ? "w-[1%] whitespace-nowrap text-right" : ""
                              )}
                            >
                              {resolvedContent}
                            </td>
                          )
                        })}
                      </tr>
                    )})
                  : renderTableState(
                      emptyState ?? <span className="text-muted-foreground">No results.</span>,
                      colSpan
                    )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {startResult} to {endResult} of {pagination.total} results
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              className="rounded-md border border-border/60 px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
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
              className="rounded-md border border-border/60 px-3 py-1.5 text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
