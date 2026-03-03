/**
 * CRM contacts table with sortable columns and row navigation.
 * @module components/crm/contacts-table
 */
"use client";

import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { contactTypeBadgeVariantMap, formatContactFullName, formatCrmDate } from "@/lib/crm/display";
import type { Contact } from "@/lib/crm/schemas";

const columnHelper = createColumnHelper<Contact>();

interface ContactsTableProps {
  contacts: Contact[];
}

export function ContactsTable({ contacts }: ContactsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "name",
        header: "Name",
        cell: ({ row }) => formatContactFullName(row.original),
        sortingFn: (rowA, rowB) => {
          const contactA = formatContactFullName(rowA.original);
          const contactB = formatContactFullName(rowB.original);
          return contactA.localeCompare(contactB);
        },
      }),
      columnHelper.accessor("email", {
        header: "Email",
        cell: (info) => {
          const email = info.getValue();
          if (!email) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <a
              href={`mailto:${email}`}
              className="text-foreground/80 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {email}
            </a>
          );
        },
      }),
      columnHelper.accessor("phone", {
        header: "Phone",
        cell: (info) => {
          const phone = info.getValue();
          if (!phone) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <a
              href={`tel:${phone}`}
              className="text-foreground/80 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {phone}
            </a>
          );
        },
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => {
          const type = info.getValue();
          return <Badge variant={contactTypeBadgeVariantMap[type]}>{type}</Badge>;
        },
      }),
      columnHelper.accessor("updated_at", {
        header: "Last Updated",
        cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{formatCrmDate(info.getValue())}</span>,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: contacts,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, contactId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }

    router.push(`/crm/contacts/${contactId}`);
  };

  if (contacts.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground">No contacts yet</p>
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
              onMouseEnter={() => router.prefetch(`/crm/contacts/${row.original.contact_id}`)}
              onClick={(event) => handleRowClick(event, row.original.contact_id)}
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
