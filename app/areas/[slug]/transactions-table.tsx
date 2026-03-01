/** Client-side paginated transactions table for area profile. */
"use client";

import Link from "next/link";
import { PaginatedTable } from "@/components/property/paginated-table";
import { formatDateMonthYear } from "@/lib/property/utils";

type CeaTransaction = {
  id: number;
  salesperson_reg_num: string | null;
  salesperson_name: string | null;
  transaction_date: string | null;
  property_type: string | null;
  transaction_type: string | null;
};

export function AreaTransactionsTableClient({
  transactions,
  areaName,
}: {
  transactions: CeaTransaction[];
  areaName: string;
}) {
  return (
    <PaginatedTable
      data={transactions}
      title={`Recent CEA Transactions in ${areaName}`}
      emptyMessage="No CEA transaction records were found for this area."
      keyFn={(row) => String(row.id)}
      columns={[
        {
          header: "Date",
          cell: (row) => formatDateMonthYear(row.transaction_date),
        },
        {
          header: "Agent",
          cell: (row) =>
            row.salesperson_reg_num ? (
              <Link
                href={`/agents/${row.salesperson_reg_num}`}
                className="font-medium text-zinc-900 hover:text-sunder-green"
              >
                {row.salesperson_name ?? row.salesperson_reg_num}
              </Link>
            ) : (
              "Unknown"
            ),
          className: "px-4 py-4 text-sm text-zinc-900",
        },
        {
          header: "Property Type",
          cell: (row) => row.property_type ?? "N/A",
        },
        {
          header: "Transaction Type",
          cell: (row) => row.transaction_type ?? "N/A",
        },
      ]}
      mobileCardRenderer={(row) => (
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-zinc-900">
              {row.salesperson_name ?? row.salesperson_reg_num ?? "Unknown"}
            </span>
            <span className="text-xs text-zinc-500">
              {formatDateMonthYear(row.transaction_date)}
            </span>
          </div>
          <p className="text-sm text-zinc-600">{row.property_type ?? "N/A"}</p>
          <p className="text-xs text-zinc-500">{row.transaction_type ?? "N/A"}</p>
        </div>
      )}
    />
  );
}
