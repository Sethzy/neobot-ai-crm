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
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {title ? (
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h2>
        </div>
      ) : null}

      <div className="overflow-x-auto">{children}</div>

      {isEmpty ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
