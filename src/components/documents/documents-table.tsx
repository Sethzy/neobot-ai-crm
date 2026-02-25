/**
 * TanStack Table for displaying documents.
 * Shows document list with actions and status badges.
 * @module components/documents/documents-table
 */
'use client';

import { useState, useMemo, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type VisibilityState,
  type Header,
  type SortingState,
} from "@tanstack/react-table";
import { ExternalLink, Download, Trash2, GripVertical, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "./status-badge";
import { DuplicateIndicator } from "./duplicate-indicator";
import { cn, formatTagLabel } from "@/lib/utils";
import type { Document } from "@/types/documents";

/**
 * Draggable column header for dnd-kit integration.
 */
function DraggableHeader({
  header,
  children,
}: {
  header: Header<Document, unknown>;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: header.id });

  const style = {
    // Use Translate (not Transform) to avoid scale issues during drag
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: header.getSize() !== 150 ? header.getSize() : undefined,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
      data-dnd-draggable
    >
      <div className="flex items-center gap-1">
        <GripVertical
          className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab hover:text-muted-foreground/60"
          data-testid="column-drag-handle"
          {...attributes}
          {...listeners}
        />
        {children}
      </div>
    </th>
  );
}

/**
 * Formats ISO date string to human readable format (e.g., "6 Jan 2026")
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface DocumentsTableProps {
  /** Documents to display */
  documents: Document[];
  /** Callback when view button clicked */
  onView: (doc: Document) => void;
  /** Returns URL for viewing a document (enables ctrl+click to open in new tab) */
  getViewUrl?: (doc: Document) => string;
  /** Callback when download button clicked */
  onDownload: (doc: Document) => void;
  /** Callback when delete button clicked */
  onDelete: (doc: Document) => void;
  /** Column visibility state */
  columnVisibility?: VisibilityState;
  /** Called when column visibility changes */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  /** Column order - array of column IDs */
  columnOrder?: string[];
  /** Called when column order changes */
  onColumnOrderChange?: (order: string[]) => void;
}

const columnHelper = createColumnHelper<Document>();

/**
 * Table displaying documents with actions.
 * Supports sorting by filename.
 * Wrapped with memo() to prevent unnecessary re-renders.
 */
