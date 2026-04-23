/**
 * Applies saved-view column visibility and ordering to an existing column array.
 * @module components/crm/apply-view-columns
 */
import type { ColumnDef } from "@tanstack/react-table";

import type { CrmViewState } from "@/lib/crm/view-state";

function getColumnId<TData>(column: ColumnDef<TData, unknown>): string | null {
  if ("id" in column && typeof column.id === "string") {
    return column.id;
  }

  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey;
  }

  return null;
}

/**
 * Keeps the current columns as the source of truth, then narrows/reorders them
 * based on a saved view's column metadata.
 */
export function applyViewColumns<TData>(
  columns: ColumnDef<TData, unknown>[],
  viewState: Pick<CrmViewState, "columnOrder" | "columns"> | null | undefined,
) {
  if (!viewState) {
    return columns;
  }

  const visibleColumnIds = new Set(viewState.columns);
  const hasExplicitVisibility = visibleColumnIds.size > 0;
  const filteredColumns = hasExplicitVisibility
    ? columns.filter((column) => {
        const columnId = getColumnId(column);
        return columnId ? visibleColumnIds.has(columnId) : true;
      })
    : columns;

  if (filteredColumns.length === 0) {
    return columns;
  }

  if (viewState.columnOrder.length === 0) {
    return filteredColumns;
  }

  const orderIndexById = new Map(
    viewState.columnOrder.map((columnId, index) => [columnId, index]),
  );

  return [...filteredColumns].sort((leftColumn, rightColumn) => {
    const leftId = getColumnId(leftColumn);
    const rightId = getColumnId(rightColumn);
    const leftIndex =
      leftId && orderIndexById.has(leftId)
        ? orderIndexById.get(leftId)!
        : Number.MAX_SAFE_INTEGER;
    const rightIndex =
      rightId && orderIndexById.has(rightId)
        ? orderIndexById.get(rightId)!
        : Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex;
  });
}
