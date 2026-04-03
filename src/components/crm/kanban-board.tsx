/**
 * Generic CRM kanban board with optional drag-and-drop column changes.
 * @module components/crm/kanban-board
 */
"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

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

interface KanbanBoardBaseProps<T> {
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
  /** Returns a summary string (e.g. total value) for a column header. */
  getColumnSummary?: (columnKey: string, columnItems: T[]) => string | undefined;
  /** Empty-lane copy shown when a column has no items. */
  emptyStateMessage?: string;
}

interface StaticKanbanBoardProps<T> extends KanbanBoardBaseProps<T> {
  /** Optional stable id getter used for click payloads and React keys. */
  getItemId?: (item: T) => string;
  /** Optional async handler that enables draggable column changes when provided. */
  onColumnChange?: undefined;
}

interface DraggableKanbanBoardProps<T> extends KanbanBoardBaseProps<T> {
  /** Stable id getter required for drag-and-drop interactions. */
  getItemId: (item: T) => string;
  /** Called after a card is dropped into a different column. */
  onColumnChange: (itemId: string, fromColumn: string, toColumn: string) => Promise<void>;
}

type KanbanBoardProps<T> = StaticKanbanBoardProps<T> | DraggableKanbanBoardProps<T>;

interface KanbanCardShellProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

interface KanbanColumnSectionProps {
  children: ReactNode;
  className?: string;
  column: KanbanColumn;
  itemCount: number;
  summary?: string;
  setNodeRef?: (element: HTMLElement | null) => void;
}

interface DraggableCardProps<T> {
  item: T;
  itemId: string;
  columnKey: string;
  onCardClick?: (id: string) => void;
  renderCard: (item: T) => ReactNode;
}

interface DroppableColumnProps {
  children: ReactNode;
  column: KanbanColumn;
  itemCount: number;
  summary?: string;
}

interface KanbanDragOverlayProps<T> {
  activeItem: T | null;
  renderCard: (item: T) => ReactNode;
}

const boardColumnClassName =
  "flex min-h-[60vh] w-full flex-1 flex-col overflow-hidden md:w-64 md:flex-none";

const boardCardClassName =
  "group rounded-lg border border-border bg-[#FAFAF8] px-3 py-3 transition hover:shadow-sm dark:bg-card";

/**
 * Build grouped column buckets, optionally honoring optimistic drag overrides first.
 */
function groupItemsByColumn<T>({
  columns,
  getItemId,
  groupBy,
  items,
  optimisticMoves,
}: {
  columns: KanbanColumn[];
  getItemId?: (item: T) => string;
  groupBy: (item: T) => string;
  items: T[];
  optimisticMoves?: Map<string, string>;
}) {
  const groupedItems = new Map<string, T[]>();

  for (const column of columns) {
    groupedItems.set(column.key, []);
  }

  for (const item of items) {
    const optimisticColumnKey = getItemId ? optimisticMoves?.get(getItemId(item)) : undefined;
    const columnKey = optimisticColumnKey ?? groupBy(item);
    const columnItems = groupedItems.get(columnKey);

    if (columnItems) {
      columnItems.push(item);
    }
  }

  return groupedItems;
}

/**
 * Shared card shell so the static and draggable paths stay visually identical.
 */
function KanbanCardShell({ children, className, onClick, style }: KanbanCardShellProps) {
  return (
    <div
      className={cn(boardCardClassName, className)}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Shared column frame used by both render paths.
 */
function KanbanColumnSection({
  children,
  className,
  column,
  itemCount,
  summary,
  setNodeRef,
}: KanbanColumnSectionProps) {
  return (
    <section
      ref={setNodeRef}
      className={cn(boardColumnClassName, className)}
    >
      <div className="flex items-center gap-2 px-2 pb-3">
        {column.toneClassName ? (
          <span
            className={cn(
              "inline-flex rounded px-2 py-0.5 text-xs font-medium",
              column.toneClassName,
            )}
          >
            {column.label}
          </span>
        ) : (
          <span className="text-xs font-semibold text-foreground">{column.label}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {summary ?? itemCount}
        </span>
      </div>

      {children}
    </section>
  );
}

/**
 * Static card renderer for the read-only board path.
 */
function StaticCard<T>({
  item,
  itemId,
  onCardClick,
  renderCard,
}: {
  item: T;
  itemId?: string;
  onCardClick?: (id: string) => void;
  renderCard: (item: T) => ReactNode;
}) {
  return (
    <KanbanCardShell
      className={onCardClick && itemId ? "cursor-pointer" : ""}
      onClick={() => {
        if (onCardClick && itemId) {
          onCardClick(itemId);
        }
      }}
    >
      {renderCard(item)}
    </KanbanCardShell>
  );
}

/**
 * Draggable card wrapper used only when column changes are enabled.
 */
function DraggableCard<T>({
  item,
  itemId,
  columnKey,
  onCardClick,
  renderCard,
}: DraggableCardProps<T>) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: itemId,
    data: {
      columnKey,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(onCardClick ? "cursor-pointer" : "", isDragging ? "opacity-30" : "")}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (onCardClick) {
          onCardClick(itemId);
        }
      }}
    >
      <KanbanCardShell>{renderCard(item)}</KanbanCardShell>
    </div>
  );
}