export const DocumentsTable = memo(function DocumentsTable({
  documents,
  onView,
  getViewUrl,
  onDownload,
  onDelete,
  columnVisibility = {},
  onColumnVisibilityChange,
  columnOrder = [],
  onColumnOrderChange,
}: DocumentsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  /** Memoized columns to prevent recreation on every render */
  const columns = useMemo(
    () => [
      columnHelper.display({
      id: "index",
      header: "#",
      cell: ({ row, table }) => {
        const visualIndex = table.getRowModel().rows.findIndex(r => r.id === row.id) + 1;
        return (
          <span className="text-muted-foreground/70 tabular-nums">{visualIndex}</span>
        );
      },
      size: 40,
    }),
    columnHelper.display({
      id: "duplicate_status",
      header: "",
      cell: (info) => {
        const doc = info.row.original;
        // Only show for completed documents
        if (doc.status !== "complete") return null;
        return (
          <DuplicateIndicator
            status={doc.duplicate_status as "none" | "detected" | null}
            pageRanges={doc.page_ranges as { startPage: number; endPage: number; potential_duplicate: string | null }[] | null}
          />
        );
      },
      size: 32,
    }),
    columnHelper.accessor("original_filename", {
      header: "Filename",
      cell: (info) => {
        const doc = info.row.original;
        const displayName = doc.renamed_filename || doc.original_filename;
        const showOriginal = doc.renamed_filename && doc.renamed_filename !== doc.original_filename;

        return (
          <div className="flex flex-col">
            <span>{displayName}</span>
            {showOriginal && (
              <span className="text-xs text-muted-foreground">
                {doc.original_filename}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("description", {
      header: "Description",
      cell: (info) => {
        const description = info.getValue();
        if (!description) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="line-clamp-2 cursor-default block">
                  {description}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      size: 100,
      cell: (info) => {
        const isProcessing =
          info.row.original.status === "uploaded" ||
          info.row.original.status === "processing";

        const viewUrl = getViewUrl?.(info.row.original);

        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
            {viewUrl ? (
              <Link
                href={viewUrl}
                onClick={(e) => {
                  // Let browser handle ctrl/cmd+click natively (opens new tab)
                  if (e.ctrlKey || e.metaKey) return;
                  e.preventDefault();
                  onView(info.row.original);
                }}
                onMouseEnter={() => {
                  // Prefetch PDF viewer chunk on hover for instant loading
                  import("@/components/documents/pdf-viewer-pane");
                }}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isProcessing && "pointer-events-none opacity-50"
                )}
                aria-label="View document"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onView(info.row.original)}
                aria-label="View document"
                disabled={isProcessing}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDownload(info.row.original)}
              aria-label="Download document"
              disabled={isProcessing}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(info.row.original)}
              aria-label="Delete document"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    }),
    columnHelper.accessor("primary_tag", {
      header: "Tags",
      size: 160,
      cell: (info) => {
        const doc = info.row.original;
        const primaryTag = doc.primary_tag;
        // V2: tags is Record<string, number>, extract keys excluding primary
        const tagsRecord = (doc.tags || {}) as Record<string, number>;
        const secondaryTags = Object.keys(tagsRecord).filter(
          (t) => t !== primaryTag
        );

        if (!primaryTag) {
          return <span className="text-muted-foreground">—</span>;
        }

        const tagLabel = formatTagLabel(primaryTag);

        if (secondaryTags.length === 0) {
          return <Badge variant="secondary" className="text-foreground/80">{tagLabel}</Badge>;
        }

        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
            <Badge variant="secondary" className="text-foreground/80">{tagLabel}</Badge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs text-foreground/80 cursor-default">
                    +{secondaryTags.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {secondaryTags.map(formatTagLabel).join(", ")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: ({ column }) => {
        const isSorted = column.getIsSorted();
        return (
          <button
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => column.toggleSorting()}
          >
            Status
            {isSorted === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-50" />
            )}
          </button>
        );
      },
      size: 100,
      sortingFn: (rowA, rowB) => {
        // Sort by is_reviewed: reviewed items first when desc
        const aReviewed = (rowA.original as { is_reviewed?: boolean }).is_reviewed ? 1 : 0;
        const bReviewed = (rowB.original as { is_reviewed?: boolean }).is_reviewed ? 1 : 0;
        return aReviewed - bReviewed;
      },
      cell: (info) => {
        const doc = info.row.original;
        // Show "Reviewed" if document is reviewed, otherwise show processing status
        const displayStatus = (doc as { is_reviewed?: boolean }).is_reviewed
          ? "reviewed"
          : (doc.status as "uploaded" | "processing" | "complete" | "failed");
        return (
          <StatusBadge
            status={displayStatus}
            errorMessage={doc.processing_error}
          />
        );
      },
    }),
    // Column for sorting by creation date
    columnHelper.accessor("created_at", {
      header: "Created",
      cell: (info) => (
        <span className="whitespace-nowrap">{formatDate(info.getValue())}</span>
      ),
    }),
    ],
    [onView, onDownload, onDelete, getViewUrl]
  );

  const table = useReactTable({
    data: documents,
    columns,
    state: {
      columnVisibility,
      columnOrder,
      sorting,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: onColumnVisibilityChange
      ? (updater) => {
          const newVisibility =
            typeof updater === "function" ? updater(columnVisibility) : updater;
          onColumnVisibilityChange(newVisibility);
        }
      : undefined,
    onColumnOrderChange: onColumnOrderChange
      ? (updater) => {
          const newOrder =
            typeof updater === "function" ? updater(columnOrder) : updater;
          onColumnOrderChange(newOrder);
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && onColumnOrderChange) {
      // Get valid column IDs from the table
      const validColumnIds = table.getAllLeafColumns().map((c) => c.id);

      // Use columnOrder only if it's valid (contains actual column IDs, not null/corrupted)
      const isColumnOrderValid =
        columnOrder.length > 0 &&
        columnOrder.every((id) => typeof id === "string" && validColumnIds.includes(id));

      const currentOrder = isColumnOrderValid ? columnOrder : validColumnIds;

      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over?.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
        onColumnOrderChange(newOrder);
      }
    }
  };

  const headerIds =
    table.getHeaderGroups()[0]?.headers.map((h) => h.id) ?? [];

  /** Renders standard (non-draggable) header row */
  const renderStandardHeaders = () =>
    table.getHeaderGroups().map((headerGroup) => (
      <tr key={headerGroup.id}>
        {headerGroup.headers.map((header) => (
          <th
            key={header.id}
            className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
            style={{
              width: header.getSize() !== 150 ? header.getSize() : undefined,
            }}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </th>
        ))}
      </tr>
    ));

  /** Renders draggable header row with dnd-kit */
  const renderDraggableHeaders = () =>
    table.getHeaderGroups().map((headerGroup) => (
      <tr key={headerGroup.id}>
        <SortableContext
          items={headerIds}
          strategy={horizontalListSortingStrategy}
        >
          {headerGroup.headers.map((header) => (
            <DraggableHeader key={header.id} header={header}>
              {flexRender(header.column.columnDef.header, header.getContext())}
            </DraggableHeader>
          ))}
        </SortableContext>
      </tr>
    ));

  const tableContent = (
    <table className="w-full">
      <thead className="border-b border-border/40 bg-muted/20">
        {onColumnOrderChange ? renderDraggableHeaders() : renderStandardHeaders()}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const isProcessing =
            row.original.status === "uploaded" ||
            row.original.status === "processing";

          return (
            <tr
              key={row.id}
              className={cn(
                "border-b border-border/30 hover:bg-muted/40 transition-colors",
                isProcessing && "opacity-60"
              )}
            >
              {row.getVisibleCells().map((cell) => {
                const isTopAligned = ["original_filename", "description"].includes(cell.column.id);
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      "px-5 py-4 text-sm text-foreground/80",
                      isTopAligned && "align-top"
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm">
      {onColumnOrderChange ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {tableContent}
        </DndContext>
      ) : (
        tableContent
      )}
    </div>
  );
});
