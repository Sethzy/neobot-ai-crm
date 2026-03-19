/** Client-side paginated table wrapper. Receives full data array and paginates locally. */
"use client";

import { useState, type ReactNode } from "react";

type ColumnDef<T> = {
  header: string;
  /** Render a cell value from the row. */
  cell: (row: T) => ReactNode;
  /** Optional className for the td element. */
  className?: string;
};

type PaginatedTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  /** Unique key extractor per row. */
  keyFn: (row: T, index: number) => string;
  /** Title shown above the table. */
  title?: string;
  /** Message when data is empty. */
  emptyMessage?: string;
  /** Rows per page. Defaults to 20. */
  pageSize?: number;
  /** Optional mobile card renderer. When provided, cards show on mobile and table on sm+. */
  mobileCardRenderer?: (row: T, index: number) => ReactNode;
};

export function PaginatedTable<T>({
  data,
  columns,
  keyFn,
  title,
  emptyMessage = "No records found.",
  pageSize = 20,
  mobileCardRenderer,
}: PaginatedTableProps<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const start = page * pageSize;
  const end = Math.min(start + pageSize, data.length);
  const pageData = data.slice(start, end);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {title ? (
        <div className="border-b border-border bg-muted/30 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h2>
        </div>
      ) : null}

      {data.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`overflow-x-auto ${mobileCardRenderer ? "hidden sm:block" : ""}`}>
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/30">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.header}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {pageData.map((row, i) => (
                  <tr key={keyFn(row, start + i)} className="hover:bg-muted/20">
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className={col.className ?? "px-4 py-4 text-sm text-muted-foreground"}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          {mobileCardRenderer ? (
            <div className="block divide-y divide-border/70 sm:hidden">
              {pageData.map((row, i) => (
                <div key={keyFn(row, start + i)}>
                  {mobileCardRenderer(row, start + i)}
                </div>
              ))}
            </div>
          ) : null}

          {/* Pagination footer */}
          <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {start + 1}–{end} of {data.length}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
