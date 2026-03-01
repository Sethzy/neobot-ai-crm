/** Shared table wrapper with consistent styling and horizontal scroll on mobile. */
import type { ReactNode } from "react";

type DataTableProps = {
  title?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
  children: ReactNode;
};

export function DataTable({
  title,
  emptyMessage = "No records found.",
  isEmpty = false,
  children,
}: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E8DCC8] bg-white shadow-sm">
      {title ? (
        <div className="border-b border-[#E8DCC8] bg-[#FAF6EF] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </h2>
        </div>
      ) : null}

      <div className="overflow-x-auto">{children}</div>

      {isEmpty ? (
        <div className="p-10 text-center">
          <p className="text-sm text-zinc-600">{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
