/**
 * CRM companies table with sortable columns and row navigation.
 * @module components/crm/companies-table
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
import { useMemo, useState, type MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import {
  formatCrmEnumLabel,
  getCompanyIndustryBadgeVariant,
} from "@/lib/crm/display";
import type { Company } from "@/lib/crm/schemas";

export interface CompanyTableRow
  extends Pick<
    Company,
    "company_id" | "name" | "industry" | "website" | "phone" | "email" | "address" | "updated_at"
  > {
  contactCount: number;
  dealCount: number;
}

const columnHelper = createColumnHelper<CompanyTableRow>();

interface CompaniesTableProps {
  companies: CompanyTableRow[];
  /** Called when a user clicks a row outside inline link/button controls. */
  onRowClick?: (companyId: string) => void;
}

export function CompaniesTable({ companies, onRowClick }: CompaniesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => <span className="font-medium text-foreground/90">{info.getValue()}</span>,
      }),
      columnHelper.accessor("industry", {
        header: "Industry",
        cell: (info) => {
          const industry = info.getValue();

          if (!industry) {
            return <span className="text-muted-foreground">—</span>;
          }

          return <Badge variant={getCompanyIndustryBadgeVariant(industry)}>{formatCrmEnumLabel(industry)}</Badge>;
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
      columnHelper.accessor("website", {
        header: "Website",
        cell: (info) => {
          const website = info.getValue();

          if (!website) {
            return <span className="text-muted-foreground">—</span>;
          }

          const websiteLabel = website.replace(/^https?:\/\//, "").replace(/\/$/, "");

          return (
            <a
              href={website}
              className="text-foreground/80 hover:underline"
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {websiteLabel}
            </a>
          );
        },
      }),
      columnHelper.accessor("contactCount", {
        header: "Contacts",
        cell: (info) => <span className="tabular-nums text-foreground/80">{info.getValue()}</span>,
      }),
      columnHelper.accessor("dealCount", {
        header: "Deals",
        cell: (info) => <span className="tabular-nums text-foreground/80">{info.getValue()}</span>,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: companies,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, companyId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }

    onRowClick?.(companyId);
  };

  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground">No companies yet</p>
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
              onClick={(event) => handleRowClick(event, row.original.company_id)}
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
