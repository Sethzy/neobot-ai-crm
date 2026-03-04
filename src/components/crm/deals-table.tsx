/**
 * CRM deals table with sortable columns and row navigation.
 * @module components/crm/deals-table
 */
"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";

import { StageBadge } from "@/components/crm/stage-badge";
import { formatContactFullName, formatCrmDate, formatCrmPrice } from "@/lib/crm/display";
import type { DealWithContact } from "@/hooks/use-deals";

const columnHelper = createColumnHelper<DealWithContact>();

interface DealsTableProps {
  deals: DealWithContact[];
}

export function DealsTable({ deals }: DealsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("address", {
        header: "Address",
        cell: (info) => {
          const address = info.getValue();
          const dealId = info.row.original.deal_id;

          return (
            <Link
              href={`/crm/deals/${dealId}`}
              className="font-medium text-foreground/90 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {address}
            </Link>
          );
        },
      }),
      columnHelper.accessor("stage", {
        header: "Stage",
        cell: (info) => <StageBadge stage={info.getValue()} />,
      }),
      columnHelper.accessor("price", {
        header: "Price",
        cell: (info) => <span className="tabular-nums text-foreground/80">{formatCrmPrice(info.getValue())}</span>,
      }),
      columnHelper.display({
        id: "contact",
        header: "Contact",
        enableSorting: false,
        cell: ({ row }) => {
          const primary = row.original.deal_contacts?.find((dc) => dc.is_primary)
            ?? row.original.deal_contacts?.[0];

          if (!primary?.contacts) {
            return <span className="text-muted-foreground">—</span>;
          }

          return formatContactFullName(primary.contacts);
        },
      }),
      columnHelper.accessor("updated_at", {
        header: "Updated",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatCrmDate(info.getValue())}</span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: deals,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, dealId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }

    router.push(`/crm/deals/${dealId}`);
  };

  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground">No deals yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 md:px-5 md:py-4"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t border-border/30 transition-colors hover:bg-muted/40"
              onMouseEnter={() => router.prefetch(`/crm/deals/${row.original.deal_id}`)}
              onClick={(event) => handleRowClick(event, row.original.deal_id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-3 text-[13px] text-foreground/80 md:px-5 md:py-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
