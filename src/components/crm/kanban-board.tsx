/**
 * Generic read-only CRM kanban board grouped by a caller-provided column key.
 * Styled to match Twenty CRM's horizontal column layout.
 * @module components/crm/kanban-board
 */
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface KanbanColumn {
  /** Column key returned by `groupBy`. */
  key: string;
  /** User-facing column label. */
  label: string;
  /** Chip background/text class for the column header label. */
  toneClassName?: string;
  /** Border-top color class for the colored column indicator line. */
  topBorderClassName?: string;
}

interface KanbanBoardProps<T> {
  /** Optional board grouping label shown in the toolbar (e.g. "By Stage"). */
  boardLabel?: string;
  /** Flat list of items to group into columns. */
  items: T[];
  /** Available columns in render order. */
  columns: KanbanColumn[];
  /** Returns the column key for a given item. */
  groupBy: (item: T) => string;
  /** Renders the visual card body for each item. */
  renderCard: (item: T) => ReactNode;
  /** Called when a card is clicked and `getItemId` is provided. */
  onCardClick?: (id: string) => void;
  /** Optional stable id getter used for click payloads and React keys. */
  getItemId?: (item: T) => string;
  /** Returns a summary string (e.g. total value) for a column header. */
  getColumnSummary?: (columnKey: string, columnItems: T[]) => string | undefined;
  /** Empty-lane copy shown when a column has no items. */
  emptyStateMessage?: string;
}

export function KanbanBoard<T>({
  boardLabel,
  items,
  columns,
  groupBy,
  renderCard,
  onCardClick,
  getItemId,
  getColumnSummary,
  emptyStateMessage = "No items yet.",
}: KanbanBoardProps<T>) {
  const groupedItems = new Map<string, T[]>();

  for (const column of columns) {
    groupedItems.set(column.key, []);
  }

  for (const item of items) {
    const columnKey = groupBy(item);
    const columnItems = groupedItems.get(columnKey);
    if (columnItems) {
      columnItems.push(item);
    }
  }

  return (
    <div className="min-w-0">
      {boardLabel ? (
        <div className="flex items-center gap-1.5 pb-3 text-sm">
          <span className="font-medium text-foreground">{boardLabel}</span>
          <span className="text-muted-foreground">{items.length}</span>
        </div>
      ) : null}

      <div className="w-full min-w-0 overflow-x-auto pb-2">
        <div className="flex min-h-[60vh] w-max min-w-full gap-3">
          {columns.map((column) => {
            const columnItems = groupedItems.get(column.key) ?? [];
            const summary = getColumnSummary?.(column.key, columnItems);
            const hasStyledHeader = Boolean(column.toneClassName);

            return (
              <section
                key={column.key}
                className={cn(
                  "flex min-h-[60vh] w-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all md:w-72 md:flex-none",
                  column.topBorderClassName ? cn("border-t-[2.5px]", column.topBorderClassName) : "",
                )}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex flex-col">
                    {hasStyledHeader ? (
                      <span
                        className={cn(
                          "inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium",
                          column.toneClassName,
                        )}
                      >
                        {column.label}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-foreground">{column.label}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {hasStyledHeader ? columnItems.length : `Deals: ${columnItems.length}`}
                      {summary ? ` · ${summary}` : ""}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                  {columnItems.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-center text-sm text-muted-foreground">
                      {emptyStateMessage}
                    </p>
                  ) : (
                    columnItems.map((item, index) => {
                      const itemId = getItemId ? getItemId(item) : undefined;

                      return (
                        <div
                          key={itemId ?? index}
                          className={cn(
                            "group rounded-md border border-border bg-background p-4 shadow-xs transition hover:shadow-sm",
                            onCardClick && itemId ? "cursor-pointer" : "",
                          )}
                          onClick={() => {
                            if (onCardClick && itemId) {
                              onCardClick(itemId);
                            }
                          }}
                        >
                          {renderCard(item)}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