/**
 * Droppable column wrapper that highlights the active drop target.
 */
function DroppableColumn({
  children,
  column,
  itemCount,
  summary,
}: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.key,
    data: {
      columnLabel: column.label,
    },
  });

  return (
    <KanbanColumnSection
      column={column}
      itemCount={itemCount}
      setNodeRef={setNodeRef}
      summary={summary}
      className={isOver ? "ring-2 ring-primary/30" : ""}
    >
      {children}
    </KanbanColumnSection>
  );
}

/**
 * Drag overlay clone for the active card.
 */
function KanbanDragOverlay<T>({ activeItem, renderCard }: KanbanDragOverlayProps<T>) {
  return (
    <DragOverlay>
      {activeItem ? (
        <KanbanCardShell className="shadow-lg">
          {renderCard(activeItem)}
        </KanbanCardShell>
      ) : null}
    </DragOverlay>
  );
}

/**
 * Shared board frame and toolbar used by both render paths.
 */
function KanbanBoardFrame({
  boardLabel,
  children,
  totalItems,
}: {
  boardLabel?: string;
  children: ReactNode;
  totalItems: number;
}) {
  return (
    <div className="min-w-0">
      {boardLabel ? (
        <div className="flex items-center gap-1.5 pb-3 text-sm">
          <span className="font-medium text-foreground">{boardLabel}</span>
          <span className="text-muted-foreground">{totalItems}</span>
        </div>
      ) : null}

      <div className="w-full min-w-0 overflow-x-auto pb-2">
        <div className="flex min-h-[60vh] w-max min-w-full gap-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * Read-only board path. This preserves the original behavior when dragging is disabled.
 */
function StaticKanbanBoardContent<T>({
  boardLabel,
  columns,
  emptyStateMessage,
  getColumnSummary,
  getItemId,
  groupBy,
  items,
  onCardClick,
  renderCard,
}: StaticKanbanBoardProps<T> & {
  emptyStateMessage: string;
}) {
  const groupedItems = groupItemsByColumn({
    columns,
    getItemId,
    groupBy,
    items,
  });

  return (
    <KanbanBoardFrame boardLabel={boardLabel} totalItems={items.length}>
      {columns.map((column) => {
        const columnItems = groupedItems.get(column.key) ?? [];
        const summary = getColumnSummary?.(column.key, columnItems);

        return (
          <KanbanColumnSection
            key={column.key}
            column={column}
            itemCount={columnItems.length}
            summary={summary}
          >
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2">
              {columnItems.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-center text-sm text-muted-foreground">
                  {emptyStateMessage}
                </p>
              ) : (
                columnItems.map((item, index) => {
                  const itemId = getItemId ? getItemId(item) : undefined;

                  return (
                    <StaticCard
                      key={itemId ?? index}
                      item={item}
                      itemId={itemId}
                      onCardClick={onCardClick}
                      renderCard={renderCard}
                    />
                  );
                })
              )}
            </div>
          </KanbanColumnSection>
        );
      })}
    </KanbanBoardFrame>
  );
}

/**
 * Draggable board path. Optimistic column overrides stay local to the board.
 */
function DraggableKanbanBoardContent<T>({
  boardLabel,
  columns,
  emptyStateMessage,
  getColumnSummary,
  getItemId,
  groupBy,
  items,
  onCardClick,
  onColumnChange,
  renderCard,
}: DraggableKanbanBoardProps<T> & {
  emptyStateMessage: string;
}) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Map<string, string>>(() => new Map());
  const clickResetTimeoutRef = useRef<number | null>(null);
  const wasDraggingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const columnLabels = useMemo(
    () =>
      new Map(columns.map((column) => [column.key, column.label])),
    [columns],
  );

  const groupedItems = useMemo(
    () =>
      groupItemsByColumn({
        columns,
        getItemId,
        groupBy,
        items,
        optimisticMoves,
      }),
    [columns, getItemId, groupBy, items, optimisticMoves],
  );

  const activeItem = useMemo(
    () => items.find((item) => getItemId(item) === activeItemId) ?? null,
    [activeItemId, getItemId, items],
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const fromColumnKey = active.data.current?.columnKey;
        const fromLabel =
          typeof fromColumnKey === "string"
            ? columnLabels.get(fromColumnKey) ?? fromColumnKey
            : undefined;

        return fromLabel ? `Picked up a card from ${fromLabel}.` : "Picked up a card.";
      },
      onDragOver({ over }) {
        if (!over) {
          return "Card is not over a column.";
        }

        const targetColumn = columnLabels.get(String(over.id)) ?? String(over.id);
        return `Card is over ${targetColumn}.`;
      },
      onDragEnd({ active, over }) {
        const fromColumnKey = active.data.current?.columnKey;
        const fromLabel =
          typeof fromColumnKey === "string"
            ? columnLabels.get(fromColumnKey) ?? fromColumnKey
            : undefined;

        if (!over) {
          return fromLabel ? `Card was returned to ${fromLabel}.` : "Card was returned.";
        }

        const targetColumn = columnLabels.get(String(over.id)) ?? String(over.id);
        return fromLabel
          ? `Card moved from ${fromLabel} to ${targetColumn}.`
          : `Card moved to ${targetColumn}.`;
      },
      onDragCancel() {
        return "Card movement cancelled.";
      },
    }),
    [columnLabels],
  );

  useEffect(() => {
    if (optimisticMoves.size === 0) {
      return;
    }

    setOptimisticMoves((currentMoves) => {
      if (currentMoves.size === 0) {
        return currentMoves;
      }

      let nextMoves: Map<string, string> | null = null;

      for (const item of items) {
        const itemId = getItemId(item);
        const optimisticColumnKey = currentMoves.get(itemId);

        if (optimisticColumnKey && groupBy(item) === optimisticColumnKey) {
          nextMoves ??= new Map(currentMoves);
          nextMoves.delete(itemId);
        }
      }

      return nextMoves ?? currentMoves;
    });
  }, [getItemId, groupBy, items, optimisticMoves.size]);

  useEffect(() => {
    return () => {
      if (clickResetTimeoutRef.current !== null) {
        window.clearTimeout(clickResetTimeoutRef.current);
      }
    };
  }, []);

  function suppressPostDragClick() {
    wasDraggingRef.current = true;

    if (clickResetTimeoutRef.current !== null) {
      window.clearTimeout(clickResetTimeoutRef.current);
    }

    clickResetTimeoutRef.current = window.setTimeout(() => {
      wasDraggingRef.current = false;
      clickResetTimeoutRef.current = null;
    }, 0);
  }

  function shouldSuppressCardClick() {
    if (!wasDraggingRef.current) {
      return false;
    }

    wasDraggingRef.current = false;
    return true;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveItemId(String(event.active.id));
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setActiveItemId(null);
    suppressPostDragClick();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const itemId = String(event.active.id);
    const fromColumnKey = event.active.data.current?.columnKey;
    const toColumnKey = event.over ? String(event.over.id) : null;

    setActiveItemId(null);
    suppressPostDragClick();

    if (typeof fromColumnKey !== "string" || !toColumnKey || fromColumnKey === toColumnKey) {
      return;
    }

    setOptimisticMoves((currentMoves) => {
      const nextMoves = new Map(currentMoves);
      nextMoves.set(itemId, toColumnKey);
      return nextMoves;
    });

    try {
      await onColumnChange(itemId, fromColumnKey, toColumnKey);
    } catch {
      setOptimisticMoves((currentMoves) => {
        if (!currentMoves.has(itemId)) {
          return currentMoves;
        }

        const nextMoves = new Map(currentMoves);
        nextMoves.delete(itemId);
        return nextMoves;
      });
    }
  }

  return (
    <DndContext
      accessibility={{ announcements }}
      collisionDetection={closestCenter}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <KanbanBoardFrame boardLabel={boardLabel} totalItems={items.length}>
        {columns.map((column) => {
          const columnItems = groupedItems.get(column.key) ?? [];
          const summary = getColumnSummary?.(column.key, columnItems);

          return (
            <DroppableColumn
              key={column.key}
              column={column}
              itemCount={columnItems.length}
              summary={summary}
            >
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2">
                {columnItems.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-center text-sm text-muted-foreground">
                    {emptyStateMessage}
                  </p>
                ) : (
                  columnItems.map((item) => {
                    const itemId = getItemId(item);

                    return (
                      <DraggableCard
                        key={itemId}
                        columnKey={column.key}
                        item={item}
                        itemId={itemId}
                        onCardClick={(nextItemId) => {
                          if (shouldSuppressCardClick()) {
                            return;
                          }

                          onCardClick?.(nextItemId);
                        }}
                        renderCard={renderCard}
                      />
                    );
                  })
                )}
              </div>
            </DroppableColumn>
          );
        })}
      </KanbanBoardFrame>

      <KanbanDragOverlay activeItem={activeItem} renderCard={renderCard} />
    </DndContext>
  );
}

export function KanbanBoard<T>({
  emptyStateMessage = "No items yet.",
  ...props
}: KanbanBoardProps<T>) {
  if (props.onColumnChange) {
    return (
      <DraggableKanbanBoardContent
        {...props}
        emptyStateMessage={emptyStateMessage}
      />
    );
  }

  return (
    <StaticKanbanBoardContent
      {...props}
      emptyStateMessage={emptyStateMessage}
    />
  );
}
