/**
 * Cases table component using TanStack Table.
 * Displays cases with sortable columns and navigation.
 * Supports column reordering via drag-and-drop.
 * @module components/cases/cases-table
 */
'use client';

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type Header,
} from "@tanstack/react-table";
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
import { GripVertical } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { Case } from "@/types/cases";

/**
 * Draggable column header for dnd-kit integration.
 */
function DraggableHeader({
  header,
  children,
}: {
  header: Header<Case, unknown>;
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
      className="px-3 md:px-5 py-3 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
    >
      <div className="flex items-center gap-1">
        <GripVertical
          className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab flex-shrink-0 hover:text-muted-foreground/60"
          {...attributes}
          {...listeners}
        />
        {children}
      </div>
    </th>
  );
}

const columnHelper = createColumnHelper<Case>();

/**
 * Formats a date string to "2 Dec 2025" format.
 * @param dateString - ISO date string or null
 * @returns Formatted date or em-dash for null
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

interface CasesTableProps {
  /** Array of cases to display */
  cases: Case[];
}

/**
 * Renders a sortable table of cases.
 * Clicking a row navigates to the case detail page.
 */
export function CasesTable({ cases }: CasesTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updated_at", desc: false },
  ]);
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    "cases-table-column-order",
    []
  );

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, caseId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }
    router.push(`/cases/${caseId}`);
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "index",
        header: "#",
        size: 40,
        cell: ({ row, table }) => {
          const visualIndex = table.getRowModel().rows.findIndex(r => r.id === row.id) + 1;
          return (
            <span className="text-muted-foreground/70 tabular-nums">{visualIndex}</span>
          );
        },
      }),
      columnHelper.accessor("case_ref", {
        header: "Ref",
        size: 120,
        cell: (info) => (
          <Link
            href={`/cases/${info.row.original.id}`}
            className="text-left hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("case_name", {
        header: "Name",
        size: 160,
        cell: (info) => (
          <Link
            href={`/cases/${info.row.original.id}`}
            className="text-left hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("description", {
        header: "Description",
        size: 200,
        cell: (info) => {
          const description = info.getValue();
          if (!description) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="line-clamp-2 cursor-default">
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
      columnHelper.accessor("case_opened_at", {
        header: "Created",
        size: 135,
        cell: (info) => (
          <span className="whitespace-nowrap">{formatDate(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("event_date", {
        header: "Event Date",
        size: 130,
        cell: (info) => (
          <span className="whitespace-nowrap">{formatDate(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("updated_at", {
        header: "Last Updated",
        size: 140,
        cell: (info) => (
          <span className="whitespace-nowrap">{formatDate(info.getValue())}</span>
        ),
      }),
    ],
    [router]
  );

  const table = useReactTable({
    data: cases,
    columns,
    state: { sorting, columnOrder },
    onSortingChange: setSorting,
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
    if (active.id !== over?.id) {
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
        setColumnOrder(newOrder);
      }
    }
  };

  const headerIds = table.getHeaderGroups()[0]?.headers.map((h) => h.id) ?? [];

  const tableContent = (
    <table className="w-full min-w-[800px]">
      <thead className="border-b border-border/40 bg-muted/20">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            <SortableContext
              items={headerIds}
              strategy={horizontalListSortingStrategy}
            >
              {headerGroup.headers.map((header) => (
                <DraggableHeader key={header.id} header={header}>
                  <div
                    className="flex items-center gap-1 cursor-pointer hover:text-foreground/80 whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </DraggableHeader>
              ))}
            </SortableContext>
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            className="border-t border-border/30 hover:bg-muted/40 cursor-pointer transition-colors"
            onMouseEnter={() => router.prefetch(`/cases/${row.original.id}`)}
            onClick={(event) => handleRowClick(event, row.original.id)}
          >
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-3 md:px-5 py-3 md:py-4 text-[13px] text-foreground/80">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm overflow-x-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {tableContent}
      </DndContext>
    </div>
  );
}
