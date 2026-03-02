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
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      {title ? (
        <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </h2>
        </div>
      ) : null}

      {data.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-zinc-600">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`overflow-x-auto ${mobileCardRenderer ? "hidden sm:block" : ""}`}>
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.header}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pageData.map((row, i) => (
                  <tr key={keyFn(row, start + i)} className="hover:bg-zinc-50/80">
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className={col.className ?? "px-4 py-4 text-sm text-zinc-600"}
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
            <div className="block sm:hidden divide-y divide-zinc-100">
              {pageData.map((row, i) => (
                <div key={keyFn(row, start + i)}>
                  {mobileCardRenderer(row, start + i)}
                </div>
              ))}
            </div>
          ) : null}

          {/* Pagination footer */}
          <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-600">
              Showing {start + 1}–{end} of {data.length}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9"
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
