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
    <div>
      {/* Board toolbar */}
      {boardLabel ? (
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-foreground">{boardLabel}</span>
            <span className="text-muted-foreground">{items.length}</span>
          </div>
          <div className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
            <span className="cursor-default hover:text-foreground">Filter</span>
            <span className="cursor-default hover:text-foreground">Sort</span>
            <span className="cursor-default hover:text-foreground">Options</span>
          </div>
        </div>
      ) : null}

      {/* Horizontal columns — fixed width per column, horizontal scroll */}
      <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2">
        {columns.map((column) => {
          const columnItems = groupedItems.get(column.key) ?? [];
          const summary = getColumnSummary?.(column.key, columnItems);

          return (
            <section
              key={column.key}
              className={cn(
                "flex min-w-[180px] flex-1 flex-col border-t-[2.5px]",
                column.topBorderClassName ?? "border-t-border",
              )}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 py-2.5">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    column.toneClassName ?? "bg-muted text-foreground/80",
                  )}
                >
                  {column.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {columnItems.length}
                </span>
                {summary ? (
                  <span className="text-xs text-muted-foreground">{summary}</span>
                ) : null}
              </div>

              {/* Cards */}
              <div className="flex flex-1 flex-col gap-2">
                {columnItems.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground/50">
                    No items
                  </p>
                ) : (
                  columnItems.map((item, index) => {
                    const itemId = getItemId ? getItemId(item) : undefined;

                    return (
                      <div
                        key={itemId ?? index}
                        className="cursor-pointer rounded-md border border-border/40 bg-card p-3 transition-colors hover:bg-accent/50"
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
  );
}
