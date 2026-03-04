/**
 * Generic read-only CRM kanban board grouped by a caller-provided column key.
 * @module components/crm/kanban-board
 */
"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

interface KanbanColumn {
  /** Column key returned by `groupBy`. */
  key: string;
  /** User-facing column label. */
  label: string;
}

interface KanbanBoardProps<T> {
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
}

export function KanbanBoard<T>({
  items,
  columns,
  groupBy,
  renderCard,
  onCardClick,
  getItemId,
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
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => {
        const columnItems = groupedItems.get(column.key) ?? [];

        return (
          <section
            key={column.key}
            className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border/40 bg-muted/10"
          >
            <header className="flex items-center gap-2 border-b border-border/30 px-3 py-2.5">
              <span className="text-sm font-medium">{column.label}</span>
              <Badge variant="secondary" className="text-[10px]">
                {columnItems.length}
              </Badge>
            </header>

            <div className="flex flex-col gap-2 p-2">
              {columnItems.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground/50">No items</p>
              ) : (
                columnItems.map((item, index) => {
                  const itemId = getItemId ? getItemId(item) : undefined;

                  return (
                    <div
                      key={itemId ?? index}
                      className="cursor-pointer rounded-lg border border-border/30 bg-card p-3 shadow-sm transition-colors hover:bg-muted/30"
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
  );
}
